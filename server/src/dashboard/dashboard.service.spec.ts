import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    clubMembership: { findMany: jest.Mock };
    teamAdmin: { findMany: jest.Mock };
    teamPlayer: { findMany: jest.Mock; groupBy: jest.Mock };
    player: { count: jest.Mock };
    event: { findMany: jest.Mock };
    eventRsvp: { findMany: jest.Mock };
    eventConvocation: { findMany: jest.Mock };
    eventScoresheet: { findMany: jest.Mock };
    matchPlayerStat: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      clubMembership: { findMany: jest.fn() },
      teamAdmin: { findMany: jest.fn() },
      teamPlayer: { findMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      player: { count: jest.fn() },
      event: { findMany: jest.fn() },
      eventRsvp: { findMany: jest.fn().mockResolvedValue([]) },
      eventConvocation: { findMany: jest.fn().mockResolvedValue([]) },
      eventScoresheet: { findMany: jest.fn().mockResolvedValue([]) },
      matchPlayerStat: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  function mockEmptyMemberships() {
    prisma.clubMembership.findMany.mockResolvedValue([]);
    prisma.teamAdmin.findMany.mockResolvedValue([]);
    prisma.teamPlayer.findMany.mockResolvedValue([]);
  }

  it('returns zero players and no events for a user with no admin clubs or teams', async () => {
    mockEmptyMemberships();

    const result = await service.getDashboard('user-1');

    expect(result).toEqual({ totalPlayers: 0, upcomingEvents: [] });
    expect(prisma.player.count).not.toHaveBeenCalled();
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('counts players across the clubs the user administers only', async () => {
    prisma.clubMembership.findMany
      .mockResolvedValueOnce([{ clubId: 'club-1' }])
      .mockResolvedValueOnce([{ clubId: 'club-1' }, { clubId: 'club-2' }]);
    prisma.teamAdmin.findMany.mockResolvedValue([]);
    prisma.teamPlayer.findMany.mockResolvedValue([]);
    prisma.player.count.mockResolvedValue(12);

    const result = await service.getDashboard('user-1');

    expect(prisma.player.count).toHaveBeenCalledWith({
      where: { clubId: { in: ['club-1'] } },
    });
    expect(result.totalPlayers).toBe(12);
  });

  it("builds agenda events from the caller's admin and roster teams, deduped", async () => {
    mockEmptyMemberships();
    prisma.clubMembership.findMany.mockResolvedValue([{ clubId: 'club-1' }]);
    prisma.teamAdmin.findMany.mockResolvedValue([{ teamId: 'team-1' }]);
    prisma.teamPlayer.findMany.mockResolvedValue([
      { id: 'tp-1', teamId: 'team-1' },
      { id: 'tp-2', teamId: 'team-2' },
    ]);
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-08-12T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'Les Aigles',
        venue: 'HOME',
        recurrenceId: null,
        externalId: null,
        timeConfirmed: true,
        jerseysTeamPlayerId: null,
        ballsTeamPlayerId: null,
        team: {
          name: 'U15 Filles',
          clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }],
        },
      },
    ]);

    const result = await service.getDashboard('user-1');

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamId: { in: ['team-1', 'team-2'] } }),
      }),
    );
    expect(result.upcomingEvents).toEqual([
      {
        eventId: 'event-1',
        teamId: 'team-1',
        teamName: 'U15 Filles',
        clubId: 'club-1',
        clubName: 'COC Basket',
        type: 'MATCH',
        startsAt: '2026-08-12T18:00:00.000Z',
        location: 'Gymnase A',
        notes: null,
        opponentName: 'Les Aigles',
        venue: 'HOME',
        recurrenceId: null,
        myRsvpStatus: null,
        myConvocation: false,
        rsvpSummary: {
          rosterSize: 0,
          convoked: 0,
          answering: 0,
          going: 0,
          maybe: 0,
          notGoing: 0,
          pending: 0,
          isConvocationScoped: false,
        },
        isImported: false,
        timeConfirmed: true,
        logistics: { jerseys: null, balls: null },
        result: null,
        myMatchStats: null,
      },
    ]);
  });

  it("resolves the caller's own RSVP status and convocation flag from their TeamPlayer rows", async () => {
    mockEmptyMemberships();
    prisma.teamPlayer.findMany.mockResolvedValue([{ id: 'tp-1', teamId: 'team-1' }]);
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-08-12T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        team: { name: 'U15 Filles', clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }] },
      },
      {
        id: 'event-2',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-08-13T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'Les Aigles',
        team: { name: 'U15 Filles', clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }] },
      },
    ]);
    prisma.eventRsvp.findMany.mockResolvedValue([{ eventId: 'event-1', status: 'GOING' }]);
    prisma.eventConvocation.findMany.mockResolvedValue([{ eventId: 'event-2' }]);

    const result = await service.getDashboard('user-1');

    expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith({
      where: { teamPlayerId: { in: ['tp-1'] }, eventId: { in: ['event-1', 'event-2'] } },
    });
    expect(result.upcomingEvents).toEqual([
      expect.objectContaining({ eventId: 'event-1', myRsvpStatus: 'GOING', myConvocation: false }),
      expect.objectContaining({ eventId: 'event-2', myRsvpStatus: null, myConvocation: true }),
    ]);
  });

  it('defaults the agenda window to now through +7 days when from/to are omitted', async () => {
    mockEmptyMemberships();
    prisma.clubMembership.findMany.mockResolvedValue([]);
    prisma.teamAdmin.findMany.mockResolvedValue([{ teamId: 'team-1' }]);
    prisma.event.findMany.mockResolvedValue([]);

    const before = Date.now();
    await service.getDashboard('user-1');
    const after = Date.now();

    const call = prisma.event.findMany.mock.calls[0][0];
    const gte: Date = call.where.startsAt.gte;
    const lte: Date = call.where.startsAt.lte;
    expect(gte.getTime()).toBeGreaterThanOrEqual(before);
    expect(gte.getTime()).toBeLessThanOrEqual(after);
    expect(lte.getTime() - gte.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('picks the club the caller belongs to over other linked clubs on a CTC team', async () => {
    prisma.clubMembership.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ clubId: 'club-2' }]);
    prisma.teamAdmin.findMany.mockResolvedValue([{ teamId: 'team-1' }]);
    prisma.teamPlayer.findMany.mockResolvedValue([]);
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-08-12T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        team: {
          name: 'U15 Filles (CTC)',
          clubTeams: [
            { club: { id: 'club-1', name: 'Owning Club' } },
            { club: { id: 'club-2', name: 'Partner Club' } },
          ],
        },
      },
    ]);

    const result = await service.getDashboard('user-1');

    expect(result.upcomingEvents[0].clubId).toBe('club-2');
    expect(result.upcomingEvents[0].clubName).toBe('Partner Club');
  });

  it('resolves rsvpSummary across a multi-team agenda batch in three bounded queries, per-team roster sizes kept separate', async () => {
    mockEmptyMemberships();
    prisma.teamPlayer.findMany.mockResolvedValue([
      { id: 'tp-1', teamId: 'team-1' },
      { id: 'tp-2', teamId: 'team-2' },
    ]);
    const eventFixture = (id: string, teamId: string, teamName: string) => ({
      id,
      teamId,
      type: 'TRAINING' as const,
      startsAt: new Date('2026-08-12T18:00:00.000Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: null,
      venue: null,
      recurrenceId: null,
      externalId: null,
      timeConfirmed: true,
      jerseysTeamPlayerId: null,
      ballsTeamPlayerId: null,
      team: { name: teamName, clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }] },
    });
    prisma.event.findMany.mockResolvedValue([
      eventFixture('event-1', 'team-1', 'U15 Filles'),
      eventFixture('event-2', 'team-2', 'U18 Garçons'),
    ]);
    // team-1 has 5 roster spots, team-2 has 2 — a per-event summary must use
    // its own team's roster size, never the other team's.
    prisma.teamPlayer.groupBy.mockResolvedValue([
      { teamId: 'team-1', _count: { _all: 5 } },
      { teamId: 'team-2', _count: { _all: 2 } },
    ]);
    prisma.eventRsvp.findMany.mockResolvedValue([
      { eventId: 'event-1', teamPlayerId: 'tp-a', status: 'GOING' },
      { eventId: 'event-2', teamPlayerId: 'tp-b', status: 'MAYBE' },
    ]);
    prisma.eventConvocation.findMany.mockResolvedValue([]);

    const result = await service.getDashboard('user-1');

    // One groupBy for every team's roster size at once, one findMany per
    // concern for the whole batch — never one query per event or per team.
    expect(prisma.teamPlayer.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.teamPlayer.groupBy).toHaveBeenCalledWith({
      by: ['teamId'],
      where: { teamId: { in: ['team-1', 'team-2'] } },
      _count: { _all: true },
    });
    expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: { in: ['event-1', 'event-2'] } },
        select: { eventId: true, teamPlayerId: true, status: true },
      }),
    );
    expect(prisma.eventConvocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: { in: ['event-1', 'event-2'] } },
        select: { eventId: true, teamPlayerId: true },
      }),
    );

    const [event1, event2] = result.upcomingEvents;
    expect(event1.rsvpSummary).toEqual({
      rosterSize: 5,
      convoked: 0,
      answering: 5,
      going: 1,
      maybe: 0,
      notGoing: 0,
      pending: 4,
      isConvocationScoped: false,
    });
    expect(event2.rsvpSummary).toEqual({
      rosterSize: 2,
      convoked: 0,
      answering: 2,
      going: 0,
      maybe: 1,
      notGoing: 0,
      pending: 1,
      isConvocationScoped: false,
    });
  });

  function matchEventFixture(id: string, teamId: string, teamName: string, venue: 'HOME' | 'AWAY') {
    return {
      id,
      teamId,
      type: 'MATCH' as const,
      startsAt: new Date('2026-08-12T18:00:00.000Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: 'Les Aigles',
      venue,
      recurrenceId: null,
      externalId: null,
      timeConfirmed: true,
      jerseysTeamPlayerId: null,
      ballsTeamPlayerId: null,
      team: { name: teamName, clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }] },
    };
  }

  function confirmedScoresheetFixture(
    eventId: string,
    homeScore: number | null,
    awayScore: number | null,
  ) {
    return {
      eventId,
      status: 'CONFIRMED',
      extraction: {
        parsedData: { homeScore, awayScore, quarterScores: [], players: [], scoringPlays: [] },
      },
    };
  }

  describe('match results', () => {
    it('resolves a WIN result from a CONFIRMED scoresheet, in two bounded queries regardless of batch size', async () => {
      prisma.clubMembership.findMany.mockResolvedValue([]);
      prisma.teamAdmin.findMany.mockResolvedValue([{ teamId: 'team-1' }]);
      prisma.teamPlayer.findMany.mockResolvedValue([]);
      prisma.event.findMany.mockResolvedValue([
        matchEventFixture('event-1', 'team-1', 'U15 Filles', 'HOME'),
      ]);
      prisma.eventScoresheet.findMany.mockResolvedValue([
        confirmedScoresheetFixture('event-1', 62, 58),
      ]);

      const result = await service.getDashboard('user-1');

      expect(prisma.eventScoresheet.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventScoresheet.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1'] }, status: 'CONFIRMED' },
        include: { extraction: true },
      });
      expect(result.upcomingEvents[0].result).toEqual({
        ourScore: 62,
        theirScore: 58,
        outcome: 'WIN',
      });
    });

    it('returns result: null when the match has no CONFIRMED scoresheet', async () => {
      prisma.clubMembership.findMany.mockResolvedValue([]);
      prisma.teamAdmin.findMany.mockResolvedValue([{ teamId: 'team-1' }]);
      prisma.teamPlayer.findMany.mockResolvedValue([]);
      prisma.event.findMany.mockResolvedValue([
        matchEventFixture('event-1', 'team-1', 'U15 Filles', 'HOME'),
      ]);

      const result = await service.getDashboard('user-1');

      expect(result.upcomingEvents[0].result).toBeNull();
    });

    it("resolves myMatchStats from the right team's roster row in a multi-team batch", async () => {
      // The caller is rostered on both teams (tp-1 on team-1, tp-2 on
      // team-2) — the per-event match must pick tp-1's stat row for
      // event-1 (team-1) and tp-2's for event-2 (team-2), never the other
      // team's row, even though both rows are fetched in the same query.
      prisma.clubMembership.findMany.mockResolvedValue([]);
      prisma.teamAdmin.findMany.mockResolvedValue([]);
      prisma.teamPlayer.findMany.mockResolvedValue([
        { id: 'tp-1', teamId: 'team-1' },
        { id: 'tp-2', teamId: 'team-2' },
      ]);
      prisma.event.findMany.mockResolvedValue([
        matchEventFixture('event-1', 'team-1', 'U15 Filles', 'HOME'),
        matchEventFixture('event-2', 'team-2', 'U18 Garçons', 'HOME'),
      ]);
      prisma.matchPlayerStat.findMany.mockResolvedValue([
        { eventId: 'event-1', points: 12, fouls: 2 },
        { eventId: 'event-2', points: 4, fouls: 1 },
      ]);

      const result = await service.getDashboard('user-1');

      expect(prisma.matchPlayerStat.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.matchPlayerStat.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1', 'event-2'] }, teamPlayerId: { in: ['tp-1', 'tp-2'] } },
      });
      const [event1, event2] = result.upcomingEvents;
      expect(event1.myMatchStats).toEqual({ points: 12, fouls: 2 });
      expect(event2.myMatchStats).toEqual({ points: 4, fouls: 1 });
    });

    it('myMatchStats is null, and matchPlayerStat is never queried, for a caller with no roster row anywhere', async () => {
      mockEmptyMemberships();
      prisma.teamAdmin.findMany.mockResolvedValue([{ teamId: 'team-1' }]);
      prisma.event.findMany.mockResolvedValue([
        matchEventFixture('event-1', 'team-1', 'U15 Filles', 'HOME'),
      ]);

      const result = await service.getDashboard('user-1');

      expect(prisma.matchPlayerStat.findMany).not.toHaveBeenCalled();
      expect(result.upcomingEvents[0].myMatchStats).toBeNull();
    });
  });
});
