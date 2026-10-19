import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { UpdateMatchStatsRequest } from '@basketeasy/types/team-stats';
import { TeamStatsService } from './team-stats.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TeamStatsService', () => {
  let service: TeamStatsService;
  let prisma: {
    clubTeam: { findUnique: jest.Mock };
    teamPlayer: { findMany: jest.Mock; findFirst: jest.Mock };
    matchPlayerStat: { findMany: jest.Mock };
    eventVote: { groupBy: jest.Mock };
    event: { findMany: jest.Mock; findFirst: jest.Mock };
    player: { findFirst: jest.Mock };
    eventScoresheet: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    scoresheetExtraction: { update: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };

  const rosterMember = (
    id: string,
    lastName: string,
    firstName = 'Prénom',
    userId: string | null = null,
  ) => ({
    id,
    role: 'PLAYER',
    playerId: `player-${id}`,
    player: { firstName, lastName, userId },
  });

  const statRow = (
    teamPlayerId: string,
    eventId: string,
    stats: Partial<{
      points: number | null;
      fouls: number | null;
      freeThrowPoints: number | null;
      twoPointPoints: number | null;
      threePointPoints: number | null;
    }> = {},
  ) => ({
    teamPlayerId,
    eventId,
    points: 0,
    fouls: 0,
    freeThrowPoints: 0,
    twoPointPoints: 0,
    threePointPoints: 0,
    ...stats,
  });

  beforeEach(async () => {
    prisma = {
      clubTeam: { findUnique: jest.fn().mockResolvedValue({ isOwner: true }) },
      teamPlayer: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      matchPlayerStat: { findMany: jest.fn().mockResolvedValue([]) },
      eventVote: { groupBy: jest.fn().mockResolvedValue([]) },
      event: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }),
      },
      player: { findFirst: jest.fn().mockResolvedValue(null) },
      eventScoresheet: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      scoresheetExtraction: {
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(),
    };
    // The transaction callback runs against the same mock client.
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamStatsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<TeamStatsService>(TeamStatsService);
  });

  it('404s when the team does not belong to the club in the route', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue(null);

    await expect(service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('queries only the requested season window', async () => {
    await service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026);

    expect(prisma.matchPlayerStat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          event: {
            teamId: 'team-1',
            startsAt: {
              gte: new Date('2026-09-01T00:00:00.000Z'),
              lte: new Date('2027-08-31T23:59:59.999Z'),
            },
          },
        },
      }),
    );
  });

  it('averages over known values only, leaving an all-unknown average null', async () => {
    prisma.teamPlayer.findMany.mockResolvedValue([
      rosterMember('tp-1', 'Dupont'),
      rosterMember('tp-2', 'Martin'),
    ]);
    prisma.matchPlayerStat.findMany.mockResolvedValue([
      // Ten points in one match, unknown in the other: the average is 10, not
      // 5 — an illegible sheet must not drag a player's average down.
      statRow('tp-1', 'event-1', { points: 10, fouls: 2 }),
      statRow('tp-1', 'event-2', { points: null, fouls: null }),
      statRow('tp-2', 'event-1', { points: null, fouls: null }),
    ]);

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026);
    const [dupont, martin] = result.players;

    expect(dupont.pointsPerGame).toBe(10);
    expect(dupont.foulsPerGame).toBe(2);
    // Both matches count as played — the player was on the sheet either way.
    expect(dupont.gamesPlayed).toBe(2);
    expect(martin.pointsPerGame).toBeNull();
    expect(martin.foulsPerGame).toBeNull();
    expect(martin.gamesPlayed).toBe(1);
  });

  it('rounds an average to one decimal', async () => {
    prisma.teamPlayer.findMany.mockResolvedValue([rosterMember('tp-1', 'Dupont')]);
    prisma.matchPlayerStat.findMany.mockResolvedValue([
      statRow('tp-1', 'event-1', { points: 10 }),
      statRow('tp-1', 'event-2', { points: 11 }),
      statRow('tp-1', 'event-3', { points: 11 }),
    ]);

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026);

    expect(result.players[0].pointsPerGame).toBe(10.7);
  });

  it('takes season highs over known values, ignoring nulls', async () => {
    prisma.teamPlayer.findMany.mockResolvedValue([rosterMember('tp-1', 'Dupont')]);
    prisma.matchPlayerStat.findMany.mockResolvedValue([
      statRow('tp-1', 'event-1', { points: 8, fouls: null }),
      statRow('tp-1', 'event-2', { points: null, fouls: 4 }),
      statRow('tp-1', 'event-3', { points: 21, fouls: 1 }),
    ]);

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026);

    expect(result.players[0].seasonHighPoints).toBe(21);
    expect(result.players[0].seasonHighFouls).toBe(4);
  });

  it('sums the season point buckets so the screen can render a repartition', async () => {
    prisma.teamPlayer.findMany.mockResolvedValue([rosterMember('tp-1', 'Dupont')]);
    prisma.matchPlayerStat.findMany.mockResolvedValue([
      statRow('tp-1', 'event-1', {
        points: 9,
        freeThrowPoints: 1,
        twoPointPoints: 2,
        threePointPoints: 6,
      }),
      statRow('tp-1', 'event-2', {
        points: 5,
        freeThrowPoints: 1,
        twoPointPoints: 4,
        threePointPoints: 0,
      }),
    ]);

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026);
    const player = result.players[0];

    expect(player.freeThrowPoints).toBe(2);
    expect(player.twoPointPoints).toBe(6);
    expect(player.threePointPoints).toBe(6);
    expect(player.totalPoints).toBe(14);
  });

  it('includes a roster member with no data at all, at zero', async () => {
    prisma.teamPlayer.findMany.mockResolvedValue([rosterMember('tp-1', 'Dupont')]);

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026);

    expect(result.players).toEqual([
      expect.objectContaining({
        teamPlayerId: 'tp-1',
        gamesPlayed: 0,
        pointsPerGame: null,
        totalPoints: 0,
        mvpAwards: 0,
      }),
    ]);
  });

  it('counts awards for a match that has no scoresheet at all', async () => {
    prisma.teamPlayer.findMany.mockResolvedValue([rosterMember('tp-1', 'Dupont')]);
    prisma.eventVote.groupBy.mockResolvedValue([
      { votedTeamPlayerId: 'tp-1', category: 'BEST', _count: { _all: 3 } },
      { votedTeamPlayerId: 'tp-1', category: 'WORST', _count: { _all: 1 } },
    ]);

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026);

    // No stat rows anywhere, yet the distinctions are real.
    expect(result.players[0]).toEqual(
      expect.objectContaining({ gamesPlayed: 0, mvpAwards: 3, worstPlayerAwards: 1 }),
    );
  });

  it('never reads who cast a vote', async () => {
    await service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026);

    const [args] = prisma.eventVote.groupBy.mock.calls[0];
    expect(JSON.stringify(args)).not.toContain('voterTeamPlayerId');
  });

  it('counts distinct analysed matches, not stat rows', async () => {
    prisma.matchPlayerStat.findMany.mockResolvedValue([
      statRow('tp-1', 'event-1'),
      statRow('tp-2', 'event-1'),
      statRow('tp-1', 'event-2'),
    ]);

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026);

    expect(result.matchesPlayed).toBe(2);
  });

  it('sorts by points per game, with unmeasured players last and ties by surname', async () => {
    prisma.teamPlayer.findMany.mockResolvedValue([
      rosterMember('tp-quiet', 'Zidane'),
      rosterMember('tp-mid', 'Bernard'),
      rosterMember('tp-top', 'Martin'),
      rosterMember('tp-tie', 'Abadie'),
    ]);
    prisma.matchPlayerStat.findMany.mockResolvedValue([
      statRow('tp-mid', 'event-1', { points: 8 }),
      statRow('tp-top', 'event-1', { points: 20 }),
      statRow('tp-tie', 'event-1', { points: 8 }),
    ]);

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026);

    expect(result.players.map((player) => player.lastName)).toEqual([
      'Martin',
      'Abadie',
      'Bernard',
      'Zidane',
    ]);
  });

  it('offers the seasons that hold data, newest first, always including the current one', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-02-01T00:00:00.000Z'));
    prisma.event.findMany.mockResolvedValue([
      { startsAt: new Date('2025-10-01T18:00:00.000Z') },
      { startsAt: new Date('2026-11-01T18:00:00.000Z') },
      { startsAt: new Date('2026-12-01T18:00:00.000Z') },
    ]);

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-none', 2026);

    expect(result.availableSeasons).toEqual([2026, 2025]);
    jest.useRealTimers();
  });

  it('defaults to the season containing today when none is given', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T00:00:00.000Z'));

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-none');

    expect(result.seasonYear).toBe(2026);
    expect(result.seasonStart).toBe('2026-09-01T00:00:00.000Z');
    jest.useRealTimers();
  });

  it("flags the caller's own roster row isMe, and every other row false", async () => {
    prisma.teamPlayer.findMany.mockResolvedValue([
      rosterMember('tp-1', 'Dupont', 'Prénom', 'user-caller'),
      rosterMember('tp-2', 'Martin', 'Prénom', 'user-other'),
    ]);

    const result = await service.getTeamSeasonStats('club-1', 'team-1', 'user-caller', 2026);

    const dupont = result.players.find((player) => player.teamPlayerId === 'tp-1');
    const martin = result.players.find((player) => player.teamPlayerId === 'tp-2');
    expect(dupont?.isMe).toBe(true);
    expect(martin?.isMe).toBe(false);
  });

  it('flags every row false for a caller with no roster row on this team (e.g. a club admin)', async () => {
    prisma.teamPlayer.findMany.mockResolvedValue([
      rosterMember('tp-1', 'Dupont', 'Prénom', 'user-someone'),
      rosterMember('tp-2', 'Martin', 'Prénom', null),
    ]);

    const result = await service.getTeamSeasonStats(
      'club-1',
      'team-1',
      'user-admin-no-roster',
      2026,
    );

    expect(result.players.every((player) => player.isMe === false)).toBe(true);
  });

  it('flags the child’s row for a parent reading their child’s team', async () => {
    prisma.player.findFirst.mockResolvedValue({ id: 'player-tp-2' });
    prisma.teamPlayer.findMany.mockResolvedValue([
      rosterMember('tp-1', 'Dupont', 'Prénom', 'user-parent'),
      rosterMember('tp-2', 'Martin', 'Léo', null),
    ]);

    const result = await service.getTeamSeasonStats(
      'club-1',
      'team-1',
      'user-parent',
      2026,
      'player-tp-2',
    );

    expect(result.players.find((p) => p.isMe)?.teamPlayerId).toBe('tp-2');
  });

  it('refuses a player the caller may not act for', async () => {
    await expect(
      service.getTeamSeasonStats('club-1', 'team-1', 'stranger', 2026, 'player-tp-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('getMatchStats', () => {
    const line = (
      teamPlayerId: string,
      lastName: string,
      points: number | null,
      firstName = 'Prénom',
    ) => ({
      teamPlayerId,
      jerseyNumber: 4,
      points,
      fouls: 2,
      freeThrowPoints: null,
      twoPointPoints: points,
      threePointPoints: 0,
      teamPlayer: { player: { firstName, lastName } },
    });

    it('404s an event on another team', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(service.getMatchStats('club-1', 'team-1', 'event-x', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.event.findFirst).toHaveBeenCalledWith({
        where: { id: 'event-x', teamId: 'team-1' },
        select: { id: true, venue: true },
      });
    });

    it('404s a team outside the route club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.getMatchStats('club-1', 'team-1', 'event-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('has no stats before a sheet is confirmed', async () => {
      await expect(service.getMatchStats('club-1', 'team-1', 'event-1', 'user-1')).resolves.toEqual(
        { hasStats: false, lines: [], scoreboard: null, manuallyEdited: false },
      );
    });

    it('reports our side of a confirmed sheet and whether it was edited by hand', async () => {
      prisma.event.findFirst.mockResolvedValue({ id: 'event-1', venue: 'AWAY' });
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        status: 'CONFIRMED',
        statsEditedAt: new Date('2026-10-18T10:00:00Z'),
        extraction: {
          parsedData: {
            homeScore: 55,
            awayScore: 62,
            quarterScores: [{ home: 12, away: 16 }],
            players: [],
            scoringPlays: [],
          },
        },
      });

      const result = await service.getMatchStats('club-1', 'team-1', 'event-1', 'user-1');

      expect(result.scoreboard).toEqual({
        ourScore: 62,
        theirScore: 55,
        periods: [{ ours: 16, theirs: 12 }],
      });
      expect(result.manuallyEdited).toBe(true);
    });

    it('shows no score for a sheet that is not confirmed yet', async () => {
      prisma.event.findFirst.mockResolvedValue({ id: 'event-1', venue: 'HOME' });
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        status: 'PARSED',
        statsEditedAt: null,
        extraction: {
          parsedData: {
            homeScore: 62,
            awayScore: 55,
            quarterScores: [],
            players: [],
            scoringPlays: [],
          },
        },
      });

      const result = await service.getMatchStats('club-1', 'team-1', 'event-1', 'user-1');

      expect(result.scoreboard).toBeNull();
    });

    it('orders by points, unknown totals last, then surname; nulls stay null', async () => {
      prisma.matchPlayerStat.findMany.mockResolvedValue([
        line('tp-1', 'Moreau', 8),
        line('tp-2', 'Diallo', null),
        line('tp-3', 'Bernard', 14),
        line('tp-4', 'Albert', 8),
      ]);

      const result = await service.getMatchStats('club-1', 'team-1', 'event-1', 'user-1');

      expect(result.hasStats).toBe(true);
      expect(result.lines.map((l) => l.teamPlayerId)).toEqual(['tp-3', 'tp-4', 'tp-1', 'tp-2']);
      expect(result.lines[3]).toMatchObject({ points: null, freeThrowPoints: null });
      expect(result.lines[0]).not.toHaveProperty('teamPlayer');
    });

    it("marks the caller's own line", async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-3' });
      prisma.matchPlayerStat.findMany.mockResolvedValue([
        line('tp-1', 'Moreau', 8),
        line('tp-3', 'Bernard', 14),
      ]);

      const result = await service.getMatchStats('club-1', 'team-1', 'event-1', 'user-1');

      expect(prisma.teamPlayer.findFirst).toHaveBeenCalledWith({
        where: { teamId: 'team-1', player: { userId: 'user-1' } },
      });
      expect(result.lines.map((l) => l.isMe)).toEqual([true, false]);
    });

    it("marks a guardian's child's line", async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.matchPlayerStat.findMany.mockResolvedValue([line('tp-1', 'Moreau', 8)]);

      const result = await service.getMatchStats(
        'club-1',
        'team-1',
        'event-1',
        'parent-1',
        'child-1',
      );

      expect(prisma.teamPlayer.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({ teamId: 'team-1', playerId: 'child-1' }),
      });
      expect(result.lines[0].isMe).toBe(true);
    });

    it('refuses a player the caller may not act for', async () => {
      await expect(
        service.getMatchStats('club-1', 'team-1', 'event-1', 'stranger', 'child-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('updateMatchStats', () => {
    const line = (teamPlayerId: string, overrides: Record<string, number | null> = {}) => ({
      teamPlayerId,
      jerseyNumber: 7,
      points: 12,
      fouls: 2,
      freeThrowPoints: 2,
      twoPointPoints: 10,
      threePointPoints: 0,
      ...overrides,
    });
    const request = (
      overrides: Partial<UpdateMatchStatsRequest> = {},
    ): UpdateMatchStatsRequest => ({
      ourScore: 62,
      theirScore: 55,
      periods: [{ ours: 16, theirs: 12 }],
      lines: [line('tp-1')],
      ...overrides,
    });
    const playedMatch = {
      id: 'event-1',
      type: 'MATCH',
      startsAt: new Date('2020-01-01T18:00:00Z'),
      venue: 'HOME',
    };
    const update = (body: UpdateMatchStatsRequest = request()) =>
      service.updateMatchStats('club-1', 'team-1', 'event-1', 'user-1', body);

    beforeEach(() => {
      prisma.event.findFirst.mockResolvedValue(playedMatch);
      prisma.teamPlayer.findMany.mockResolvedValue([{ id: 'tp-1' }]);
      Object.assign(prisma.matchPlayerStat, {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      });
    });

    const matchPlayerStat = () =>
      prisma.matchPlayerStat as unknown as { deleteMany: jest.Mock; createMany: jest.Mock };

    it('404s a team outside the route club and writes nothing', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(update()).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('404s an event on another team', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(update()).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['a training', { ...playedMatch, type: 'TRAINING' }],
      ['a match not played yet', { ...playedMatch, startsAt: new Date(Date.now() + 86_400_000) }],
      ['a match with no venue', { ...playedMatch, venue: null }],
    ])('refuses %s', async (_label, event) => {
      prisma.event.findFirst.mockResolvedValue(event);

      await expect(update()).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a player listed twice, a number used twice and a split that contradicts the total', async () => {
      await expect(
        update(request({ lines: [line('tp-1'), line('tp-1', { jerseyNumber: 8 })] })),
      ).rejects.toThrow(BadRequestException);
      await expect(update(request({ lines: [line('tp-1'), line('tp-2')] }))).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        update(request({ lines: [line('tp-1', { threePointPoints: 3 })] })),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts a partly known split and unknown values', async () => {
      await update(
        request({
          lines: [line('tp-1', { twoPointPoints: null, fouls: null })],
        }),
      );

      expect(matchPlayerStat().createMany).toHaveBeenCalled();
    });

    it('refuses a player who is not on the roster', async () => {
      prisma.teamPlayer.findMany.mockResolvedValue([]);

      await expect(update()).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates a MANUAL confirmed sheet for a match with no sheet', async () => {
      await update();

      expect(prisma.eventScoresheet.create).toHaveBeenCalledWith({
        data: {
          eventId: 'event-1',
          source: 'MANUAL',
          status: 'CONFIRMED',
          storageKey: null,
          statsEditedAt: expect.any(Date),
          extraction: {
            create: {
              rawResponse: {},
              parsedData: {
                homeScore: 62,
                awayScore: 55,
                quarterScores: [{ home: 16, away: 12 }],
                players: [],
                scoringPlays: [],
              },
              reviewedByUserId: 'user-1',
              reviewedAt: expect.any(Date),
            },
          },
        },
      });
      expect(matchPlayerStat().deleteMany).toHaveBeenCalledWith({ where: { eventId: 'event-1' } });
      expect(matchPlayerStat().createMany).toHaveBeenCalledWith({
        data: [{ eventId: 'event-1', ...line('tp-1') }],
      });
    });

    it('rewrites only the score of a confirmed sheet, keeping the verbatim read', async () => {
      prisma.event.findFirst.mockResolvedValue({ ...playedMatch, venue: 'AWAY' });
      const players = [{ team: 'away', number: 7, name: 'Martin', points: 12, fouls: 2 }];
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        id: 'sheet-1',
        status: 'CONFIRMED',
        statsEditedAt: null,
        extraction: {
          id: 'extraction-1',
          parsedData: {
            homeScore: 1,
            awayScore: 2,
            quarterScores: [],
            players,
            scoringPlays: [],
          },
        },
      });

      await update();

      expect(prisma.eventScoresheet.update).toHaveBeenCalledWith({
        where: { id: 'sheet-1' },
        data: { statsEditedAt: expect.any(Date) },
      });
      expect(prisma.scoresheetExtraction.update).toHaveBeenCalledWith({
        where: { id: 'extraction-1' },
        data: {
          parsedData: {
            homeScore: 55,
            awayScore: 62,
            quarterScores: [{ home: 12, away: 16 }],
            players,
            scoringPlays: [],
          },
        },
      });
      expect(prisma.eventScoresheet.create).not.toHaveBeenCalled();
    });

    it.each(['UPLOADED', 'QUEUED', 'PROCESSING', 'PARSED', 'NEEDS_REVIEW', 'FAILED'])(
      'leaves a %s sheet to its own flow',
      async (status) => {
        prisma.eventScoresheet.findUnique.mockResolvedValue({
          id: 'sheet-1',
          status,
          extraction: null,
        });

        await expect(update()).rejects.toThrow(ConflictException);
        expect(prisma.eventScoresheet.update).not.toHaveBeenCalled();
        expect(matchPlayerStat().deleteMany).not.toHaveBeenCalled();
      },
    );

    it('empties the match when every line is removed', async () => {
      await update(request({ lines: [] }));

      expect(matchPlayerStat().deleteMany).toHaveBeenCalled();
      expect(matchPlayerStat().createMany).not.toHaveBeenCalled();
    });
  });
});
