import { Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SCORESHEET_VISION_CLIENT, type ScoresheetVisionClient } from './scoresheet-vision-client';
import { SCORESHEET_OCR_QUEUE } from '../queue/queue.module';
import type { ScoresheetOcrJobData } from './scoresheets.service';
import { postProcessScoresheet } from './scoresheet-postprocess';

// Reverse of EventsService's SCORESHEET_CONTENT_TYPE_EXTENSIONS — the worker
// only has the storageKey (its extension), not the original upload's
// Content-Type header, so it re-derives the mime type from the file
// extension baked into the key.
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

function contentTypeForStorageKey(storageKey: string): string {
  const extension = storageKey.split('.').pop() ?? '';
  return EXTENSION_CONTENT_TYPES[extension] ?? 'application/octet-stream';
}

// The provider's message is raw English HTTP detail ("[GoogleGenerativeAI
// Error]: … [503 Service Unavailable] This model is currently experiencing
// high demand"), and failureReason is rendered verbatim to a French club
// manager. A transient saturation is worth naming because the action it calls
// for differs from an unreadable photo: wait and relaunch, don't re-shoot the
// sheet.
const TRANSIENT_PROVIDER_ERROR =
  /\b(429|500|502|503|504)\b|overload|high demand|unavailable|quota|rate limit|timeout/i;

function failureReasonFor(error: Error): string {
  return TRANSIENT_PROVIDER_ERROR.test(error.message)
    ? "Le service d'analyse était momentanément saturé. Relancez l'analyse dans quelques minutes."
    : error.message;
}

@Processor(SCORESHEET_OCR_QUEUE)
export class ScoresheetOcrProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(SCORESHEET_VISION_CLIENT) private readonly vision: ScoresheetVisionClient,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  /**
   * Tells whoever uploaded the sheet how the read went.
   *
   * The uploader specifically, not the team's managers: OCR runs minutes
   * after an upload nobody else is waiting on, and this is the one person
   * who asked for it and who will do the confirming. `EventScoresheet`
   * records them as a TeamPlayer, so the account behind it is resolved
   * through Player.userId — null for a rostered player with no account,
   * in which case there is nobody to notify and this is a no-op.
   *
   * Best-effort throughout: a notification must never turn a successful OCR
   * job into a failed one, nor add a second failure on top of a failed one.
   */
  private async notifyUploader(
    eventScoresheetId: string,
    outcome: { type: 'SCORESHEET_READY' | 'SCORESHEET_FAILED'; title: string; body: string },
  ): Promise<void> {
    try {
      const scoresheet = await this.prisma.eventScoresheet.findUnique({
        where: { id: eventScoresheetId },
        select: {
          eventId: true,
          uploadedBy: {
            select: {
              player: { select: { userId: true } },
              team: {
                select: { id: true, clubTeams: { select: { clubId: true, isOwner: true } } },
              },
            },
          },
        },
      });

      // A null uploader (their roster slot was deleted) has nobody to tell.
      const userId = scoresheet?.uploadedBy?.player.userId;
      if (!scoresheet?.uploadedBy || !userId) return;

      const clubId = await this.resolveNavigationClubId(userId, scoresheet.uploadedBy.team);
      if (!clubId) return;

      await this.notifications.notify([
        {
          userId,
          type: outcome.type,
          title: outcome.title,
          body: outcome.body,
          deepLink: `/clubs/${clubId}/teams/${scoresheet.uploadedBy.team.id}/events/${scoresheet.eventId}`,
        },
      ]);
    } catch {
      // The event, the scoresheet or the roster entry may have been deleted
      // between enqueue and here. Swallowed for the same reason onFailed's
      // own writes are: a missing row must not surface as an unhandled
      // rejection inside a BullMQ event listener.
    }
  }

  /**
   * Picks the club to put in the deep link for a CTC-shared team: the one the
   * recipient actually belongs to, falling back to the owning club. Same
   * reasoning as TeamsService.toMyTeamSummary and DashboardService's agenda —
   * linking through a club the reader has no membership in would 403 in
   * ClubRolesGuard the moment they tapped the notification.
   */
  private async resolveNavigationClubId(
    userId: string,
    team: { clubTeams: { clubId: string; isOwner: boolean }[] },
  ): Promise<string | null> {
    const clubIds = team.clubTeams.map((link) => link.clubId);
    if (clubIds.length === 0) return null;

    const membership = await this.prisma.clubMembership.findFirst({
      where: { userId, clubId: { in: clubIds } },
      select: { clubId: true },
    });

    return (
      membership?.clubId ??
      team.clubTeams.find((link) => link.isOwner)?.clubId ??
      clubIds[0] ??
      null
    );
  }

  async process(job: Job<ScoresheetOcrJobData>): Promise<void> {
    const { eventScoresheetId } = job.data;
    const scoresheet = await this.prisma.eventScoresheet.findUniqueOrThrow({
      where: { id: eventScoresheetId },
    });
    await this.prisma.eventScoresheet.update({
      where: { id: eventScoresheetId },
      data: { status: 'PROCESSING' },
    });

    const buffer = await this.storage.getObjectBuffer(scoresheet.storageKey);
    const contentType = contentTypeForStorageKey(scoresheet.storageKey);
    const { parsedData: visionData, rawResponse } = await this.vision.extractScoresheet(
      buffer,
      contentType,
    );
    // rawResponse keeps the model's untouched reply; parsedData is what the
    // app reads, so the derived per-player points go there.
    const { parsedData, confidence, consistent } = postProcessScoresheet(visionData);
    const attemptCount = job.attemptsMade + 1;

    const rawResponseJson = rawResponse as Prisma.InputJsonValue;
    const parsedDataJson = parsedData as unknown as Prisma.InputJsonValue;
    await this.prisma.scoresheetExtraction.upsert({
      where: { eventScoresheetId },
      create: {
        eventScoresheetId,
        rawResponse: rawResponseJson,
        parsedData: parsedDataJson,
        confidence,
        attemptCount,
      },
      update: {
        rawResponse: rawResponseJson,
        parsedData: parsedDataJson,
        confidence,
        attemptCount,
        failureReason: null,
      },
    });
    await this.prisma.eventScoresheet.update({
      where: { id: eventScoresheetId },
      data: { status: consistent ? 'PARSED' : 'NEEDS_REVIEW' },
    });

    await this.notifyUploader(eventScoresheetId, {
      type: 'SCORESHEET_READY',
      title: 'Feuille de match analysée',
      body: consistent
        ? 'La feuille de match a été lue. Vérifiez les statistiques puis validez-les.'
        : 'La feuille de match a été lue, mais certains totaux ne concordent pas. Une relecture est nécessaire avant validation.',
    });
  }

  // Fires after BullMQ has exhausted every retry (job.opts.attempts) — a
  // mid-series failure just lets the next attempt run, only the last one
  // needs to flip the scoresheet to a terminal FAILED state.
  @OnWorkerEvent('failed')
  async onFailed(job: Job<ScoresheetOcrJobData> | undefined, error: Error): Promise<void> {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) {
      return;
    }
    const { eventScoresheetId } = job.data;
    try {
      await this.prisma.eventScoresheet.update({
        where: { id: eventScoresheetId },
        data: { status: 'FAILED' },
      });
      await this.prisma.scoresheetExtraction.upsert({
        where: { eventScoresheetId },
        create: {
          eventScoresheetId,
          rawResponse: {},
          parsedData: {},
          attemptCount: job.attemptsMade,
          failureReason: failureReasonFor(error),
        },
        update: { attemptCount: job.attemptsMade, failureReason: failureReasonFor(error) },
      });
      await this.notifyUploader(eventScoresheetId, {
        type: 'SCORESHEET_FAILED',
        title: 'Échec de l’analyse de la feuille de match',
        // The same actionable French string the review screen renders — it
        // already explains what to do next (usually "relancez l'analyse dans
        // quelques minutes"), so there is nothing to add here.
        body: failureReasonFor(error),
      });
    } catch {
      // Best-effort: the EventScoresheet/Event may have been deleted between
      // enqueue and this final retry, in which case there's nothing left to
      // mark FAILED — swallowed so a missing row doesn't surface as an
      // unhandled rejection inside a BullMQ 'failed' event listener.
    }
  }
}
