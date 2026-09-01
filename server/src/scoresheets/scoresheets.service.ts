import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import type {
  ConfirmScoresheetExtractionRequest,
  ScoresheetExtraction,
} from '@basketeasy/types/scoresheet-extraction';
import { PrismaService } from '../prisma/prisma.service';
import { SCORESHEET_OCR_QUEUE } from '../queue/queue.module';

// BullMQ retries a failed job this many times (exponential backoff, set at
// enqueue time) before the processor gives up and marks the scoresheet
// FAILED — see ScoresheetOcrProcessor's 'failed' listener.
const OCR_JOB_ATTEMPTS = 3;
const OCR_JOB_BACKOFF_DELAY_MS = 5000;

export interface ScoresheetOcrJobData {
  eventScoresheetId: string;
}

@Injectable()
export class ScoresheetsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SCORESHEET_OCR_QUEUE) private readonly ocrQueue: Queue<ScoresheetOcrJobData>,
  ) {}

  // Called by EventsService right after confirmScoresheetUpload persists the
  // EventScoresheet row — this module owns the async parsing lifecycle from
  // here on, EventsService just hands off the id. Enqueues before writing
  // QUEUED (not after): if the Redis/BullMQ call throws, the row is left at
  // its previous status (UPLOADED) instead of being permanently stranded at
  // QUEUED with no job ever created and no worker to pick it up.
  // jobId: eventScoresheetId lets BullMQ dedupe — a re-upload while the
  // previous job is still queued/processing replaces it instead of running
  // two extractions concurrently against the same row.
  async enqueueOcr(eventScoresheetId: string): Promise<void> {
    await this.ocrQueue.add(
      'extract',
      { eventScoresheetId },
      {
        jobId: eventScoresheetId,
        attempts: OCR_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: OCR_JOB_BACKOFF_DELAY_MS },
      },
    );
    await this.prisma.eventScoresheet.update({
      where: { id: eventScoresheetId },
      data: { status: 'QUEUED' },
    });
  }

  async getExtraction(
    clubId: string,
    teamId: string,
    eventId: string,
  ): Promise<ScoresheetExtraction | null> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    const scoresheet = await this.prisma.eventScoresheet.findUnique({
      where: { eventId },
      include: { extraction: true },
    });
    if (!scoresheet) {
      return null;
    }
    return this.toScoresheetExtraction(scoresheet.status, scoresheet.extraction);
  }

  async confirmExtraction(
    clubId: string,
    teamId: string,
    eventId: string,
    reviewerUserId: string,
    request: ConfirmScoresheetExtractionRequest,
  ): Promise<ScoresheetExtraction> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    const scoresheet = await this.prisma.eventScoresheet.findUnique({
      where: { eventId },
      include: { extraction: true },
    });
    if (!scoresheet || !scoresheet.extraction) {
      throw new NotFoundException('Aucune extraction à confirmer pour cette feuille de match');
    }
    // Deliberately doesn't re-run ScoresheetOcrProcessor's isConsistent check
    // on `corrections` — a manager confirming/editing the data is the human
    // review step NEEDS_REVIEW exists to route to, so their corrected values
    // are trusted as ground truth rather than re-validated against the same
    // heuristic that flagged the original read.
    const extraction = await this.prisma.scoresheetExtraction.update({
      where: { id: scoresheet.extraction.id },
      data: {
        ...(request.corrections
          ? { parsedData: request.corrections as unknown as Prisma.InputJsonValue }
          : {}),
        reviewedByUserId: reviewerUserId,
        reviewedAt: new Date(),
      },
    });
    await this.prisma.eventScoresheet.update({
      where: { id: scoresheet.id },
      data: { status: 'CONFIRMED' },
    });
    return this.toScoresheetExtraction('CONFIRMED', extraction);
  }

  private toScoresheetExtraction(
    status: string,
    extraction: {
      parsedData: unknown;
      confidence: number | null;
      failureReason: string | null;
      reviewedByUserId: string | null;
      reviewedAt: Date | null;
    } | null,
  ): ScoresheetExtraction {
    return {
      status: status as ScoresheetExtraction['status'],
      parsedData: (extraction?.parsedData as ScoresheetExtraction['parsedData']) ?? null,
      confidence: extraction?.confidence ?? null,
      failureReason: extraction?.failureReason ?? null,
      reviewedByUserId: extraction?.reviewedByUserId ?? null,
      reviewedAt: extraction?.reviewedAt?.toISOString() ?? null,
    };
  }

  // Duplicated from EventsService rather than imported across modules — same
  // defense-in-depth re-verification pattern (see CLAUDE.md's Teams module
  // section), kept local since this module doesn't otherwise depend on
  // EventsService.
  private async assertEventInTeam(clubId: string, teamId: string, eventId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.teamId !== teamId) {
      throw new NotFoundException('Event not found');
    }
    if (event.type !== 'MATCH') {
      throw new BadRequestException('La feuille de match ne concerne que les matchs');
    }
  }
}
