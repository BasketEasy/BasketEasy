import { Inject } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import type { Prisma } from '@prisma/client';
import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SCORESHEET_VISION_CLIENT, type ScoresheetVisionClient } from './scoresheet-vision-client';
import { SCORESHEET_OCR_QUEUE } from '../queue/queue.module';
import type { ScoresheetOcrJobData } from './scoresheets.service';

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

// Checks internal consistency rather than rejecting partial data — a
// scoresheet photo with a fully illegible section still has a usable
// partial read, it just needs a human to fill the gaps (NEEDS_REVIEW) rather
// than being thrown away.
function isConsistent(data: ParsedScoresheetData): boolean {
  const quartersSum = (side: 'home' | 'away'): number | null => {
    if (data.quarterScores.length === 0 || data.quarterScores.some((q) => q[side] == null)) {
      return null;
    }
    return data.quarterScores.reduce((sum, q) => sum + (q[side] ?? 0), 0);
  };

  const homeSum = quartersSum('home');
  if (homeSum !== null && data.homeScore !== null && homeSum !== data.homeScore) {
    return false;
  }
  const awaySum = quartersSum('away');
  if (awaySum !== null && data.awayScore !== null && awaySum !== data.awayScore) {
    return false;
  }
  return true;
}

// Heuristic, not a model-reported score (Gemini's structured-output mode
// doesn't return one) — the fraction of leaf fields the model actually
// populated versus left null, as a rough signal of how legible the source
// photo was for a reviewer deciding how much to double-check.
function computeConfidence(data: ParsedScoresheetData): number {
  const values: unknown[] = [
    data.homeScore,
    data.awayScore,
    ...data.quarterScores.flatMap((q) => [q.home, q.away]),
    ...data.players.flatMap((p) => [p.number, p.name, p.points, p.fouls]),
  ];
  if (values.length === 0) {
    return 0;
  }
  const populated = values.filter((v) => v !== null && v !== undefined).length;
  return Math.round((populated / values.length) * 100) / 100;
}

@Processor(SCORESHEET_OCR_QUEUE)
export class ScoresheetOcrProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(SCORESHEET_VISION_CLIENT) private readonly vision: ScoresheetVisionClient,
  ) {
    super();
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
    const { parsedData, rawResponse } = await this.vision.extractScoresheet(buffer, contentType);
    const attemptCount = job.attemptsMade + 1;
    const confidence = computeConfidence(parsedData);

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
      data: { status: isConsistent(parsedData) ? 'PARSED' : 'NEEDS_REVIEW' },
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
          failureReason: error.message,
        },
        update: { attemptCount: job.attemptsMade, failureReason: error.message },
      });
    } catch {
      // Best-effort: the EventScoresheet/Event may have been deleted between
      // enqueue and this final retry, in which case there's nothing left to
      // mark FAILED — swallowed so a missing row doesn't surface as an
      // unhandled rejection inside a BullMQ 'failed' event listener.
    }
  }
}
