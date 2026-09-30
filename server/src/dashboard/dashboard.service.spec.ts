import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingPointsService } from '../meeting-points/meeting-points.service';

const RESPONDED_AT = new Date('2026-01-01T12:00:00.000Z');

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    clubMembership: { findMany: jest.Mock };
    teamAdmin: { findMany: jest.Mock };
    teamPlayer: { findMany: jest.Mock; groupBy: jest.Mock };
    player: {
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    event: { findMany: jest.Mock };
    eventRsvp: { findMany: jest.Mock };
    eventConvocation: { findMany: jest.Mock };
    eventScoresheet: { findMany: jest.Mock };
    matchPlayerStat: { findMany: jest.Mock };
    eventVote: { findMany: jest.Mock };
  };
  let meetingPoints: { resolvePlansAcrossTeams: jest.Mock };

  beforeEach(async () => {
    prisma = {
      clubMembership: { findMany: jest.fn() },
      teamAdmin: { findMany: jest.fn() },
      teamPlayer: { findMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      player: {
        count: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
      },
      event: { findMany: jest.fn().mockResolvedValue([]) },
      eventRsvp: { findMany: jest.fn().mockResolvedValue([]) },
      eventConvocation: { findMany: jest.fn().mockResolvedValue([]) },
      eventScoresheet: { findMany: jest.fn().mockResolvedValue([]) },
      matchPlayerStat: { findMany: jest.fn().mockResolvedValue([]) },
      eventVote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    meetingPoints = { resolvePlansAcrossTeams: jest.fn().mockResolvedValue(new Map()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
        { provide: MeetingPointsService, useValue: meetingPoints },
      ],
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

    expect(result).toEqual({ totalPlayers: 0, upcomingEvents: [], actionItems: [] });
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
        myRsvpRespondedBy: null,
        myRsvpRespondedAt: null,
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
        // Played in August, so its vote window closed long ago: public, empty.
        vote: {
          canVote: false,
          hasVoted: false,
          closesAt: '2026-08-17T18:00:00.000Z',
          votesCast: 0,
          totalVoters: 0,
          mvp: [],
        },
        meetingPlan: null,
        myTravelMode: null,
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
    prisma.eventRsvp.findMany.mockResolvedValue([
      { eventId: 'event-1', status: 'GOING', respondedAt: RESPONDED_AT, respondedBy: null },
    ]);
    prisma.eventConvocation.findMany.mockResolvedValue([{ eventId: 'event-2' }]);

    const result = await service.getDashboard('user-1');

    expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith({
      where: { teamPlayerId: { in: ['tp-1'] }, eventId: { in: ['event-1', 'event-2'] } },
      include: { respondedBy: { select: { id: true, firstName: true, lastName: true } } },
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
      {
        eventId: 'event-1',
        teamPlayerId: 'tp-a',
        status: 'GOING',
        respondedAt: RESPONDED_AT,
        respondedBy: null,
      },
      {
        eventId: 'event-2',
        teamPlayerId: 'tp-b',
        status: 'MAYBE',
        respondedAt: RESPONDED_AT,
        respondedBy: null,
      },
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

  describe('action items', () => {
    const DAY_IN_MS = 24 * 60 * 60 * 1000;

    /**
     * `prisma.event.findMany` backs three different queries in one
     * `getDashboard` call: the main range-scoped agenda fetch, and the two
     * fresh action-item queries (MATCH_WITHOUT_CONVOCATIONS filters on
     * `convocations`, MATCH_WITHOUT_CONFIRMED_SCORESHEET on `scoresheet`) —
     * so a single `mockResolvedValue` can't answer all three differently.
     * Dispatches on which filter key is present in `where`.
     */
    function mockEventFindManyByQuery(responses: {
      main?: unknown[];
      convocations?: unknown[];
      scoresheet?: unknown[];
    }) {
      prisma.event.findMany.mockImplementation((args: { where: Record<string, unknown> }) => {
        if (args.where.convocations) {
          return Promise.resolve(responses.convocations ?? []);
        }
        if (args.where.scoresheet) {
          return Promise.resolve(responses.scoresheet ?? []);
        }
        return Promise.resolve(responses.main ?? []);
      });
    }

    function mockAdminOfClub(clubId = 'club-1') {
      prisma.clubMembership.findMany
        .mockResolvedValueOnce([{ clubId }])
        .mockResolvedValueOnce([{ clubId }]);
      prisma.teamAdmin.findMany.mockResolvedValue([]);
      prisma.teamPlayer.findMany.mockResolvedValue([]);
    }

    /**
     * EVENT_PENDING_RSVPS reuses the *already-fetched* main agenda batch
     * (`events`/`rsvpSummaries`) rather than a fresh query — but that main
     * batch is only fetched at all when `teamIds` is non-empty (see
     * `getDashboard`'s `teamIds.length > 0 ? … : Promise.resolve([])`), so
     * these tests also need a `TeamAdmin` grant, not just club membership.
     */
    function mockAdminOfClubAndTeam(clubId = 'club-1', teamId = 'team-1') {
      mockAdminOfClub(clubId);
      prisma.teamAdmin.findMany.mockResolvedValue([{ teamId }]);
    }

    it('flags an upcoming MATCH with zero convocations (MATCH_WITHOUT_CONVOCATIONS)', async () => {
      mockAdminOfClub();
      mockEventFindManyByQuery({
        convocations: [matchEventFixture('event-1', 'team-1', 'U15 Filles', 'HOME')],
      });

      const result = await service.getDashboard('user-1');

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'MATCH', convocations: { none: {} } }),
        }),
      );
      expect(result.actionItems).toEqual([
        expect.objectContaining({
          kind: 'MATCH_WITHOUT_CONVOCATIONS',
          clubId: 'club-1',
          teamId: 'team-1',
          eventId: 'event-1',
          message: expect.stringContaining('convoqué'),
        }),
      ]);
    });

    it('does not flag a MATCH that already has at least one convocation', async () => {
      mockAdminOfClub();
      // The Prisma-level `convocations: { none: {} }` filter means a
      // genuinely-convoked match is simply absent from this query's result.
      mockEventFindManyByQuery({ convocations: [] });

      const result = await service.getDashboard('user-1');

      expect(result.actionItems).toEqual([]);
    });

    it('flags an imminent event with a pending roster response (EVENT_PENDING_RSVPS), reusing the already-computed rsvpSummary rather than a second aggregate', async () => {
      mockAdminOfClubAndTeam();
      const soon = new Date(Date.now() + DAY_IN_MS); // within the ±2-day window
      prisma.event.findMany.mockImplementation((args: { where: Record<string, unknown> }) => {
        if (args.where.convocations || args.where.scoresheet) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          { ...matchEventFixture('event-1', 'team-1', 'U15 Filles', 'HOME'), startsAt: soon },
        ]);
      });
      // Roster of 3, one GOING — two pending — computed once by
      // resolveEventRosterSummaries and reused, not re-queried.
      prisma.teamPlayer.groupBy.mockResolvedValue([{ teamId: 'team-1', _count: { _all: 3 } }]);
      prisma.eventRsvp.findMany.mockResolvedValue([
        {
          eventId: 'event-1',
          teamPlayerId: 'tp-a',
          status: 'GOING',
          respondedAt: RESPONDED_AT,
          respondedBy: null,
        },
      ]);

      const result = await service.getDashboard('user-1');

      expect(result.actionItems).toEqual([
        expect.objectContaining({
          kind: 'EVENT_PENDING_RSVPS',
          teamId: 'team-1',
          eventId: 'event-1',
          message: expect.stringContaining('répondu'),
        }),
      ]);
    });

    it('does not flag an event outside the ±2-day pending-RSVP window even with pending responses', async () => {
      mockAdminOfClubAndTeam();
      const farOut = new Date(Date.now() + 5 * DAY_IN_MS);
      prisma.event.findMany.mockImplementation((args: { where: Record<string, unknown> }) => {
        if (args.where.convocations || args.where.scoresheet) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          { ...matchEventFixture('event-1', 'team-1', 'U15 Filles', 'HOME'), startsAt: farOut },
        ]);
      });
      prisma.teamPlayer.groupBy.mockResolvedValue([{ teamId: 'team-1', _count: { _all: 3 } }]);

      const result = await service.getDashboard('user-1');

      expect(result.actionItems.filter((item) => item.kind === 'EVENT_PENDING_RSVPS')).toEqual([]);
    });

    it('flags a played MATCH with no CONFIRMED scoresheet (MATCH_WITHOUT_CONFIRMED_SCORESHEET)', async () => {
      mockAdminOfClub();
      mockEventFindManyByQuery({
        scoresheet: [matchEventFixture('event-1', 'team-1', 'U15 Filles', 'HOME')],
      });

      const result = await service.getDashboard('user-1');

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'MATCH',
            scoresheet: { isNot: { status: 'CONFIRMED' } },
          }),
        }),
      );
      expect(result.actionItems).toEqual([
        expect.objectContaining({
          kind: 'MATCH_WITHOUT_CONFIRMED_SCORESHEET',
          teamId: 'team-1',
          eventId: 'event-1',
          message: expect.stringContaining('confirmée'),
        }),
      ]);
    });

    it('does not flag a played MATCH once it has a CONFIRMED scoresheet', async () => {
      mockAdminOfClub();
      // The Prisma-level `isNot: { status: 'CONFIRMED' }` filter means a
      // confirmed match is simply absent from this query's result.
      mockEventFindManyByQuery({ scoresheet: [] });

      const result = await service.getDashboard('user-1');

      expect(result.actionItems).toEqual([]);
    });

    it('flags a Player with no linked account, capped at 5 (PLAYERS_WITHOUT_ACCOUNT)', async () => {
      mockAdminOfClub();
      prisma.player.findMany.mockResolvedValue([
        {
          id: 'p-1',
          firstName: 'Jeanne',
          lastName: 'Martin',
          club: { id: 'club-1', name: 'COC Basket' },
        },
      ]);

      const result = await service.getDashboard('user-1');

      expect(prisma.player.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clubId: { in: ['club-1'] }, userId: null },
          take: 5,
        }),
      );
      expect(result.actionItems).toEqual([
        expect.objectContaining({
          kind: 'PLAYERS_WITHOUT_ACCOUNT',
          clubId: 'club-1',
          teamId: null,
          eventId: null,
          message: expect.stringContaining('Jeanne Martin'),
        }),
      ]);
    });

    it('never computes action items for a caller with no admin club and no TeamAdmin grant', async () => {
      mockEmptyMemberships();
      // Rostered as a plain player only — teamIds is non-empty, but that
      // must not be enough on its own.
      prisma.teamPlayer.findMany.mockResolvedValue([{ id: 'tp-1', teamId: 'team-1' }]);
      prisma.event.findMany.mockResolvedValue([
        matchEventFixture('event-1', 'team-1', 'U15 Filles', 'HOME'),
      ]);

      const result = await service.getDashboard('user-1');

      expect(prisma.player.findMany).not.toHaveBeenCalled();
      expect(result.actionItems).toEqual([]);
    });

    it('caps the combined action item count across all four kinds, prioritized convocations > pending RSVPs > scoresheets > accountless players', async () => {
      mockAdminOfClubAndTeam();
      const soon = new Date(Date.now() + DAY_IN_MS);
      const withoutConvocations = [
        matchEventFixture('conv-1', 'team-1', 'U15 Filles', 'HOME'),
        matchEventFixture('conv-2', 'team-1', 'U15 Filles', 'HOME'),
        matchEventFixture('conv-3', 'team-1', 'U15 Filles', 'HOME'),
      ];
      const withoutScoresheet = [
        matchEventFixture('sheet-1', 'team-1', 'U15 Filles', 'HOME'),
        matchEventFixture('sheet-2', 'team-1', 'U15 Filles', 'HOME'),
        matchEventFixture('sheet-3', 'team-1', 'U15 Filles', 'HOME'),
      ];
      prisma.event.findMany.mockImplementation((args: { where: Record<string, unknown> }) => {
        if (args.where.convocations) return Promise.resolve(withoutConvocations);
        if (args.where.scoresheet) return Promise.resolve(withoutScoresheet);
        return Promise.resolve([
          { ...matchEventFixture('pending-1', 'team-1', 'U15 Filles', 'HOME'), startsAt: soon },
          { ...matchEventFixture('pending-2', 'team-1', 'U15 Filles', 'HOME'), startsAt: soon },
        ]);
      });
      prisma.teamPlayer.groupBy.mockResolvedValue([{ teamId: 'team-1', _count: { _all: 3 } }]);
      // Both pending events get zero responses -> pending > 0 for both.
      prisma.player.findMany.mockResolvedValue([
        { id: 'p-1', firstName: 'A', lastName: 'A', club: { id: 'club-1', name: 'COC Basket' } },
        { id: 'p-2', firstName: 'B', lastName: 'B', club: { id: 'club-1', name: 'COC Basket' } },
        { id: 'p-3', firstName: 'C', lastName: 'C', club: { id: 'club-1', name: 'COC Basket' } },
      ]);

      const result = await service.getDashboard('user-1');

      // 3 convocations + 2 pending + 3 scoresheets + 3 players = 11 raw items,
      // capped to 8 and never re-fetched page by page.
      expect(result.actionItems).toHaveLength(8);
      expect(result.actionItems.map((item) => item.kind)).toEqual([
        'MATCH_WITHOUT_CONVOCATIONS',
        'MATCH_WITHOUT_CONVOCATIONS',
        'MATCH_WITHOUT_CONVOCATIONS',
        'EVENT_PENDING_RSVPS',
        'EVENT_PENDING_RSVPS',
        'MATCH_WITHOUT_CONFIRMED_SCORESHEET',
        'MATCH_WITHOUT_CONFIRMED_SCORESHEET',
        'MATCH_WITHOUT_CONFIRMED_SCORESHEET',
      ]);
    });
  });

  describe('vote state', () => {
    const HOUR = 60 * 60 * 1000;

    function match(overrides: Record<string, unknown> = {}) {
      return {
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        // Three hours ago: the window is open (opens after one hour).
        startsAt: new Date(Date.now() - 3 * HOUR),
        location: 'Gymnase A',
        locationName: null,
        notes: null,
        opponentName: 'Carquefou',
        venue: 'AWAY',
        recurrenceId: null,
        externalId: null,
        timeConfirmed: true,
        jerseysTeamPlayerId: null,
        ballsTeamPlayerId: null,
        team: { name: 'U15 Filles', clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }] },
        ...overrides,
      };
    }

    function asPlayer(event = match()) {
      mockEmptyMemberships();
      prisma.teamPlayer.findMany.mockResolvedValue([{ id: 'tp-me', teamId: 'team-1' }]);
      prisma.teamPlayer.groupBy.mockResolvedValue([{ teamId: 'team-1', _count: { _all: 12 } }]);
      prisma.event.findMany.mockResolvedValue([event]);
    }

    function goingAndConvoked() {
      prisma.eventRsvp.findMany.mockResolvedValue([
        {
          eventId: 'event-1',
          teamPlayerId: 'tp-me',
          status: 'GOING',
          travelMode: 'MEETING_POINT',
          respondedAt: RESPONDED_AT,
          respondedBy: null,
        },
      ]);
      prisma.eventConvocation.findMany.mockResolvedValue([
        { eventId: 'event-1', teamPlayerId: 'tp-me' },
      ]);
    }

    it('lets a convoked, GOING player vote while the window is open', async () => {
      asPlayer();
      goingAndConvoked();

      const [event] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(event.vote).toMatchObject({ canVote: true, hasVoted: false, mvp: null });
      expect(event.vote?.totalVoters).toBe(12);
    });

    it.each([
      ['not convoked', 'GOING', false],
      ['not GOING', 'MAYBE', true],
    ])('refuses the vote to a player %s', async (_label, status, convoked) => {
      asPlayer();
      prisma.eventRsvp.findMany.mockResolvedValue([
        {
          eventId: 'event-1',
          teamPlayerId: 'tp-me',
          status,
          travelMode: 'MEETING_POINT',
          respondedAt: RESPONDED_AT,
          respondedBy: null,
        },
      ]);
      prisma.eventConvocation.findMany.mockResolvedValue(
        convoked ? [{ eventId: 'event-1', teamPlayerId: 'tp-me' }] : [],
      );

      const [event] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(event.vote?.canVote).toBe(false);
    });

    it('refuses the vote before the window opens', async () => {
      asPlayer(match({ startsAt: new Date(Date.now() - HOUR / 2) }));
      goingAndConvoked();

      const [event] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(event.vote?.canVote).toBe(false);
    });

    it('never gives a guardian persona a vote to cast', async () => {
      prisma.player.findFirst.mockResolvedValue({ id: 'child-1' });
      prisma.player.findUniqueOrThrow.mockResolvedValue({
        clubId: 'club-1',
        userId: 'child-user',
        teamPlayers: [{ id: 'tp-me', teamId: 'team-1' }],
      });
      prisma.event.findMany.mockResolvedValue([match()]);
      goingAndConvoked();

      const [event] = (await service.getDashboard('parent-1', undefined, undefined, 'child-1'))
        .upcomingEvents;

      expect(event.vote?.canVote).toBe(false);
    });

    it('keeps the vote for a player reading their own persona', async () => {
      prisma.player.findFirst.mockResolvedValue({ id: 'me-player' });
      prisma.player.findUniqueOrThrow.mockResolvedValue({
        clubId: 'club-1',
        userId: 'user-1',
        teamPlayers: [{ id: 'tp-me', teamId: 'team-1' }],
      });
      prisma.event.findMany.mockResolvedValue([match()]);
      goingAndConvoked();

      const [event] = (await service.getDashboard('user-1', undefined, undefined, 'me-player'))
        .upcomingEvents;

      expect(event.vote?.canVote).toBe(true);
    });

    it('hides the MVP while the window is open and the persona has not voted', async () => {
      asPlayer();
      goingAndConvoked();
      prisma.eventVote.findMany.mockResolvedValue([
        {
          eventId: 'event-1',
          category: 'BEST',
          voterTeamPlayerId: 'tp-a',
          votedTeamPlayerId: 'tp-b',
        },
      ]);

      const [event] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(event.vote).toMatchObject({ hasVoted: false, votesCast: 1, mvp: null });
      expect(prisma.teamPlayer.findMany).toHaveBeenCalledTimes(1); // the roster scope only
    });

    it('shows the MVP once the persona cast their BEST vote, flagging them when they won', async () => {
      asPlayer();
      goingAndConvoked();
      prisma.eventVote.findMany.mockResolvedValue([
        {
          eventId: 'event-1',
          category: 'BEST',
          voterTeamPlayerId: 'tp-me',
          votedTeamPlayerId: 'tp-b',
        },
        {
          eventId: 'event-1',
          category: 'BEST',
          voterTeamPlayerId: 'tp-a',
          votedTeamPlayerId: 'tp-me',
        },
        {
          eventId: 'event-1',
          category: 'BEST',
          voterTeamPlayerId: 'tp-c',
          votedTeamPlayerId: 'tp-me',
        },
      ]);
      prisma.teamPlayer.findMany
        .mockResolvedValueOnce([{ id: 'tp-me', teamId: 'team-1' }])
        .mockResolvedValueOnce([{ id: 'tp-me', player: { firstName: 'Léa', lastName: 'moreau' } }]);

      const [event] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(event.vote).toMatchObject({
        canVote: true,
        hasVoted: true,
        votesCast: 3,
        mvp: [{ firstName: 'Léa', lastInitial: 'M', isMe: true }],
      });
    });

    it('makes the MVP public to everyone after the window closes, ties included', async () => {
      asPlayer(match({ startsAt: new Date(Date.now() - 6 * 24 * HOUR) }));
      prisma.eventVote.findMany.mockResolvedValue([
        {
          eventId: 'event-1',
          category: 'BEST',
          voterTeamPlayerId: 'tp-a',
          votedTeamPlayerId: 'tp-b',
        },
        {
          eventId: 'event-1',
          category: 'BEST',
          voterTeamPlayerId: 'tp-b',
          votedTeamPlayerId: 'tp-c',
        },
      ]);
      prisma.teamPlayer.findMany
        .mockResolvedValueOnce([{ id: 'tp-me', teamId: 'team-1' }])
        .mockResolvedValueOnce([
          { id: 'tp-c', player: { firstName: 'Zoé', lastName: 'Bernard' } },
          { id: 'tp-b', player: { firstName: 'Karim', lastName: 'Diallo' } },
        ]);

      const [event] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(event.vote).toMatchObject({
        canVote: false,
        hasVoted: false,
        mvp: [
          { firstName: 'Zoé', lastInitial: 'B', isMe: false },
          { firstName: 'Karim', lastInitial: 'D', isMe: false },
        ],
      });
    });

    it('answers [] when the results are public but nobody voted', async () => {
      asPlayer(match({ startsAt: new Date(Date.now() - 6 * 24 * HOUR) }));

      const [event] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(event.vote?.mvp).toEqual([]);
    });

    it('never names a « joueur en difficulté » nominee, only counts the voter', async () => {
      asPlayer(match({ startsAt: new Date(Date.now() - 6 * 24 * HOUR) }));
      prisma.eventVote.findMany.mockResolvedValue([
        {
          eventId: 'event-1',
          category: 'WORST',
          voterTeamPlayerId: 'tp-a',
          votedTeamPlayerId: 'tp-z',
        },
      ]);

      const [event] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(event.vote).toMatchObject({ votesCast: 1, mvp: [] });
      expect(JSON.stringify(event)).not.toContain('tp-z');
    });

    it('reads every match’s votes in one query, and none for a training or a future match', async () => {
      mockEmptyMemberships();
      prisma.teamPlayer.findMany.mockResolvedValue([{ id: 'tp-me', teamId: 'team-1' }]);
      prisma.event.findMany.mockResolvedValue([
        match(),
        match({ id: 'event-2' }),
        match({ id: 'event-3', type: 'TRAINING', opponentName: null, venue: null }),
        match({ id: 'event-4', startsAt: new Date(Date.now() + 24 * HOUR) }),
      ]);

      const events = (await service.getDashboard('user-1')).upcomingEvents;

      expect(prisma.eventVote.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventVote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { eventId: { in: ['event-1', 'event-2'] } } }),
      );
      expect(events.map((e) => e.vote === null)).toEqual([false, false, true, true]);
    });
  });

  describe('meeting point', () => {
    const PLAN = {
      meetingPoint: { name: 'Parking Coubertin', address: '12 rue Coubertin, Nantes' },
      meetingPointSource: 'TEAM',
      defaultMeetingPoint: null,
      meetsAt: '2026-10-10T16:45:00.000Z',
    };

    function event(overrides: Record<string, unknown> = {}) {
      return {
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-10-10T18:00:00.000Z'),
        location: 'Gymnase A',
        locationName: null,
        notes: null,
        opponentName: 'Carquefou',
        venue: 'AWAY',
        recurrenceId: null,
        externalId: null,
        timeConfirmed: true,
        jerseysTeamPlayerId: null,
        ballsTeamPlayerId: null,
        team: { name: 'U15 Filles', clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }] },
        ...overrides,
      };
    }

    function rsvp(status: string, travelMode = 'DIRECT') {
      prisma.eventRsvp.findMany.mockResolvedValue([
        {
          eventId: 'event-1',
          teamPlayerId: 'tp-me',
          status,
          travelMode,
          respondedAt: RESPONDED_AT,
          respondedBy: null,
        },
      ]);
    }

    beforeEach(() => {
      mockEmptyMemberships();
      prisma.teamPlayer.findMany.mockResolvedValue([{ id: 'tp-me', teamId: 'team-1' }]);
    });

    it('carries the plan resolved for the whole batch by the meeting-points helper', async () => {
      const events = [event(), event({ id: 'event-2', type: 'TRAINING', opponentName: null })];
      prisma.event.findMany.mockResolvedValue(events);
      meetingPoints.resolvePlansAcrossTeams.mockResolvedValue(
        new Map([
          ['event-1', PLAN],
          ['event-2', null],
        ]),
      );

      const result = await service.getDashboard('user-1');

      expect(meetingPoints.resolvePlansAcrossTeams).toHaveBeenCalledTimes(1);
      expect(meetingPoints.resolvePlansAcrossTeams).toHaveBeenCalledWith(events);
      expect(result.upcomingEvents.map((e) => e.meetingPlan)).toEqual([PLAN, null]);
    });

    it('reads the travel choice of a GOING answer to a match', async () => {
      prisma.event.findMany.mockResolvedValue([event()]);
      rsvp('GOING', 'DIRECT');

      const [agendaEvent] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(agendaEvent.myTravelMode).toBe('DIRECT');
    });

    it.each(['MAYBE', 'NOT_GOING'])('has no travel choice for a %s answer', async (status) => {
      prisma.event.findMany.mockResolvedValue([event()]);
      rsvp(status);

      const [agendaEvent] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(agendaEvent.myTravelMode).toBeNull();
    });

    it('has no travel choice for a training', async () => {
      prisma.event.findMany.mockResolvedValue([
        event({ type: 'TRAINING', opponentName: null, venue: null }),
      ]);
      rsvp('GOING');

      const [agendaEvent] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(agendaEvent.myTravelMode).toBeNull();
    });

    it('has no RDV on a home match with no default (the helper answers without one)', async () => {
      prisma.event.findMany.mockResolvedValue([event({ venue: 'HOME' })]);
      meetingPoints.resolvePlansAcrossTeams.mockResolvedValue(
        new Map([
          ['event-1', { ...PLAN, meetingPoint: null, meetingPointSource: null, meetsAt: null }],
        ]),
      );

      const [agendaEvent] = (await service.getDashboard('user-1')).upcomingEvents;

      expect(agendaEvent.meetingPlan?.meetingPoint).toBeNull();
    });

    it('reads the child’s choice for a guardian persona', async () => {
      prisma.player.findFirst.mockResolvedValue({ id: 'child-1' });
      prisma.player.findUniqueOrThrow.mockResolvedValue({
        clubId: 'club-1',
        userId: null,
        teamPlayers: [{ id: 'tp-me', teamId: 'team-1' }],
      });
      prisma.event.findMany.mockResolvedValue([event()]);
      rsvp('GOING', 'MEETING_POINT');

      const [agendaEvent] = (
        await service.getDashboard('parent-1', undefined, undefined, 'child-1')
      ).upcomingEvents;

      expect(agendaEvent.myTravelMode).toBe('MEETING_POINT');
    });
  });

  describe('acting for a child', () => {
    it('shows the child’s agenda through the child’s club, with no manager band', async () => {
      prisma.player.findFirst.mockResolvedValue({ id: 'child-1' });
      prisma.player.findUniqueOrThrow.mockResolvedValue({
        clubId: 'club-partner',
        teamPlayers: [{ id: 'tp-child', teamId: 'team-ctc' }],
      });
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'event-1',
          teamId: 'team-ctc',
          type: 'MATCH',
          startsAt: new Date('2026-08-12T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
          opponentName: 'Rezé',
          venue: 'HOME',
          recurrenceId: null,
          externalId: null,
          timeConfirmed: true,
          jerseysTeamPlayerId: null,
          ballsTeamPlayerId: null,
          team: {
            name: 'U11 CTC',
            clubTeams: [
              { club: { id: 'club-owner', name: 'Owner' } },
              { club: { id: 'club-partner', name: 'Partner' } },
            ],
          },
        },
      ]);
      prisma.eventRsvp.findMany.mockResolvedValue([
        {
          eventId: 'event-1',
          status: 'GOING',
          respondedAt: RESPONDED_AT,
          respondedBy: { id: 'parent-1', firstName: 'Sophie', lastName: 'Martin' },
        },
      ]);

      const result = await service.getDashboard('parent-1', undefined, undefined, 'child-1');

      // The caller's own memberships and grants are never read.
      expect(prisma.clubMembership.findMany).not.toHaveBeenCalled();
      expect(prisma.teamAdmin.findMany).not.toHaveBeenCalled();
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamPlayerId: { in: ['tp-child'] }, eventId: { in: ['event-1'] } },
        }),
      );
      expect(result.totalPlayers).toBe(0);
      expect(result.actionItems).toEqual([]);
      expect(result.upcomingEvents[0]).toMatchObject({
        clubId: 'club-partner',
        myRsvpStatus: 'GOING',
        myRsvpRespondedBy: {
          firstName: 'Sophie',
          lastInitial: 'M',
          isMe: true,
        },
      });
    });

    it('refuses a player the caller may not act for', async () => {
      prisma.player.findFirst.mockResolvedValue(null);

      await expect(
        service.getDashboard('stranger', undefined, undefined, 'child-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
