import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TeamStatsService, seasonWindow, seasonYearFor } from './team-stats.service';
import { PrismaService } from '../prisma/prisma.service';

describe('seasonYearFor', () => {
  // A French basketball season runs September to August, so the boundary is
  // the one thing worth pinning down: 31 August still belongs to the season
  // that started the previous September.
  it.each([
    ['2026-08-31T23:59:59.999Z', 2025],
    ['2026-09-01T00:00:00.000Z', 2026],
    ['2027-01-15T12:00:00.000Z', 2026],
    ['2027-08-31T23:59:59.999Z', 2026],
    ['2027-09-01T00:00:00.000Z', 2027],
  ])('places %s in season %i', (iso, expected) => {
    expect(seasonYearFor(new Date(iso))).toBe(expected);
  });
});

describe('seasonWindow', () => {
  it('spans 1 September to the last millisecond of 31 August', () => {
    const { start, end } = seasonWindow(2026);

    expect(start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-08-31T23:59:59.999Z');
  });
});

describe('TeamStatsService', () => {
  let service: TeamStatsService;
  let prisma: {
    clubTeam: { findUnique: jest.Mock };
    teamPlayer: { findMany: jest.Mock };
    matchPlayerStat: { findMany: jest.Mock };
    eventVote: { groupBy: jest.Mock };
    event: { findMany: jest.Mock };
  };

  const rosterMember = (
    id: string,
    lastName: string,
    firstName = 'Prénom',
    userId: string | null = null,
  ) => ({
    id,
    role: 'PLAYER',
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
      teamPlayer: { findMany: jest.fn().mockResolvedValue([]) },
      matchPlayerStat: { findMany: jest.fn().mockResolvedValue([]) },
      eventVote: { groupBy: jest.fn().mockResolvedValue([]) },
      event: { findMany: jest.fn().mockResolvedValue([]) },
    };

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
});
