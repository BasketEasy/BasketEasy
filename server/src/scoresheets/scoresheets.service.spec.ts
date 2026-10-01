import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';
import { ScoresheetsService } from './scoresheets.service';
import { PrismaService } from '../prisma/prisma.service';
import { SCORESHEET_OCR_QUEUE } from '../queue/queue.module';

describe('ScoresheetsService', () => {
  let service: ScoresheetsService;
  let queue: { add: jest.Mock; getJob?: jest.Mock };
  let prisma: {
    clubTeam: { findUnique: jest.Mock };
    event: { findUnique: jest.Mock };
    eventScoresheet: { findUnique: jest.Mock; update: jest.Mock };
    scoresheetExtraction: { update: jest.Mock };
    teamPlayer: { findMany: jest.Mock; findFirst: jest.Mock };
    matchPlayerStat: { deleteMany: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const matchEvent = { id: 'event-1', teamId: 'team-1', type: 'MATCH', venue: 'HOME' };
  // parsedData is a non-null column the OCR processor always writes in full,
  // so every extraction mock carries the whole shape rather than a partial.
  const emptyParsedData = {
    homeScore: null,
    awayScore: null,
    quarterScores: [],
    players: [],
    scoringPlays: [],
  };

  beforeEach(async () => {
    prisma = {
      clubTeam: { findUnique: jest.fn() },
      event: { findUnique: jest.fn() },
      eventScoresheet: { findUnique: jest.fn(), update: jest.fn() },
      scoresheetExtraction: { update: jest.fn() },
      teamPlayer: { findMany: jest.fn(), findFirst: jest.fn() },
      matchPlayerStat: { deleteMany: jest.fn(), createMany: jest.fn() },
      // Runs the callback against the same mock, so assertions on
      // matchPlayerStat/scoresheetExtraction see the transactional writes.
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
    prisma.event.findUnique.mockResolvedValue(matchEvent);
    prisma.teamPlayer.findMany.mockResolvedValue([]);
    prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScoresheetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: getQueueToken(SCORESHEET_OCR_QUEUE), useValue: queue },
      ],
    }).compile();

    service = module.get<ScoresheetsService>(ScoresheetsService);
  });

  describe('enqueueOcr', () => {
    it('adds a deduped job (jobId = eventScoresheetId) before setting the scoresheet to QUEUED', async () => {
      const calls: string[] = [];
      queue.add.mockImplementation(async () => {
        calls.push('add');
      });
      prisma.eventScoresheet.update.mockImplementation(async () => {
        calls.push('update');
      });

      await service.enqueueOcr('sheet-1');

      expect(queue.add).toHaveBeenCalledWith(
        'extract',
        { eventScoresheetId: 'sheet-1' },
        {
          jobId: 'sheet-1',
          attempts: 5,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'QUEUED' },
      });
      // Enqueue must happen first — if it throws, the row should stay at its
      // previous status rather than being stranded at QUEUED with no job.
      expect(calls).toEqual(['add', 'update']);
    });

    it('replaceStale: refuses (409) when the old job is still held by a worker, adding nothing', async () => {
      queue.getJob = jest.fn().mockResolvedValue({
        remove: jest.fn().mockRejectedValue(new Error('locked')),
      });

      await expect(service.enqueueOcr('sheet-1', { replaceStale: true })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(queue.add).not.toHaveBeenCalled();
      expect(prisma.eventScoresheet.update).not.toHaveBeenCalled();
    });

    it('does not touch the DB when the queue add fails, so the row is not stranded at QUEUED', async () => {
      queue.add.mockRejectedValue(new Error('Redis unavailable'));

      await expect(service.enqueueOcr('sheet-1')).rejects.toThrow('Redis unavailable');

      expect(prisma.eventScoresheet.update).not.toHaveBeenCalled();
    });
  });

  describe('retryOcr', () => {
    const uploadedSheet = {
      id: 'sheet-1',
      status: 'FAILED',
      uploadedByTeamPlayerId: 'tp-1',
      uploadedAt: new Date('2026-09-01T20:00:00Z'),
    };

    it('re-enqueues the archived file and puts the sheet back in the queue', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue(uploadedSheet);

      const result = await service.retryOcr('club-1', 'team-1', 'event-1', 'user-1');

      expect(queue.add).toHaveBeenCalledWith(
        'extract',
        { eventScoresheetId: 'sheet-1' },
        expect.objectContaining({ jobId: 'sheet-1' }),
      );
      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'QUEUED' },
      });
      expect(result).toEqual({
        status: 'QUEUED',
        uploadedByTeamPlayerId: 'tp-1',
        uploadedAt: '2026-09-01T20:00:00.000Z',
      });
    });

    it('throws ForbiddenException for a caller who is not on the roster', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue(null);

      await expect(service.retryOcr('club-1', 'team-1', 'event-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when nothing has been uploaded to re-read', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue(null);

      await expect(service.retryOcr('club-1', 'team-1', 'event-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    // Re-reading the photo over a manager's reviewed data would replace
    // ground truth with a fresh guess, and the MatchPlayerStat rows folded
    // from it with another.
    it('refuses to re-read a sheet a manager has already confirmed', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        ...uploadedSheet,
        status: 'CONFIRMED',
      });

      await expect(service.retryOcr('club-1', 'team-1', 'event-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('getExtraction', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.getExtraction('club-1', 'team-1', 'event-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the event is not a MATCH', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...matchEvent, type: 'TRAINING' });

      await expect(service.getExtraction('club-1', 'team-1', 'event-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns null when no scoresheet has been uploaded yet', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue(null);

      await expect(service.getExtraction('club-1', 'team-1', 'event-1')).resolves.toBeNull();
    });

    it('returns the scoresheet status with a null extraction when the OCR job has not finished', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({ status: 'QUEUED', extraction: null });

      const result = await service.getExtraction('club-1', 'team-1', 'event-1');

      expect(result).toEqual({
        status: 'QUEUED',
        parsedData: null,
        confidence: null,
        failureReason: null,
        reviewedByUserId: null,
        reviewedAt: null,
        suggestedRosterMapping: [],
      });
    });

    it('returns the parsed data once the extraction exists', async () => {
      const parsedData = { ...emptyParsedData, homeScore: 60, awayScore: 55 };
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        status: 'PARSED',
        extraction: {
          parsedData,
          confidence: 0.9,
          failureReason: null,
          reviewedByUserId: null,
          reviewedAt: null,
        },
      });

      const result = await service.getExtraction('club-1', 'team-1', 'event-1');

      expect(result).toEqual({
        status: 'PARSED',
        parsedData,
        confidence: 0.9,
        failureReason: null,
        reviewedByUserId: null,
        reviewedAt: null,
        suggestedRosterMapping: [],
      });
    });

    // ScoresheetOcrProcessor's 'failed' listener writes `parsedData: {}` (the
    // column is non-nullable), so the read path has to report "nothing was
    // extracted" instead of treating the placeholder as a sheet and indexing
    // into arrays that aren't there.
    it('reports a failed extraction as having no parsed data rather than throwing', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        status: 'FAILED',
        extraction: {
          parsedData: {},
          confidence: null,
          failureReason: 'vision timeout',
          reviewedByUserId: null,
          reviewedAt: null,
        },
      });

      const result = await service.getExtraction('club-1', 'team-1', 'event-1');

      expect(result).toEqual({
        status: 'FAILED',
        parsedData: null,
        confidence: null,
        failureReason: 'vision timeout',
        reviewedByUserId: null,
        reviewedAt: null,
        suggestedRosterMapping: [],
      });
    });

    it('treats a truncated read missing one of the arrays as no parsed data', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        status: 'NEEDS_REVIEW',
        extraction: {
          parsedData: { homeScore: 60, awayScore: 55, quarterScores: [], players: [] },
          confidence: 0.4,
          failureReason: null,
          reviewedByUserId: null,
          reviewedAt: null,
        },
      });

      const result = await service.getExtraction('club-1', 'team-1', 'event-1');

      expect(result?.parsedData).toBeNull();
      expect(result?.suggestedRosterMapping).toEqual([]);
    });
  });

  describe('confirmExtraction', () => {
    it('throws NotFoundException when there is no extraction to confirm', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({ id: 'sheet-1', extraction: null });

      await expect(
        service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', { rosterMapping: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses to confirm a failed extraction that carries no parsed data', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        id: 'sheet-1',
        extraction: { id: 'extraction-1', parsedData: {} },
      });

      await expect(
        service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', { rosterMapping: [] }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.scoresheetExtraction.update).not.toHaveBeenCalled();
      expect(prisma.matchPlayerStat.deleteMany).not.toHaveBeenCalled();
    });

    it('marks the extraction and scoresheet CONFIRMED, recording the reviewer', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        id: 'sheet-1',
        extraction: { id: 'extraction-1', parsedData: emptyParsedData },
      });
      prisma.scoresheetExtraction.update.mockResolvedValue({
        parsedData: { ...emptyParsedData, homeScore: 60, awayScore: 55 },
        confidence: null,
        failureReason: null,
        reviewedByUserId: 'user-1',
        reviewedAt: new Date('2026-09-01T12:00:00Z'),
      });

      const result = await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
        rosterMapping: [],
      });

      expect(prisma.scoresheetExtraction.update).toHaveBeenCalledWith({
        where: { id: 'extraction-1' },
        data: { reviewedByUserId: 'user-1', reviewedAt: expect.any(Date) },
      });
      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { status: 'CONFIRMED' },
      });
      expect(result.status).toBe('CONFIRMED');
      expect(result.reviewedByUserId).toBe('user-1');
    });

    it('overwrites parsedData with the supplied corrections', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        id: 'sheet-1',
        extraction: { id: 'extraction-1', parsedData: emptyParsedData },
      });
      const corrections = {
        homeScore: 61,
        awayScore: 55,
        quarterScores: [],
        players: [],
        scoringPlays: [],
      };
      prisma.scoresheetExtraction.update.mockResolvedValue({
        parsedData: corrections,
        confidence: null,
        failureReason: null,
        reviewedByUserId: 'user-1',
        reviewedAt: new Date('2026-09-01T12:00:00Z'),
      });

      await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
        corrections,
        rosterMapping: [],
      });

      expect(prisma.scoresheetExtraction.update).toHaveBeenCalledWith({
        where: { id: 'extraction-1' },
        data: {
          parsedData: corrections,
          reviewedByUserId: 'user-1',
          reviewedAt: expect.any(Date),
        },
      });
    });

    // The mapping is what turns a read of a piece of paper into per-player
    // season stats — see docs/decisions/scoresheets-and-stats.md.
    describe('roster mapping → MatchPlayerStat', () => {
      // Three plays for our #7 (a free throw, a two and a three), one for our
      // #9, and one for the opposing #7 — the last exists to prove a jersey
      // number is only unique within a team.
      const playedSheet: ParsedScoresheetData = {
        homeScore: 8,
        awayScore: 2,
        quarterScores: [],
        players: [
          { team: 'home', number: 7, name: 'DUPONT Jean', points: 6, fouls: 3 },
          { team: 'home', number: 9, name: 'Martin Léa', points: 2, fouls: null },
          { team: 'away', number: 7, name: 'BERNARD Paul', points: 2, fouls: 1 },
        ],
        scoringPlays: [
          { team: 'home', jerseyNumber: 7, points: 1, runningScore: 1 },
          { team: 'home', jerseyNumber: 7, points: 2, runningScore: 3 },
          { team: 'home', jerseyNumber: 7, points: 3, runningScore: 6 },
          { team: 'home', jerseyNumber: 9, points: 2, runningScore: 8 },
          { team: 'away', jerseyNumber: 7, points: 2, runningScore: 2 },
        ],
      };

      const givenSheet = (parsedData: unknown) => {
        prisma.eventScoresheet.findUnique.mockResolvedValue({
          id: 'sheet-1',
          extraction: { id: 'extraction-1', parsedData },
        });
        prisma.scoresheetExtraction.update.mockResolvedValue({
          parsedData,
          confidence: null,
          failureReason: null,
          reviewedByUserId: 'user-1',
          reviewedAt: new Date('2026-09-02T12:00:00Z'),
        });
      };

      // One mock serves both roster queries the confirm path makes — the
      // membership check (id only) and the suggestion build (id + surname) —
      // so it has to carry the wider shape.
      const givenRoster = (ids: string[]) => {
        prisma.teamPlayer.findMany.mockResolvedValue(
          ids.map((id) => ({ id, player: { lastName: id } })),
        );
      };

      it('folds our own side into per-player point buckets and copies fouls', async () => {
        givenSheet(playedSheet);
        givenRoster(['tp-7', 'tp-9']);

        await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
          rosterMapping: [
            { jerseyNumber: 7, teamPlayerId: 'tp-7' },
            { jerseyNumber: 9, teamPlayerId: 'tp-9' },
          ],
        });

        expect(prisma.matchPlayerStat.createMany).toHaveBeenCalledWith({
          data: [
            {
              eventId: 'event-1',
              teamPlayerId: 'tp-7',
              jerseyNumber: 7,
              points: 6,
              fouls: 3,
              freeThrowPoints: 1,
              twoPointPoints: 2,
              threePointPoints: 3,
            },
            {
              eventId: 'event-1',
              teamPlayerId: 'tp-9',
              jerseyNumber: 9,
              points: 2,
              fouls: null,
              freeThrowPoints: 0,
              twoPointPoints: 2,
              threePointPoints: 0,
            },
          ],
        });
      });

      it('reads the away column when the event is played away', async () => {
        prisma.event.findUnique.mockResolvedValue({ ...matchEvent, venue: 'AWAY' });
        givenSheet(playedSheet);
        givenRoster(['tp-7']);

        await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
          rosterMapping: [{ jerseyNumber: 7, teamPlayerId: 'tp-7' }],
        });

        // The away #7's single two-pointer, not the home #7's six points.
        expect(prisma.matchPlayerStat.createMany).toHaveBeenCalledWith({
          data: [
            {
              eventId: 'event-1',
              teamPlayerId: 'tp-7',
              jerseyNumber: 7,
              points: 2,
              fouls: 1,
              freeThrowPoints: 0,
              twoPointPoints: 2,
              threePointPoints: 0,
            },
          ],
        });
      });

      it('scores a mapped player with no play of their own as 0 once our column was read', async () => {
        givenSheet(playedSheet);
        givenRoster(['tp-12']);

        await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
          rosterMapping: [{ jerseyNumber: 12, teamPlayerId: 'tp-12' }],
        });

        expect(prisma.matchPlayerStat.createMany).toHaveBeenCalledWith({
          data: [
            expect.objectContaining({
              teamPlayerId: 'tp-12',
              points: 0,
              freeThrowPoints: 0,
              fouls: null,
            }),
          ],
        });
      });

      it('leaves points unknown, not zero, when our column produced no play at all', async () => {
        givenSheet({ ...playedSheet, scoringPlays: [] });
        givenRoster(['tp-7']);

        await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
          rosterMapping: [{ jerseyNumber: 7, teamPlayerId: 'tp-7' }],
        });

        // An unreadable running score must not report the squad as having
        // scored nothing — fouls still come through, they are read elsewhere.
        expect(prisma.matchPlayerStat.createMany).toHaveBeenCalledWith({
          data: [
            expect.objectContaining({
              teamPlayerId: 'tp-7',
              points: null,
              freeThrowPoints: null,
              twoPointPoints: null,
              threePointPoints: null,
              fouls: 3,
            }),
          ],
        });
      });

      it('drops a play whose notation was misread as a value other than 1, 2 or 3', async () => {
        givenSheet({
          ...playedSheet,
          scoringPlays: [
            { team: 'home', jerseyNumber: 7, points: 2, runningScore: 2 },
            { team: 'home', jerseyNumber: 7, points: 5, runningScore: 7 },
          ],
        } satisfies ParsedScoresheetData);
        givenRoster(['tp-7']);

        await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
          rosterMapping: [{ jerseyNumber: 7, teamPlayerId: 'tp-7' }],
        });

        expect(prisma.matchPlayerStat.createMany).toHaveBeenCalledWith({
          data: [expect.objectContaining({ points: 2, twoPointPoints: 2 })],
        });
      });

      it('folds the corrections rather than the model read when both are present', async () => {
        givenSheet(playedSheet);
        givenRoster(['tp-7']);
        const corrections: ParsedScoresheetData = {
          ...playedSheet,
          scoringPlays: [{ team: 'home', jerseyNumber: 7, points: 3, runningScore: 3 }],
        };

        await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
          corrections,
          rosterMapping: [{ jerseyNumber: 7, teamPlayerId: 'tp-7' }],
        });

        expect(prisma.matchPlayerStat.createMany).toHaveBeenCalledWith({
          data: [expect.objectContaining({ points: 3, threePointPoints: 3 })],
        });
      });

      it('replaces the previous rows rather than appending on a re-confirm', async () => {
        givenSheet(playedSheet);
        givenRoster(['tp-7']);

        await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
          rosterMapping: [{ jerseyNumber: 7, teamPlayerId: 'tp-7' }],
        });

        expect(prisma.matchPlayerStat.deleteMany).toHaveBeenCalledWith({
          where: { eventId: 'event-1' },
        });
      });

      it('clears the match stats without creating rows when the mapping is empty', async () => {
        givenSheet(playedSheet);

        await service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
          rosterMapping: [],
        });

        expect(prisma.matchPlayerStat.deleteMany).toHaveBeenCalledWith({
          where: { eventId: 'event-1' },
        });
        expect(prisma.matchPlayerStat.createMany).not.toHaveBeenCalled();
      });

      it('rejects a teamPlayerId that is not on this team, writing nothing', async () => {
        givenSheet(playedSheet);
        givenRoster([]);

        await expect(
          service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
            rosterMapping: [{ jerseyNumber: 7, teamPlayerId: 'tp-elsewhere' }],
          }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.matchPlayerStat.deleteMany).not.toHaveBeenCalled();
        expect(prisma.scoresheetExtraction.update).not.toHaveBeenCalled();
      });

      it('rejects the same player mapped to two jersey numbers', async () => {
        givenSheet(playedSheet);
        givenRoster(['tp-7']);

        await expect(
          service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
            rosterMapping: [
              { jerseyNumber: 7, teamPlayerId: 'tp-7' },
              { jerseyNumber: 9, teamPlayerId: 'tp-7' },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects the same jersey number mapped to two players', async () => {
        givenSheet(playedSheet);
        givenRoster(['tp-7', 'tp-9']);

        await expect(
          service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
            rosterMapping: [
              { jerseyNumber: 7, teamPlayerId: 'tp-7' },
              { jerseyNumber: 7, teamPlayerId: 'tp-9' },
            ],
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('refuses to pick a side when the match has no venue', async () => {
        prisma.event.findUnique.mockResolvedValue({ ...matchEvent, venue: null });
        givenSheet(playedSheet);

        await expect(
          service.confirmExtraction('club-1', 'team-1', 'event-1', 'user-1', {
            rosterMapping: [],
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('suggestedRosterMapping', () => {
      const sheetWith = (players: unknown[]) => {
        prisma.eventScoresheet.findUnique.mockResolvedValue({
          status: 'PARSED',
          extraction: {
            parsedData: {
              homeScore: null,
              awayScore: null,
              quarterScores: [],
              players,
              scoringPlays: [],
            },
            confidence: null,
            failureReason: null,
            reviewedByUserId: null,
            reviewedAt: null,
          },
        });
      };

      it('matches a surname regardless of case, accents and name order', async () => {
        sheetWith([
          { team: 'home', number: 7, name: 'DUPONT Jean', points: null, fouls: null },
          { team: 'home', number: 9, name: 'Léa Lefevre', points: null, fouls: null },
        ]);
        prisma.teamPlayer.findMany.mockResolvedValue([
          { id: 'tp-7', player: { lastName: 'Dupont' } },
          { id: 'tp-9', player: { lastName: 'Lefèvre' } },
        ]);

        const result = await service.getExtraction('club-1', 'team-1', 'event-1');

        expect(result?.suggestedRosterMapping).toEqual([
          { jerseyNumber: 7, teamPlayerId: 'tp-7', sheetName: 'DUPONT Jean' },
          { jerseyNumber: 9, teamPlayerId: 'tp-9', sheetName: 'Léa Lefevre' },
        ]);
      });

      it('leaves an ambiguous surname for the manager rather than picking the first hit', async () => {
        sheetWith([{ team: 'home', number: 7, name: 'MARTIN Léa', points: null, fouls: null }]);
        prisma.teamPlayer.findMany.mockResolvedValue([
          { id: 'tp-a', player: { lastName: 'Martin' } },
          { id: 'tp-b', player: { lastName: 'Martin' } },
        ]);

        const result = await service.getExtraction('club-1', 'team-1', 'event-1');

        expect(result?.suggestedRosterMapping).toEqual([
          { jerseyNumber: 7, teamPlayerId: null, sheetName: 'MARTIN Léa' },
        ]);
      });

      it('suggests nothing for an illegible name', async () => {
        sheetWith([{ team: 'home', number: 7, name: null, points: null, fouls: null }]);
        prisma.teamPlayer.findMany.mockResolvedValue([
          { id: 'tp-7', player: { lastName: 'Dupont' } },
        ]);

        const result = await service.getExtraction('club-1', 'team-1', 'event-1');

        expect(result?.suggestedRosterMapping).toEqual([
          { jerseyNumber: 7, teamPlayerId: null, sheetName: null },
        ]);
      });

      it('only proposes our own side of the sheet', async () => {
        sheetWith([
          { team: 'away', number: 7, name: 'BERNARD Paul', points: null, fouls: null },
          { team: 'home', number: 4, name: 'DUPONT Jean', points: null, fouls: null },
        ]);
        prisma.teamPlayer.findMany.mockResolvedValue([
          { id: 'tp-7', player: { lastName: 'Bernard' } },
          { id: 'tp-4', player: { lastName: 'Dupont' } },
        ]);

        const result = await service.getExtraction('club-1', 'team-1', 'event-1');

        expect(result?.suggestedRosterMapping).toEqual([
          { jerseyNumber: 4, teamPlayerId: 'tp-4', sheetName: 'DUPONT Jean' },
        ]);
      });

      it('proposes a jersey number read twice only once', async () => {
        sheetWith([
          { team: 'home', number: 7, name: 'DUPONT Jean', points: null, fouls: null },
          { team: 'home', number: 7, name: 'DUPONT J.', points: null, fouls: null },
        ]);
        prisma.teamPlayer.findMany.mockResolvedValue([
          { id: 'tp-7', player: { lastName: 'Dupont' } },
        ]);

        const result = await service.getExtraction('club-1', 'team-1', 'event-1');

        expect(result?.suggestedRosterMapping).toHaveLength(1);
      });
    });
  });
});
