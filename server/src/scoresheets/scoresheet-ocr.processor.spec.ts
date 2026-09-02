import { ScoresheetOcrProcessor } from './scoresheet-ocr.processor';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { ScoresheetVisionClient } from './scoresheet-vision-client';

describe('ScoresheetOcrProcessor', () => {
  let processor: ScoresheetOcrProcessor;
  let prisma: {
    eventScoresheet: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
    scoresheetExtraction: { upsert: jest.Mock };
  };
  let storage: { getObjectBuffer: jest.Mock };
  let vision: { extractScoresheet: jest.Mock };

  const consistentData = {
    homeScore: 60,
    awayScore: 55,
    quarterScores: [
      { home: 15, away: 14 },
      { home: 15, away: 14 },
      { home: 15, away: 14 },
      { home: 15, away: 13 },
    ],
    players: [],
    scoringPlays: [],
  };

  beforeEach(() => {
    prisma = {
      eventScoresheet: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'sheet-1',
          storageKey: 'scoresheets/event-1/abc.jpg',
        }),
        update: jest.fn(),
      },
      scoresheetExtraction: { upsert: jest.fn() },
    };
    storage = { getObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-image')) };
    vision = {
      extractScoresheet: jest
        .fn()
        .mockResolvedValue({ parsedData: consistentData, rawResponse: consistentData }),
    };
    processor = new ScoresheetOcrProcessor(
      prisma as unknown as PrismaService,
      storage as unknown as StorageService,
      vision as unknown as ScoresheetVisionClient,
    );
  });

  function makeJob(overrides: Partial<{ attemptsMade: number; opts: { attempts?: number } }> = {}) {
    return {
      data: { eventScoresheetId: 'sheet-1' },
      attemptsMade: 0,
      opts: {},
      ...overrides,
    } as never;
  }

  describe('process', () => {
    it('sets status to PROCESSING, then fetches the image with the mime type derived from the storageKey extension', async () => {
      await processor.process(makeJob());

      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'PROCESSING' },
      });
      expect(storage.getObjectBuffer).toHaveBeenCalledWith('scoresheets/event-1/abc.jpg');
      expect(vision.extractScoresheet).toHaveBeenCalledWith(
        Buffer.from('fake-image'),
        'image/jpeg',
      );
    });

    it('persists the extraction (including a computed confidence) and marks the scoresheet PARSED when the quarter scores are internally consistent', async () => {
      await processor.process(makeJob());

      expect(prisma.scoresheetExtraction.upsert).toHaveBeenCalledWith({
        where: { eventScoresheetId: 'sheet-1' },
        create: {
          eventScoresheetId: 'sheet-1',
          rawResponse: consistentData,
          parsedData: consistentData,
          confidence: 1,
          attemptCount: 1,
        },
        update: {
          rawResponse: consistentData,
          parsedData: consistentData,
          confidence: 1,
          attemptCount: 1,
          failureReason: null,
        },
      });
      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'PARSED' },
      });
    });

    it('marks the scoresheet NEEDS_REVIEW when the quarter scores do not sum to the total', async () => {
      vision.extractScoresheet.mockResolvedValue({
        parsedData: { ...consistentData, homeScore: 99 },
        rawResponse: {},
      });

      await processor.process(makeJob());

      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'NEEDS_REVIEW' },
      });
    });

    it('does not flag a review when quarter data is incomplete (nothing to sum-check yet)', async () => {
      vision.extractScoresheet.mockResolvedValue({
        parsedData: {
          homeScore: 60,
          awayScore: 55,
          quarterScores: [{ home: null, away: null }],
          players: [],
          scoringPlays: [],
        },
        rawResponse: {},
      });

      await processor.process(makeJob());

      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'PARSED' },
      });
    });

    it('derives each player\u2019s points from the running-score plays, keyed by team and jersey number', async () => {
      const play = (
        team: 'home' | 'away',
        jerseyNumber: number,
        points: number,
        runningScore: number,
      ) => ({ team, jerseyNumber, points, runningScore });
      vision.extractScoresheet.mockResolvedValue({
        parsedData: {
          homeScore: 8,
          awayScore: 2,
          quarterScores: [],
          players: [
            { team: 'home', number: 7, name: 'Johan', points: null, fouls: 1 },
            { team: 'home', number: 9, name: 'Jules', points: null, fouls: 0 },
            // Same jersey number as a home player, different team.
            { team: 'away', number: 7, name: 'Marc', points: null, fouls: 2 },
          ],
          scoringPlays: [
            play('home', 7, 3, 3),
            play('home', 9, 2, 5),
            play('home', 7, 1, 6),
            play('home', 7, 2, 8),
            play('away', 7, 2, 2),
          ],
        },
        rawResponse: {},
      });

      await processor.process(makeJob());

      const { parsedData } = prisma.scoresheetExtraction.upsert.mock.calls[0][0].create;
      expect(parsedData.players).toEqual([
        { team: 'home', number: 7, name: 'Johan', points: 6, fouls: 1 },
        { team: 'home', number: 9, name: 'Jules', points: 2, fouls: 0 },
        { team: 'away', number: 7, name: 'Marc', points: 2, fouls: 2 },
      ]);
      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'PARSED' },
      });
    });

    it('records 0 points for a player whose team scored but who never appears in the running score', async () => {
      vision.extractScoresheet.mockResolvedValue({
        parsedData: {
          homeScore: null,
          awayScore: null,
          quarterScores: [],
          players: [
            { team: 'home', number: 4, name: 'Malo', points: null, fouls: 0 },
            // Away column was never read, so this stays unknown rather than 0.
            { team: 'away', number: 4, name: 'Arthur', points: null, fouls: 0 },
          ],
          scoringPlays: [{ team: 'home', jerseyNumber: 5, points: 2, runningScore: 2 }],
        },
        rawResponse: {},
      });

      await processor.process(makeJob());

      const { parsedData } = prisma.scoresheetExtraction.upsert.mock.calls[0][0].create;
      expect(parsedData.players).toEqual([
        { team: 'home', number: 4, name: 'Malo', points: 0, fouls: 0 },
        { team: 'away', number: 4, name: 'Arthur', points: null, fouls: 0 },
      ]);
    });

    it('marks the scoresheet NEEDS_REVIEW when a team\u2019s running-score plays do not add up to its final score', async () => {
      vision.extractScoresheet.mockResolvedValue({
        parsedData: {
          ...consistentData,
          scoringPlays: [{ team: 'home', jerseyNumber: 7, points: 2, runningScore: 2 }],
        },
        rawResponse: {},
      });

      await processor.process(makeJob());

      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'NEEDS_REVIEW' },
      });
    });

    it('marks the scoresheet NEEDS_REVIEW when a play is worth an impossible number of points', async () => {
      vision.extractScoresheet.mockResolvedValue({
        parsedData: {
          ...consistentData,
          homeScore: null,
          scoringPlays: [{ team: 'home', jerseyNumber: 7, points: 4, runningScore: 4 }],
        },
        rawResponse: {},
      });

      await processor.process(makeJob());

      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'NEEDS_REVIEW' },
      });
    });

    it('does not sum-check a team whose running-score column was only partially read', async () => {
      vision.extractScoresheet.mockResolvedValue({
        parsedData: {
          ...consistentData,
          scoringPlays: [
            { team: 'home', jerseyNumber: 7, points: 2, runningScore: 2 },
            { team: 'home', jerseyNumber: null, points: null, runningScore: 4 },
          ],
        },
        rawResponse: {},
      });

      await processor.process(makeJob());

      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'PARSED' },
      });
    });

    it('computes a lower confidence when fewer fields were populated', async () => {
      vision.extractScoresheet.mockResolvedValue({
        parsedData: {
          homeScore: 60,
          awayScore: null,
          quarterScores: [],
          players: [],
          scoringPlays: [],
        },
        rawResponse: {},
      });

      await processor.process(makeJob());

      expect(prisma.scoresheetExtraction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ confidence: 0.5 }) }),
      );
    });
  });

  describe('onFailed', () => {
    it('does nothing when retries remain', async () => {
      await processor.onFailed(
        makeJob({ attemptsMade: 1, opts: { attempts: 3 } }),
        new Error('boom'),
      );

      expect(prisma.eventScoresheet.update).not.toHaveBeenCalled();
    });

    it('marks the scoresheet FAILED once every retry is exhausted', async () => {
      await processor.onFailed(
        makeJob({ attemptsMade: 3, opts: { attempts: 3 } }),
        new Error('boom'),
      );

      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'FAILED' },
      });
      expect(prisma.scoresheetExtraction.upsert).toHaveBeenCalledWith({
        where: { eventScoresheetId: 'sheet-1' },
        create: {
          eventScoresheetId: 'sheet-1',
          rawResponse: {},
          parsedData: {},
          attemptCount: 3,
          failureReason: 'boom',
        },
        update: { attemptCount: 3, failureReason: 'boom' },
      });
    });

    it('is a no-op when the job is undefined', async () => {
      await processor.onFailed(undefined, new Error('boom'));

      expect(prisma.eventScoresheet.update).not.toHaveBeenCalled();
    });

    it('swallows a missing-row error instead of throwing an unhandled rejection', async () => {
      prisma.eventScoresheet.update.mockRejectedValue(new Error('Record not found'));

      await expect(
        processor.onFailed(makeJob({ attemptsMade: 3, opts: { attempts: 3 } }), new Error('boom')),
      ).resolves.toBeUndefined();
    });
  });
});
