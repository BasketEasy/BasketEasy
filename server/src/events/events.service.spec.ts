import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { StorageService } from '../storage/storage.service';
import { ScoresheetsService } from '../scoresheets/scoresheets.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MeetingPointsService } from '../meeting-points/meeting-points.service';
import { WhatsAppReminderService } from '../whatsapp-reminders/whatsapp-reminder.service';
import { JerseyDutyService } from './jersey-duty.service';
import { EventType, EventVenue } from '@prisma/client';
import { UNKNOWN_EVENT_LOCATION } from '@basketeasy/types/events';

const RESPONDED_AT = new Date('2026-01-01T12:00:00.000Z');
// The account answering in the write tests — the caller, as themself.
const CALLER = { id: 'user-1', firstName: 'Sophie', lastName: 'Martin' };

// One row of resolvePlayerAudience's teamPlayer read: the slot, its player's
// own account (null when never claimed) and the player's guardians.
function audienceRow(
  teamPlayerId: string,
  userId: string | null,
  { guardians = [] as string[], firstName = 'Théo', clubId = 'club-1' } = {},
) {
  return {
    id: teamPlayerId,
    player: {
      id: `player-of-${teamPlayerId}`,
      firstName,
      clubId,
      userId,
      guardians: guardians.map((guardianId) => ({ userId: guardianId })),
    },
  };
}

describe('EventsService', () => {
  let service: EventsService;
  let teamManagerGuard: { isTeamManager: jest.Mock };
  let storage: { getUploadUrl: jest.Mock; deleteObject: jest.Mock };
  let scoresheets: { enqueueOcr: jest.Mock };
  let notifications: { notify: jest.Mock };
  let whatsAppReminders: {
    syncEvents: jest.Mock;
    ensureGuestLink: jest.Mock;
    onEventsChanged: jest.Mock;
    prepareCancellations: jest.Mock;
    afterCancellations: jest.Mock;
  };
  let jerseyDuty: { resolveSummaries: jest.Mock };
  let meetingPoints: {
    resolvePlans: jest.Mock;
    announceMeetingChanges: jest.Mock;
    enqueueRecompute: jest.Mock;
  };
  let prisma: {
    clubTeam: { findUnique: jest.Mock };
    team: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
    eventShare: { findMany: jest.Mock };
    event: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      count: jest.Mock;
    };
    teamPlayer: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    // canActForPlayer's lookup, behind every `forPlayerId`.
    player: { findFirst: jest.Mock };
    eventRsvp: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    eventRsvpChange: { create: jest.Mock };
    eventConvocation: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    eventVote: { findMany: jest.Mock; upsert: jest.Mock };
    eventScoresheet: { findUnique: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
    matchPlayerStat: { findMany: jest.Mock };
    eventMeeting: { updateMany: jest.Mock; deleteMany: jest.Mock };
    eventJerseyDuty: { deleteMany: jest.Mock };
    eventJerseyDecline: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      clubTeam: { findUnique: jest.fn() },
      // Backs notifyNewlyConvoked / notifyCancellation, which name the team
      // in the notification title.
      team: {
        findUnique: jest.fn().mockResolvedValue({ name: 'U15 M' }),
        // Backs the manager-only WhatsApp view.
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ waReminderEnabled: false, waDefaultOffsetMinutes: 4320 }),
      },
      eventShare: { findMany: jest.fn().mockResolvedValue([]) },
      event: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      teamPlayer: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      player: { findFirst: jest.fn().mockResolvedValue(null) },
      eventRsvp: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        // The written row: travelMode is the column default unless a test
        // says otherwise.
        upsert: jest.fn().mockResolvedValue({
          travelMode: 'MEETING_POINT',
          respondedAt: RESPONDED_AT,
          respondedBy: CALLER,
        }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ respondedAt: RESPONDED_AT, respondedBy: CALLER }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      eventRsvpChange: { create: jest.fn().mockResolvedValue({}) },
      eventConvocation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      eventVote: { findMany: jest.fn(), upsert: jest.fn() },
      eventScoresheet: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
      },
      matchPlayerStat: { findMany: jest.fn().mockResolvedValue([]) },
      eventMeeting: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      eventJerseyDuty: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      eventJerseyDecline: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      // Supports both $transaction call shapes used by EventsService: the
      // array form (a batch of prepared queries) and the interactive
      // callback form (setEventConvocations, which needs to read then write
      // inside one transaction) — the callback is invoked with `prisma`
      // itself standing in for the `tx` client, since these mocks have no
      // real distinct transaction client.
      $transaction: jest.fn((opsOrFn: unknown) =>
        typeof opsOrFn === 'function'
          ? (opsOrFn as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.all(opsOrFn as unknown[]),
      ),
    };
    // Default: the caller has no roster row on the team, so
    // resolveMyRsvpStatuses/resolveMyConvocationStatuses short-circuit to an
    // empty map/set and every returned TeamEvent's myRsvpStatus is null and
    // myConvocation is false, unless a test overrides this to exercise the
    // rostered-caller path.
    prisma.teamPlayer.findFirst.mockResolvedValue(null);
    // Defaults for whichever of the two a rostered-caller test doesn't
    // itself care about, so tests only need to mock the one they exercise.
    prisma.eventRsvp.findMany.mockResolvedValue([]);
    prisma.eventConvocation.findMany.mockResolvedValue([]);
    prisma.eventConvocation.findUnique.mockResolvedValue(null);
    // Default: caller has no manager rights; individual logistics tests
    // override this to exercise the manager-reassign path.
    teamManagerGuard = { isTeamManager: jest.fn().mockResolvedValue(false) };
    storage = {
      getUploadUrl: jest.fn().mockResolvedValue('https://signed.example/upload'),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    scoresheets = { enqueueOcr: jest.fn().mockResolvedValue(undefined) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    whatsAppReminders = {
      syncEvents: jest.fn().mockResolvedValue(undefined),
      ensureGuestLink: jest.fn().mockResolvedValue(undefined),
      onEventsChanged: jest.fn().mockResolvedValue(undefined),
      prepareCancellations: jest.fn().mockResolvedValue({ created: [], discardedShareIds: [] }),
      afterCancellations: jest.fn().mockResolvedValue(undefined),
    };
    // Default: no event resolves a meeting plan, so every TeamEvent carries
    // meetingPlan: null unless a test says otherwise.
    meetingPoints = {
      resolvePlans: jest.fn().mockResolvedValue(new Map()),
      announceMeetingChanges: jest.fn().mockResolvedValue(undefined),
      enqueueRecompute: jest.fn().mockResolvedValue(undefined),
    };

    // Default: no event carries a jersey duty (rotation off or a TRAINING).
    jerseyDuty = { resolveSummaries: jest.fn().mockResolvedValue(new Map()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TeamManagerGuard, useValue: teamManagerGuard },
        { provide: StorageService, useValue: storage },
        { provide: ScoresheetsService, useValue: scoresheets },
        { provide: NotificationsService, useValue: notifications },
        { provide: MeetingPointsService, useValue: meetingPoints },
        { provide: WhatsAppReminderService, useValue: whatsAppReminders },
        { provide: JerseyDutyService, useValue: jerseyDuty },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('listEvents', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.listEvents('club-1', 'team-1', {}, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it('lists events for the team ordered by start time by default', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'event-1',
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-05T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
          opponentName: null,
          recurrenceId: null,
          externalId: null,
          timeConfirmed: true,
          createdAt: new Date('2026-01-01'),
        },
      ]);
      prisma.event.count.mockResolvedValue(1);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        orderBy: { startsAt: 'asc' },
        skip: 0,
        take: 25,
      });
      expect(prisma.event.count).toHaveBeenCalledWith({ where: { teamId: 'team-1' } });
      expect(result).toEqual({
        items: [
          {
            id: 'event-1',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            isImported: false,
            timeConfirmed: true,
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
            logistics: { jerseys: null, balls: null },
            result: null,
            myMatchStats: null,
            meetingPlan: null,
            jerseyDuty: null,
            whatsAppShare: null,
            whatsAppSettings: null,
            myTravelMode: null,
            myRsvpRespondedBy: null,
            myRsvpRespondedAt: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      });
    });

    it('marks an event with an externalId as imported and surfaces timeConfirmed:false for a TBD kickoff', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'event-1',
          teamId: 'team-1',
          type: 'MATCH',
          startsAt: new Date('2026-09-20T00:00:00.000Z'),
          location: 'Lieu non communiqué',
          notes: null,
          opponentName: 'Nantes Sully Basket',
          venue: 'AWAY',
          recurrenceId: null,
          externalId: 'ffbb-match-1',
          timeConfirmed: false,
          createdAt: new Date('2026-01-01'),
        },
      ]);
      prisma.event.count.mockResolvedValue(1);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      expect(result.items[0].isImported).toBe(true);
      expect(result.items[0].timeConfirmed).toBe(false);
      expect(result.items[0].venue).toBe('AWAY');
    });

    it('resolves the caller RSVP status and convocation flag in a bounded number of queries, regardless of page size', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'event-1',
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-05T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
          opponentName: null,
          recurrenceId: null,
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 'event-2',
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-12T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
          opponentName: null,
          recurrenceId: null,
          createdAt: new Date('2026-01-01'),
        },
      ]);
      prisma.event.count.mockResolvedValue(2);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventRsvp.findMany.mockResolvedValue([
        { eventId: 'event-1', status: 'GOING', respondedAt: RESPONDED_AT, respondedBy: null },
      ]);
      prisma.eventConvocation.findMany.mockResolvedValue([{ eventId: 'event-1' }]);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      // resolveMyEventState: one shared findMyTeamPlayer lookup, plus one
      // findMany per concern — never one query per event and never a
      // duplicate teamPlayer lookup for the two concerns. rsvpSummary's
      // sibling resolveEventRosterSummaries adds one more findMany per
      // concern (batch-wide, not per-caller) plus one teamPlayer.count — see
      // the dedicated "resolves rsvpSummary" test below for that helper's
      // own bounded-query assertions.
      expect(prisma.teamPlayer.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith({
        where: { teamPlayerId: 'tp-1', eventId: { in: ['event-1', 'event-2'] } },
        include: { respondedBy: { select: { id: true, firstName: true, lastName: true } } },
      });
      expect(prisma.eventConvocation.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.eventConvocation.findMany).toHaveBeenCalledWith({
        where: { teamPlayerId: 'tp-1', eventId: { in: ['event-1', 'event-2'] } },
      });
      expect(result.items[0].myRsvpStatus).toBe('GOING');
      expect(result.items[0].myConvocation).toBe(true);
      expect(result.items[1].myRsvpStatus).toBeNull();
      expect(result.items[1].myConvocation).toBe(false);
    });

    it('resolves rsvpSummary for the whole roster in a bounded number of queries, regardless of batch size', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      // teamPlayer.findFirst defaults to null (beforeEach), so
      // resolveMyEventState short-circuits without touching
      // eventRsvp/eventConvocation.findMany — every call to those mocks
      // below is exclusively resolveEventRosterSummaries's.
      prisma.teamPlayer.count.mockResolvedValue(5);
      const createdAt = new Date('2026-01-01');
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'event-a',
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-05'),
          createdAt,
        },
        {
          id: 'event-b',
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-12'),
          createdAt,
        },
        {
          id: 'event-c',
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-19'),
          createdAt,
        },
      ]);
      prisma.event.count.mockResolvedValue(3);
      prisma.eventRsvp.findMany.mockResolvedValue([
        { eventId: 'event-a', teamPlayerId: 'tp-1', status: 'GOING' },
        { eventId: 'event-a', teamPlayerId: 'tp-2', status: 'GOING' },
        { eventId: 'event-a', teamPlayerId: 'tp-3', status: 'MAYBE' },
        { eventId: 'event-a', teamPlayerId: 'tp-4', status: 'NOT_GOING' },
        { eventId: 'event-b', teamPlayerId: 'tp-1', status: 'GOING' },
        // Not convoked for event-b — must not count toward its scoped total.
        { eventId: 'event-b', teamPlayerId: 'tp-3', status: 'GOING' },
        { eventId: 'event-c', teamPlayerId: 'tp-1', status: 'GOING' },
        { eventId: 'event-c', teamPlayerId: 'tp-2', status: 'MAYBE' },
      ]);
      prisma.eventConvocation.findMany.mockResolvedValue([
        // event-a: fully convoked (all 5 roster spots called up).
        { eventId: 'event-a', teamPlayerId: 'tp-1' },
        { eventId: 'event-a', teamPlayerId: 'tp-2' },
        { eventId: 'event-a', teamPlayerId: 'tp-3' },
        { eventId: 'event-a', teamPlayerId: 'tp-4' },
        { eventId: 'event-a', teamPlayerId: 'tp-5' },
        // event-b: partially convoked (2 of 5).
        { eventId: 'event-b', teamPlayerId: 'tp-1' },
        { eventId: 'event-b', teamPlayerId: 'tp-2' },
        // event-c: nobody convoked yet.
      ]);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      // One roster-size count and one findMany per concern — for the whole
      // 3-event batch, not one query per event.
      expect(prisma.teamPlayer.count).toHaveBeenCalledTimes(1);
      expect(prisma.teamPlayer.count).toHaveBeenCalledWith({ where: { teamId: 'team-1' } });
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-a', 'event-b', 'event-c'] } },
        select: { eventId: true, teamPlayerId: true, status: true },
      });
      expect(prisma.eventConvocation.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventConvocation.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-a', 'event-b', 'event-c'] } },
        select: { eventId: true, teamPlayerId: true },
      });

      expect(result.items[0].rsvpSummary).toEqual({
        rosterSize: 5,
        convoked: 5,
        answering: 5,
        going: 2,
        maybe: 1,
        notGoing: 1,
        pending: 1,
        isConvocationScoped: true,
      });
      expect(result.items[1].rsvpSummary).toEqual({
        rosterSize: 5,
        convoked: 2,
        answering: 2,
        going: 1,
        maybe: 0,
        notGoing: 0,
        pending: 1,
        isConvocationScoped: true,
      });
      expect(result.items[2].rsvpSummary).toEqual({
        rosterSize: 5,
        convoked: 0,
        answering: 5,
        going: 1,
        maybe: 1,
        notGoing: 0,
        pending: 3,
        isConvocationScoped: false,
      });
    });

    function matchEventFixture(id: string, venue: 'HOME' | 'AWAY') {
      return {
        id,
        teamId: 'team-1',
        type: 'MATCH' as const,
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'ES Rezé',
        venue,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
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

    it('resolves a WIN result from a CONFIRMED scoresheet for a HOME match, in a bounded number of queries regardless of batch size', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([
        matchEventFixture('event-1', 'HOME'),
        matchEventFixture('event-2', 'HOME'),
      ]);
      prisma.event.count.mockResolvedValue(2);
      prisma.eventScoresheet.findMany.mockResolvedValue([
        confirmedScoresheetFixture('event-1', 62, 58),
      ]);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      // resolveMatchResults: one eventScoresheet.findMany scoped to
      // CONFIRMED, plus matchPlayerStat.findMany skipped entirely since the
      // caller has no roster row (teamPlayer.findFirst defaults to null —
      // resolveMatchResults itself never calls teamPlayer.findFirst, it
      // takes resolveMyEventState's already-resolved myTeamPlayerId instead,
      // so this doesn't add a second lookup).
      expect(prisma.eventScoresheet.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1', 'event-2'] }, status: 'CONFIRMED' },
        include: { extraction: true },
      });
      expect(prisma.matchPlayerStat.findMany).not.toHaveBeenCalled();
      // Confirms resolveMatchResults doesn't re-derive the caller's
      // TeamPlayer: still exactly the one call resolveMyEventState already
      // makes for this whole request, not two.
      expect(prisma.teamPlayer.findFirst).toHaveBeenCalledTimes(1);
      expect(result.items[0].result).toEqual({ ourScore: 62, theirScore: 58, outcome: 'WIN' });
      expect(result.items[1].result).toBeNull();
    });

    it('mirrors ourScore/theirScore for an AWAY match', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([matchEventFixture('event-1', 'AWAY')]);
      prisma.event.count.mockResolvedValue(1);
      prisma.eventScoresheet.findMany.mockResolvedValue([
        confirmedScoresheetFixture('event-1', 58, 62),
      ]);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      expect(result.items[0].result).toEqual({ ourScore: 62, theirScore: 58, outcome: 'WIN' });
    });

    it('returns result: null when the match has no CONFIRMED scoresheet — a player must never see an unconfirmed score', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([matchEventFixture('event-1', 'HOME')]);
      prisma.event.count.mockResolvedValue(1);
      // The eventScoresheet.findMany call itself is scoped to status:
      // CONFIRMED, so an UPLOADED/QUEUED/NEEDS_REVIEW sheet is simply never
      // among the rows this query returns.
      prisma.eventScoresheet.findMany.mockResolvedValue([]);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      expect(result.items[0].result).toBeNull();
    });

    it('returns result: null for a TRAINING event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'event-1',
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-05T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
          opponentName: null,
          venue: null,
          recurrenceId: null,
          createdAt: new Date('2026-01-01'),
        },
      ]);
      prisma.event.count.mockResolvedValue(1);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      expect(result.items[0].result).toBeNull();
    });

    it("resolves myMatchStats from the caller's own MatchPlayerStat row when rostered", async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([matchEventFixture('event-1', 'HOME')]);
      prisma.event.count.mockResolvedValue(1);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.matchPlayerStat.findMany.mockResolvedValue([
        { eventId: 'event-1', points: 12, fouls: 2 },
      ]);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      expect(prisma.matchPlayerStat.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1'] }, teamPlayerId: 'tp-1' },
      });
      expect(result.items[0].myMatchStats).toEqual({ points: 12, fouls: 2 });
    });

    it('myMatchStats is null, and matchPlayerStat is never queried, when the caller has no roster row on the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([matchEventFixture('event-1', 'HOME')]);
      prisma.event.count.mockResolvedValue(1);
      // teamPlayer.findFirst defaults to null (beforeEach).

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      expect(prisma.matchPlayerStat.findMany).not.toHaveBeenCalled();
      expect(result.items[0].myMatchStats).toBeNull();
    });

    it('filters by from/to date range', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      await service.listEvents(
        'club-1',
        'team-1',
        {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-31T00:00:00.000Z',
        },
        'user-1',
      );

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teamId: 'team-1',
            startsAt: {
              gte: new Date('2026-01-01T00:00:00.000Z'),
              lte: new Date('2026-01-31T00:00:00.000Z'),
            },
          },
        }),
      );
    });

    it('filters by search on location or notes', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      await service.listEvents('club-1', 'team-1', { search: 'gymnase' }, 'user-1');

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teamId: 'team-1',
            OR: [
              { location: { contains: 'gymnase', mode: 'insensitive' } },
              { notes: { contains: 'gymnase', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('sorts descending when requested', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      await service.listEvents('club-1', 'team-1', { sortOrder: 'desc' }, 'user-1');

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { startsAt: 'desc' } }),
      );
    });
  });

  describe('getEvent', () => {
    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-2' });

      await expect(service.getEvent('club-1', 'team-1', 'event-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns the event with the caller RSVP status and convocation flag', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'US Saint-Nazaire',
        venue: 'HOME',
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventRsvp.findMany.mockResolvedValue([
        { eventId: 'event-1', status: 'GOING', respondedAt: RESPONDED_AT, respondedBy: null },
      ]);
      prisma.eventConvocation.findMany.mockResolvedValue([{ eventId: 'event-1' }]);

      const result = await service.getEvent('club-1', 'team-1', 'event-1', 'user-1');

      expect(result.id).toBe('event-1');
      expect(result.venue).toBe('HOME');
      expect(result.myRsvpStatus).toBe('GOING');
      expect(result.myConvocation).toBe(true);
    });
  });

  describe('createEvent', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(
        service.createEvent(
          'club-1',
          'team-1',
          {
            type: 'TRAINING',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
          },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('refuses the unknown-venue placeholder as a typed location', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });

      await expect(
        service.createEvent(
          'club-1',
          'team-1',
          {
            type: 'TRAINING',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: UNKNOWN_EVENT_LOCATION,
          },
          'user-1',
        ),
      ).rejects.toThrow('Le lieu doit être une adresse');
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for a MATCH with no opponentName', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });

      await expect(
        service.createEvent(
          'club-1',
          'team-1',
          {
            type: 'MATCH',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('creates a single event for the team when no recurrence is given, with recurrenceId null', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'TRAINING',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
        },
        'user-1',
      );

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.event.create).toHaveBeenCalledWith({
        data: {
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-05T18:00:00.000Z'),
          location: 'Gymnase A',
          locationName: null,
          notes: null,
          opponentName: null,
          venue: null,
          recurrenceId: null,
          waReminderOverride: null,
          waOffsetMinutes: null,
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('event-1');
      expect(result[0].recurrenceId).toBeNull();
    });

    it('creates a MATCH event with the given opponentName', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'US Saint-Nazaire',
        venue: 'HOME',
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'MATCH',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
          opponentName: 'US Saint-Nazaire',
          venue: 'HOME',
        },
        'user-1',
      );

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ opponentName: 'US Saint-Nazaire' }),
      });
      expect(result[0].opponentName).toBe('US Saint-Nazaire');
    });

    it('throws BadRequestException for a MATCH with an opponentName but no venue', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });

      await expect(
        service.createEvent(
          'club-1',
          'team-1',
          {
            type: 'MATCH',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
            opponentName: 'US Saint-Nazaire',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('creates a MATCH event with the given venue and forces venue null for a TRAINING event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'US Saint-Nazaire',
        venue: 'AWAY',
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'MATCH',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
          opponentName: 'US Saint-Nazaire',
          venue: 'AWAY',
        },
        'user-1',
      );

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ venue: 'AWAY' }),
      });
      expect(result[0].venue).toBe('AWAY');
    });

    it('forces venue null when creating a TRAINING event even if one is given', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        venue: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'TRAINING',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
        },
        'user-1',
      );

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ venue: null }),
      });
    });

    it('creates one event per week through the recurrence end date, inclusive, sharing one recurrenceId', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      const recurrenceIds: (string | null)[] = [];
      prisma.event.create.mockImplementation(
        ({ data }: { data: { startsAt: Date; recurrenceId: string | null } }) => {
          recurrenceIds.push(data.recurrenceId);
          return Promise.resolve({
            id: `event-${data.startsAt.toISOString()}`,
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: data.startsAt,
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: data.recurrenceId,
            createdAt: new Date('2026-01-01'),
          });
        },
      );

      const result = await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'TRAINING',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
          recurrence: { frequency: 'WEEKLY', until: '2026-01-19T18:00:00.000Z' },
        },
        'user-1',
      );

      expect(prisma.event.create).toHaveBeenCalledTimes(3);
      expect(result.map((e) => e.startsAt)).toEqual([
        '2026-01-05T18:00:00.000Z',
        '2026-01-12T18:00:00.000Z',
        '2026-01-19T18:00:00.000Z',
      ]);
      expect(recurrenceIds.every((id) => id !== null)).toBe(true);
      expect(new Set(recurrenceIds).size).toBe(1);
      expect(result.every((e) => e.recurrenceId === recurrenceIds[0])).toBe(true);
    });

    it('keeps the Paris wall-clock time across a DST change', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockImplementation(({ data }: { data: { startsAt: Date } }) =>
        Promise.resolve({
          id: `event-${data.startsAt.toISOString()}`,
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: data.startsAt,
          location: 'Gymnase A',
          notes: null,
          opponentName: null,
          recurrenceId: 'series-1',
          createdAt: new Date('2026-01-01'),
        }),
      );

      // 19:00 in Paris on both sides of 25 October 2026 (UTC+2 → UTC+1).
      const result = await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'TRAINING',
          startsAt: '2026-10-21T17:00:00.000Z',
          location: 'Gymnase A',
          recurrence: { frequency: 'WEEKLY', until: '2026-11-04T18:00:00.000Z' },
        },
        'user-1',
      );

      expect(result.map((e) => e.startsAt)).toEqual([
        '2026-10-21T17:00:00.000Z',
        '2026-10-28T18:00:00.000Z',
        '2026-11-04T18:00:00.000Z',
      ]);
    });

    it('throws BadRequestException when the recurrence end date is before the start date', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });

      await expect(
        service.createEvent(
          'club-1',
          'team-1',
          {
            type: 'TRAINING',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
            recurrence: { frequency: 'WEEKLY', until: '2026-01-01T18:00:00.000Z' },
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });
  });

  describe('updateEvent', () => {
    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-2' });

      await expect(
        service.updateEvent('club-1', 'team-1', 'event-1', { location: 'Gymnase B' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('updates only the provided fields with scope THIS by default', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        locationName: null,
        opponentName: null,
        venue: null,
        recurrenceId: null,
      });
      prisma.event.update.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase B',
        notes: null,
        opponentName: null,
        venue: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.updateEvent(
        'club-1',
        'team-1',
        'event-1',
        {
          location: 'Gymnase B',
        },
        'user-1',
      );

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { location: 'Gymnase B', locationName: null },
      });
      expect(result).toHaveLength(1);
      expect(result[0].location).toBe('Gymnase B');
    });

    describe('venue', () => {
      const importedMatch = {
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-10T19:30:00.000Z'),
        location: UNKNOWN_EVENT_LOCATION,
        locationName: null,
        notes: null,
        opponentName: 'Rezé',
        venue: 'AWAY',
        recurrenceId: null,
        externalId: 'ffbb-1',
        createdAt: new Date('2026-01-01'),
      };

      function givenEvent(row: Record<string, unknown>) {
        prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
        prisma.event.findUnique.mockResolvedValue(row);
        prisma.event.update.mockImplementation(({ data }: { data: object }) =>
          Promise.resolve({ ...row, ...data }),
        );
      }

      it('stores the gym name with its address', async () => {
        givenEvent(importedMatch);

        const [result] = await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { location: '12 rue des Sports, Rezé', locationName: 'Gymnase de la Trocardière' },
          'user-1',
        );

        expect(prisma.event.update).toHaveBeenCalledWith({
          where: { id: 'event-1' },
          data: {
            location: '12 rue des Sports, Rezé',
            locationName: 'Gymnase de la Trocardière',
          },
        });
        expect(result.locationName).toBe('Gymnase de la Trocardière');
      });

      it('clears the old name when only the address changes', async () => {
        givenEvent({ ...importedMatch, location: '1 rue A', locationName: 'Salle A' });

        await service.updateEvent('club-1', 'team-1', 'event-1', { location: '2 rue B' }, 'user-1');

        expect(prisma.event.update).toHaveBeenCalledWith({
          where: { id: 'event-1' },
          data: { location: '2 rue B', locationName: null },
        });
      });

      it('keeps the name when the same address is re-sent', async () => {
        givenEvent({ ...importedMatch, location: '1 rue A', locationName: 'Salle A' });

        await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { location: '1 rue A', notes: 'Maillots blancs' },
          'user-1',
        );

        expect(prisma.event.update).toHaveBeenCalledWith({
          where: { id: 'event-1' },
          data: { location: '1 rue A', notes: 'Maillots blancs' },
        });
      });

      it('accepts the placeholder re-sent unchanged on an unrelated edit', async () => {
        givenEvent(importedMatch);

        await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { location: UNKNOWN_EVENT_LOCATION, notes: 'Maillots blancs' },
          'user-1',
        );

        expect(prisma.event.update).toHaveBeenCalled();
      });

      it('refuses changing a known address to the placeholder', async () => {
        givenEvent({ ...importedMatch, location: '1 rue A' });

        await expect(
          service.updateEvent(
            'club-1',
            'team-1',
            'event-1',
            { location: ` ${UNKNOWN_EVENT_LOCATION} ` },
            'user-1',
          ),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.event.update).not.toHaveBeenCalled();
      });

      it('refuses a gym name without an address', async () => {
        givenEvent(importedMatch);

        await expect(
          service.updateEvent(
            'club-1',
            'team-1',
            'event-1',
            { locationName: 'Gymnase de la Trocardière' },
            'user-1',
          ),
        ).rejects.toThrow("Renseignez l'adresse de la salle");
        expect(prisma.event.update).not.toHaveBeenCalled();
      });

      it('queues a travel recompute when a match changes address', async () => {
        givenEvent(importedMatch);

        await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { location: '12 rue des Sports, Rezé' },
          'user-1',
        );

        expect(meetingPoints.enqueueRecompute).toHaveBeenCalledWith(['event-1']);
      });

      it('does not queue a recompute for a name-only change', async () => {
        givenEvent({ ...importedMatch, location: '1 rue A', locationName: 'Salle A' });

        await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { locationName: 'Salle Alpha' },
          'user-1',
        );

        expect(prisma.event.update).toHaveBeenCalledWith({
          where: { id: 'event-1' },
          data: { locationName: 'Salle Alpha' },
        });
        expect(meetingPoints.enqueueRecompute).not.toHaveBeenCalled();
      });

      it('does not queue a recompute when a training changes address', async () => {
        givenEvent({
          ...importedMatch,
          type: 'TRAINING',
          location: '1 rue A',
          opponentName: null,
          venue: null,
          externalId: null,
        });

        await service.updateEvent('club-1', 'team-1', 'event-1', { location: '2 rue B' }, 'user-1');

        expect(meetingPoints.enqueueRecompute).not.toHaveBeenCalled();
      });
    });

    describe('« Changement de salle »', () => {
      const future = new Date('2099-01-10T19:30:00.000Z');
      const match = {
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: future,
        location: '1 rue A, Rezé',
        locationName: 'Salle A',
        notes: null,
        opponentName: 'Rezé',
        venue: 'AWAY',
        recurrenceId: null,
        externalId: null,
        createdAt: new Date('2026-01-01'),
      };
      const convoked = [{ eventId: 'event-1', teamPlayerId: 'tp-1' }];
      const rsvps = [
        { eventId: 'event-1', teamPlayerId: 'tp-2', status: 'GOING' },
        { eventId: 'event-1', teamPlayerId: 'tp-3', status: 'MAYBE' },
      ];

      function givenMatch(row: Record<string, unknown>) {
        prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
        prisma.event.findUnique.mockResolvedValue(row);
        prisma.event.update.mockImplementation(({ where, data }) =>
          Promise.resolve({ ...row, id: where.id, ...data }),
        );
        // Only the venue audience reads filter on the roster's team; the
        // TeamEvent builders read the same tables without it.
        prisma.eventConvocation.findMany.mockImplementation(({ where }) =>
          Promise.resolve(where.teamPlayer ? convoked : []),
        );
        prisma.eventRsvp.findMany.mockImplementation(({ where }) =>
          Promise.resolve(
            where.teamPlayer ? rsvps.filter((r) => !where.status || r.status === where.status) : [],
          ),
        );
        prisma.teamPlayer.findMany.mockImplementation(({ where }) =>
          Promise.resolve(
            (where?.id?.in ?? []).map((id: string) =>
              audienceRow(id, `user-of-${id}`, id === 'tp-2' ? { guardians: ['parent-1'] } : {}),
            ),
          ),
        );
      }

      function venueNotifications() {
        return notifications.notify.mock.calls
          .flatMap(([inputs]) => inputs)
          .filter((input: { type: string }) => input.type === 'EVENT_VENUE_CHANGED');
      }

      it('tells the convoked and GOING players when a known venue moves', async () => {
        givenMatch(match);

        await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { location: '2 rue B, Nantes', locationName: 'Salle B' },
          'user-1',
        );

        const sent = venueNotifications();
        expect(sent.map((n: { userId: string }) => n.userId).sort()).toEqual([
          'parent-1',
          'user-of-tp-1',
          'user-of-tp-2',
        ]);
        expect(sent[0]).toEqual(
          expect.objectContaining({
            title: 'Changement de salle — U15 M',
            deepLink: '/clubs/club-1/teams/team-1/events/event-1',
          }),
        );
        expect(sent[0].body).toContain('se jouera à Salle B.');
        // MAYBE and unanswered players aren't expected there.
        expect(sent.map((n: { userId: string }) => n.userId)).not.toContain('user-of-tp-3');
      });

      it('is silent when « Lieu non communiqué » is filled in', async () => {
        givenMatch({ ...match, location: UNKNOWN_EVENT_LOCATION, locationName: null });

        await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { location: '2 rue B, Nantes', locationName: 'Salle B' },
          'user-1',
        );

        expect(venueNotifications()).toHaveLength(0);
      });

      it('is silent for a name-only change', async () => {
        givenMatch(match);

        await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { location: match.location, locationName: 'Salle Alpha' },
          'user-1',
        );

        expect(venueNotifications()).toHaveLength(0);
      });

      it('is silent when only whitespace or case changes', async () => {
        givenMatch(match);

        await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { location: '1  RUE A, rezé' },
          'user-1',
        );

        expect(venueNotifications()).toHaveLength(0);
      });

      it('is silent for a match that has already started', async () => {
        givenMatch({ ...match, startsAt: new Date('2020-01-10T19:30:00.000Z') });

        await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { location: '2 rue B, Nantes' },
          'user-1',
        );

        expect(venueNotifications()).toHaveLength(0);
      });

      it('is silent for a training', async () => {
        givenMatch({ ...match, type: 'TRAINING', opponentName: null, venue: null });

        await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { location: '2 rue B, Nantes' },
          'user-1',
        );

        expect(venueNotifications()).toHaveLength(0);
      });

      it('sends one notification per reader for a whole series, with the count', async () => {
        givenMatch({ ...match, recurrenceId: 'series-1' });
        prisma.event.findMany.mockImplementation(({ select }) =>
          Promise.resolve(
            select?.location
              ? [
                  { id: 'event-1', location: match.location },
                  { id: 'event-2', location: match.location },
                ]
              : [{ id: 'event-1' }, { id: 'event-2' }],
          ),
        );

        await service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { location: '2 rue B, Nantes', locationName: 'Salle B', scope: 'ALL' },
          'user-1',
        );

        const sent = venueNotifications();
        expect(sent).toHaveLength(3);
        expect(sent[0].body).toContain(
          'Les 2 prochains matchs de cette série se joueront à Salle B.',
        );
        expect(sent[0].deepLink).toBe('/clubs/club-1/teams/team-1');
      });

      it('never fails the edit when the notification does', async () => {
        givenMatch(match);
        notifications.notify.mockRejectedValueOnce(new Error('db down'));

        await expect(
          service.updateEvent(
            'club-1',
            'team-1',
            'event-1',
            { location: '2 rue B, Nantes' },
            'user-1',
          ),
        ).resolves.toHaveLength(1);
      });
    });

    it('clears the meeting-time override when the kick-off moves', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      const row = {
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-10T19:30:00.000Z'),
        location: 'Gymnase B',
        notes: null,
        opponentName: 'Rezé',
        venue: 'AWAY',
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      };
      prisma.event.findUnique.mockResolvedValue(row);
      prisma.event.update.mockResolvedValue({
        ...row,
        startsAt: new Date('2026-01-10T17:00:00.000Z'),
      });

      await service.updateEvent(
        'club-1',
        'team-1',
        'event-1',
        { startsAt: '2026-01-10T17:00:00.000Z' },
        'user-1',
      );

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { startsAt: new Date('2026-01-10T17:00:00.000Z') },
      });
      expect(prisma.eventMeeting.updateMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1'] } },
        data: { meetsAtOverride: null },
      });
      // The meeting time moved with the kick-off.
      expect(meetingPoints.announceMeetingChanges).toHaveBeenCalledWith(['event-1']);
    });

    it('queues the first travel recompute when a TRAINING becomes a MATCH', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      const row = {
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-10T19:30:00.000Z'),
        location: 'Gymnase B',
        notes: null,
        opponentName: null,
        venue: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      };
      prisma.event.findUnique.mockResolvedValue(row);
      prisma.event.update.mockResolvedValue({
        ...row,
        type: 'MATCH',
        opponentName: 'Rezé',
        venue: 'AWAY',
      });

      await service.updateEvent(
        'club-1',
        'team-1',
        'event-1',
        { type: EventType.MATCH, opponentName: 'Rezé', venue: EventVenue.AWAY },
        'user-1',
      );

      // Nothing to announce yet: no travel time, so no meeting hour. The
      // recompute job announces once the route is known.
      expect(meetingPoints.enqueueRecompute).toHaveBeenCalledWith(['event-1']);
      expect(meetingPoints.announceMeetingChanges).not.toHaveBeenCalled();
    });

    it('does not announce an edit that neither moves the kick-off nor changes the type', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      const row = {
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-10T19:30:00.000Z'),
        location: 'Gymnase B',
        notes: null,
        opponentName: 'Rezé',
        venue: 'AWAY',
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      };
      prisma.event.findUnique.mockResolvedValue(row);
      prisma.event.update.mockResolvedValue({ ...row, notes: 'Maillots blancs' });

      await service.updateEvent(
        'club-1',
        'team-1',
        'event-1',
        { notes: 'Maillots blancs' },
        'user-1',
      );

      expect(meetingPoints.announceMeetingChanges).not.toHaveBeenCalled();
    });

    it('returns the meeting plan MeetingPointsService resolves for each event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      const row = {
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-10T19:30:00.000Z'),
        location: 'Gymnase B',
        notes: null,
        opponentName: 'Rezé',
        venue: 'AWAY',
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      };
      const plan = {
        arrivalAt: '2026-01-10T18:45:00.000Z',
        arrivalBufferMinutes: 45,
        meetingPoint: { name: 'Parking', address: '1 rue X' },
        meetingPointSource: 'CLUB',
        travelMinutes: 23,
        travelMinutesSource: 'COMPUTED',
        meetsAt: '2026-01-10T18:15:00.000Z',
        meetsAtSource: 'COMPUTED',
      };
      prisma.event.findUnique.mockResolvedValue(row);
      prisma.event.update.mockResolvedValue(row);
      meetingPoints.resolvePlans.mockResolvedValue(new Map([['event-1', plan]]));

      const result = await service.updateEvent(
        'club-1',
        'team-1',
        'event-1',
        { location: 'Gymnase B' },
        'user-1',
      );

      expect(meetingPoints.resolvePlans).toHaveBeenCalledWith('team-1', [row]);
      expect(result[0].meetingPlan).toEqual(plan);
    });

    it('throws BadRequestException for scope THIS_AND_FUTURE on a non-recurring event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: null,
      });

      await expect(
        service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          {
            location: 'Gymnase B',
            scope: 'THIS_AND_FUTURE',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when startsAt is set with a non-THIS scope', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: 'series-1',
      });

      await expect(
        service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          {
            startsAt: '2026-01-06T18:00:00.000Z',
            scope: 'ALL',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException switching to MATCH with no opponentName', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: null,
      });

      await expect(
        service.updateEvent('club-1', 'team-1', 'event-1', { type: 'MATCH' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('clears opponentName when switching type to TRAINING', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: 'US Saint-Nazaire',
        venue: 'HOME',
        recurrenceId: null,
      });
      prisma.event.update.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        venue: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      await service.updateEvent('club-1', 'team-1', 'event-1', { type: 'TRAINING' }, 'user-1');

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: {
          type: 'TRAINING',
          opponentName: null,
          venue: null,
        },
      });
      // The meeting point is a MATCH concept, dropped with the opponent.
      expect(prisma.eventMeeting.deleteMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1'] } },
      });
      // So is the jersey wash: its duty and declines go with the switch.
      expect(prisma.eventJerseyDuty.deleteMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1'] } },
      });
      expect(prisma.eventJerseyDecline.deleteMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1'] } },
      });
    });

    it('throws BadRequestException switching to MATCH with an opponentName but no venue', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: null,
        venue: null,
        recurrenceId: null,
      });

      await expect(
        service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { type: 'MATCH', opponentName: 'US Saint-Nazaire' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('updates venue on a MATCH event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: 'US Saint-Nazaire',
        venue: 'HOME',
        recurrenceId: null,
      });
      prisma.event.update.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'US Saint-Nazaire',
        venue: 'AWAY',
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.updateEvent(
        'club-1',
        'team-1',
        'event-1',
        { venue: 'AWAY' },
        'user-1',
      );

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { venue: 'AWAY' },
      });
      expect(result[0].venue).toBe('AWAY');
    });

    it('scope THIS_AND_FUTURE updates this event and later same-series occurrences only', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: 'series-1',
      });
      prisma.event.findMany.mockResolvedValue([{ id: 'event-2' }, { id: 'event-3' }]);
      prisma.event.update.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-12T18:00:00.000Z'),
          location: 'Gymnase B',
          notes: null,
          opponentName: null,
          recurrenceId: 'series-1',
          createdAt: new Date('2026-01-01'),
        }),
      );

      const result = await service.updateEvent(
        'club-1',
        'team-1',
        'event-2',
        {
          location: 'Gymnase B',
          scope: 'THIS_AND_FUTURE',
        },
        'user-1',
      );

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: {
          teamId: 'team-1',
          recurrenceId: 'series-1',
          startsAt: { gte: new Date('2026-01-12T18:00:00.000Z') },
        },
        select: { id: true },
      });
      expect(prisma.event.update).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('scope ALL updates every event in the series regardless of startsAt', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: 'series-1',
      });
      prisma.event.findMany.mockResolvedValue([
        { id: 'event-1' },
        { id: 'event-2' },
        { id: 'event-3' },
      ]);
      prisma.event.update.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-12T18:00:00.000Z'),
          location: 'Gymnase B',
          notes: null,
          opponentName: null,
          recurrenceId: 'series-1',
          createdAt: new Date('2026-01-01'),
        }),
      );

      const result = await service.updateEvent(
        'club-1',
        'team-1',
        'event-2',
        {
          location: 'Gymnase B',
          scope: 'ALL',
        },
        'user-1',
      );

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1', recurrenceId: 'series-1' },
        select: { id: true },
      });
      expect(result).toHaveLength(3);
    });
  });

  describe('updateEventTimeOfDay', () => {
    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-2' });

      await expect(
        service.updateEventTimeOfDay(
          'club-1',
          'team-1',
          'event-1',
          {
            scope: 'ALL',
            hour: 19,
            minute: 30,
          },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on a non-recurring event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: null,
      });

      await expect(
        service.updateEventTimeOfDay(
          'club-1',
          'team-1',
          'event-1',
          {
            scope: 'ALL',
            hour: 19,
            minute: 30,
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.findMany).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('scope ALL applies the given Paris hour/minute to every row in the series, keeping each date unchanged', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: 'series-1',
      });
      // First findMany resolves the scope ids (resolveScopeIds), second
      // fetches the full rows for those ids.
      prisma.event.findMany
        .mockResolvedValueOnce([{ id: 'event-1' }, { id: 'event-2' }, { id: 'event-3' }])
        .mockResolvedValueOnce([
          {
            id: 'event-1',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: new Date('2026-01-05T18:00:00.000Z'),
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'event-2',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: new Date('2026-01-12T18:00:00.000Z'),
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'event-3',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: new Date('2026-01-19T18:00:00.000Z'),
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          },
        ]);
      prisma.event.update.mockImplementation(
        ({ where, data }: { where: { id: string }; data: { startsAt: Date } }) =>
          Promise.resolve({
            id: where.id,
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: data.startsAt,
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          }),
      );

      const result = await service.updateEventTimeOfDay(
        'club-1',
        'team-1',
        'event-2',
        {
          scope: 'ALL',
          hour: 19,
          minute: 30,
        },
        'user-1',
      );

      expect(prisma.event.findMany).toHaveBeenNthCalledWith(1, {
        where: { teamId: 'team-1', recurrenceId: 'series-1' },
        select: { id: true },
      });
      expect(prisma.event.findMany).toHaveBeenNthCalledWith(2, {
        where: { id: { in: ['event-1', 'event-2', 'event-3'] } },
      });
      expect(prisma.event.update).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.startsAt)).toEqual([
        '2026-01-05T18:30:00.000Z',
        '2026-01-12T18:30:00.000Z',
        '2026-01-19T18:30:00.000Z',
      ]);
    });

    it('scope THIS_AND_FUTURE narrows to this event and later same-series occurrences only', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: 'series-1',
      });
      prisma.event.findMany
        .mockResolvedValueOnce([{ id: 'event-2' }, { id: 'event-3' }])
        .mockResolvedValueOnce([
          {
            id: 'event-2',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: new Date('2026-01-12T18:00:00.000Z'),
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'event-3',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: new Date('2026-01-19T18:00:00.000Z'),
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          },
        ]);
      prisma.event.update.mockImplementation(
        ({ where, data }: { where: { id: string }; data: { startsAt: Date } }) =>
          Promise.resolve({
            id: where.id,
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: data.startsAt,
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          }),
      );

      const result = await service.updateEventTimeOfDay(
        'club-1',
        'team-1',
        'event-2',
        {
          scope: 'THIS_AND_FUTURE',
          hour: 20,
          minute: 0,
        },
        'user-1',
      );

      expect(prisma.event.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          teamId: 'team-1',
          recurrenceId: 'series-1',
          startsAt: { gte: new Date('2026-01-12T18:00:00.000Z') },
        },
        select: { id: true },
      });
      expect(prisma.event.update).toHaveBeenCalledTimes(2);
      expect(result.map((e) => e.startsAt)).toEqual([
        '2026-01-12T19:00:00.000Z',
        '2026-01-19T19:00:00.000Z',
      ]);
    });
  });

  describe('deleteEvent', () => {
    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.deleteEvent('club-1', 'team-1', 'event-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.event.deleteMany).not.toHaveBeenCalled();
    });

    it('notifies the convoked players, and gathers them before the cascade wipes the list', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        opponentName: 'ASVEL',
        recurrenceId: null,
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
      });
      prisma.eventConvocation.findMany.mockResolvedValue([
        { teamPlayerId: 'tp-2' },
        { teamPlayerId: 'tp-3' },
      ]);
      prisma.teamPlayer.findMany.mockResolvedValue([
        audienceRow('tp-2', 'user-2'),
        // No account behind this roster entry and no parent — nobody to tell.
        audienceRow('tp-3', null),
      ]);

      await service.deleteEvent('club-1', 'team-1', 'event-1');

      const convocationReadOrder = prisma.eventConvocation.findMany.mock.invocationCallOrder[0];
      const deleteOrder = prisma.event.deleteMany.mock.invocationCallOrder[0];
      // EventConvocation cascade-deletes with its Event: read after the
      // delete and there is nobody left to tell.
      expect(convocationReadOrder).toBeLessThan(deleteOrder);

      expect(notifications.notify).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: 'user-2',
          type: 'EVENT_CANCELLED',
          // The team's calendar, not the event — the event no longer exists.
          deepLink: '/clubs/club-1/teams/team-1',
        }),
      ]);
    });

    it('sends one summary notification for a whole series, not one per occurrence', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        opponentName: null,
        recurrenceId: 'rec-1',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
      });
      prisma.event.findMany.mockResolvedValue(
        Array.from({ length: 12 }, (_, index) => ({ id: `event-${index + 1}` })),
      );
      prisma.eventConvocation.findMany.mockResolvedValue([
        { teamPlayerId: 'tp-2' },
        // Same player convoked to several occurrences — deduplicated.
        { teamPlayerId: 'tp-2' },
      ]);
      prisma.teamPlayer.findMany.mockResolvedValue([audienceRow('tp-2', 'user-2')]);

      await service.deleteEvent('club-1', 'team-1', 'event-1', 'ALL');

      expect(notifications.notify).toHaveBeenCalledTimes(1);
      const batch = notifications.notify.mock.calls[0][0];
      expect(batch).toHaveLength(1);
      expect(batch[0].title).toContain('12 séances annulées');
    });

    it('notifies nobody when nobody had been convoked', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        opponentName: null,
        recurrenceId: null,
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
      });

      await service.deleteEvent('club-1', 'team-1', 'event-1');

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('deletes only this event by default (scope THIS)', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        recurrenceId: null,
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
      });

      await service.deleteEvent('club-1', 'team-1', 'event-1');

      expect(prisma.event.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['event-1'] } } });
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it('deletes any scoresheet objects from storage before the cascade removes their rows', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        recurrenceId: null,
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
      });
      prisma.eventScoresheet.findMany.mockResolvedValue([
        { storageKey: 'scoresheets/event-1/abc.jpg' },
      ]);

      await service.deleteEvent('club-1', 'team-1', 'event-1');

      expect(prisma.eventScoresheet.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1'] } },
        select: { storageKey: true },
      });
      expect(storage.deleteObject).toHaveBeenCalledWith('scoresheets/event-1/abc.jpg');
    });

    it('does not call storage at all when the deleted event has no scoresheet', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        recurrenceId: null,
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
      });

      await service.deleteEvent('club-1', 'team-1', 'event-1');

      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for scope ALL on a non-recurring event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        recurrenceId: null,
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
      });

      await expect(service.deleteEvent('club-1', 'team-1', 'event-1', 'ALL')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.event.deleteMany).not.toHaveBeenCalled();
    });

    it('scope THIS_AND_FUTURE deletes this event and later same-series occurrences only', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        recurrenceId: 'series-1',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
      });
      prisma.event.findMany.mockResolvedValue([{ id: 'event-2' }, { id: 'event-3' }]);

      await service.deleteEvent('club-1', 'team-1', 'event-2', 'THIS_AND_FUTURE');

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: {
          teamId: 'team-1',
          recurrenceId: 'series-1',
          startsAt: { gte: new Date('2026-01-12T18:00:00.000Z') },
        },
        select: { id: true },
      });
      expect(prisma.event.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['event-2', 'event-3'] } },
      });
    });

    it('serializes against a racing convocation change so a player added moments before the delete is still notified (issue #142)', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        opponentName: null,
        recurrenceId: null,
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
      });
      prisma.teamPlayer.count.mockResolvedValue(1);
      // teamPlayer.findMany backs two different call sites: setEventConvocations'
      // notifyNewlyConvoked recipient lookup (`where.id.in`) and its roster
      // re-fetch (`where.teamId`) — branch on the shape, same as the #141 test.
      prisma.teamPlayer.findMany.mockImplementation(async (args: { where?: unknown }) => {
        const where = args?.where as { id?: unknown } | undefined;
        if (where?.id) {
          return [audienceRow('tp-1', 'user-2')];
        }
        return [];
      });

      // A fake row set standing in for the EventConvocation table, so
      // deleteEvent's recipient read can actually observe a still-committing
      // convocation write — the thing the pre-fix code (an unlocked read run
      // outside any transaction) could race against and miss. Both reads
      // select just the teamPlayerId.
      const convoked = new Set<string>();
      prisma.eventConvocation.findMany.mockImplementation(async () =>
        Array.from(convoked).map((teamPlayerId) => ({ teamPlayerId })),
      );
      prisma.eventConvocation.upsert.mockImplementation(
        async ({ create }: { create: { teamPlayerId: string } }) => {
          convoked.add(create.teamPlayerId);
          return {};
        },
      );

      // Stands in for Postgres's Serializable isolation actually serializing
      // the two transactions: only one interactive transaction body runs at
      // a time, so deleteEvent's read only happens after setEventConvocations'
      // write has fully committed — exactly what the fix relies on so a
      // player convoked moments before the delete isn't missed.
      let chain: Promise<unknown> = Promise.resolve();
      prisma.$transaction.mockImplementation((opsOrFn: unknown) => {
        if (typeof opsOrFn !== 'function') return Promise.all(opsOrFn as unknown[]);
        const run = chain.then(() => (opsOrFn as (tx: unknown) => Promise<unknown>)(prisma));
        chain = run.catch(() => undefined);
        return run;
      });

      await Promise.all([
        service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1'], 'user-1'),
        service.deleteEvent('club-1', 'team-1', 'event-1'),
      ]);

      // The convocation write serialized before the delete's recipient read,
      // so the cancellation notice reaches the player who was just called up
      // — not silently dropped as it would be with a stale, unlocked read.
      expect(notifications.notify).toHaveBeenCalledWith([
        expect.objectContaining({ userId: 'user-2', type: 'EVENT_CANCELLED' }),
      ]);
    });

    it('scope ALL deletes every event in the series', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        recurrenceId: 'series-1',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
      });
      prisma.event.findMany.mockResolvedValue([
        { id: 'event-1' },
        { id: 'event-2' },
        { id: 'event-3' },
      ]);

      await service.deleteEvent('club-1', 'team-1', 'event-2', 'ALL');

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1', recurrenceId: 'series-1' },
        select: { id: true },
      });
      expect(prisma.event.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['event-1', 'event-2', 'event-3'] } },
      });
    });
  });

  describe('setMyRsvp', () => {
    const existingEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'TRAINING',
      startsAt: new Date('2026-01-05T18:00:00.000Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: null,
      recurrenceId: null,
      createdAt: new Date('2026-01-01'),
    };

    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-2' });

      await expect(
        service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'GOING'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.eventRsvp.upsert).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller has no roster row on the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue(null);

      await expect(
        service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'GOING'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.eventRsvp.upsert).not.toHaveBeenCalled();
    });

    it('upserts the caller own TeamPlayer RSVP and returns the event with myRsvpStatus set', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventConvocation.findUnique.mockResolvedValue({ id: 'conv-1' });

      const result = await service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'GOING');

      expect(prisma.eventRsvp.upsert).toHaveBeenCalledWith({
        where: { eventId_teamPlayerId: { eventId: 'event-1', teamPlayerId: 'tp-1' } },
        create: {
          eventId: 'event-1',
          teamPlayerId: 'tp-1',
          status: 'GOING',
          respondedAt: expect.any(Date),
          respondedByUserId: 'user-1',
          source: 'APP',
        },
        update: {
          status: 'GOING',
          respondedAt: expect.any(Date),
          respondedByUserId: 'user-1',
          source: 'APP',
        },
        include: { respondedBy: { select: { id: true, firstName: true, lastName: true } } },
      });
      expect(prisma.eventRsvpChange.create).toHaveBeenCalledWith({
        data: {
          eventId: 'event-1',
          teamPlayerId: 'tp-1',
          status: 'GOING',
          travelMode: 'MEETING_POINT',
          source: 'APP',
          respondedByUserId: 'user-1',
        },
      });
      expect(result.myRsvpStatus).toBe('GOING');
      expect(result.myConvocation).toBe(true);
      expect(result.myRsvpRespondedBy).toEqual({
        firstName: 'Sophie',
        lastInitial: 'M',
        isMe: true,
      });
      expect(result.myRsvpRespondedAt).toBe(RESPONDED_AT.toISOString());
      // A training has no travel choice.
      expect(result.myTravelMode).toBeNull();
    });

    it('lets a guardian answer for their child: the child’s slot, the guardian as respondent', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-child' });

      await service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'NOT_GOING', 'child-1');

      expect(prisma.teamPlayer.findFirst).toHaveBeenCalledWith({
        where: {
          teamId: 'team-1',
          playerId: 'child-1',
          player: { OR: [{ userId: 'user-1' }, { guardians: { some: { userId: 'user-1' } } }] },
        },
      });
      expect(prisma.eventRsvp.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId_teamPlayerId: { eventId: 'event-1', teamPlayerId: 'tp-child' } },
          create: expect.objectContaining({
            teamPlayerId: 'tp-child',
            respondedByUserId: 'user-1',
          }),
        }),
      );
    });

    it('refuses to answer for a player the caller may not act for, and writes nothing', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue(null);

      await expect(
        service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'GOING', 'stranger-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.eventRsvp.upsert).not.toHaveBeenCalled();
    });

    it('logs no change when there was no answer to clear', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventRsvp.deleteMany.mockResolvedValueOnce({ count: 0 });

      await service.clearMyRsvp('club-1', 'team-1', 'event-1', 'user-1');

      expect(prisma.eventRsvpChange.create).not.toHaveBeenCalled();
    });

    it('resolves the write in a bounded number of queries, without re-fetching the event or re-resolving the caller TeamPlayer', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

      await service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'GOING');

      expect(prisma.event.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.teamPlayer.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.eventConvocation.findUnique).toHaveBeenCalledWith({
        where: { eventId_teamPlayerId: { eventId: 'event-1', teamPlayerId: 'tp-1' } },
      });
      // The only extra cost is resolveEventRosterSummaries's fixed, bounded
      // 3 queries (one each, for this single event) needed to return a
      // fresh whole-roster rsvpSummary — not a per-event or per-roster-size
      // blow-up.
      expect(prisma.teamPlayer.count).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1'] } },
        select: { eventId: true, teamPlayerId: true, status: true },
      });
      expect(prisma.eventConvocation.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventConvocation.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1'] } },
        select: { eventId: true, teamPlayerId: true },
      });
    });
  });

  describe('clearMyRsvp', () => {
    const existingEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'TRAINING',
      startsAt: new Date('2026-01-05T18:00:00.000Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: null,
      recurrenceId: null,
      createdAt: new Date('2026-01-01'),
    };

    it('throws ForbiddenException when the caller has no roster row on the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue(null);

      await expect(service.clearMyRsvp('club-1', 'team-1', 'event-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.eventRsvp.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes the caller own TeamPlayer RSVP row and returns the event with myRsvpStatus null', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

      const result = await service.clearMyRsvp('club-1', 'team-1', 'event-1', 'user-1');

      expect(prisma.eventRsvp.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', teamPlayerId: 'tp-1' },
      });
      expect(prisma.eventRsvpChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: null, travelMode: null, source: 'APP' }),
      });
      expect(result.myRsvpStatus).toBeNull();
      expect(result.myConvocation).toBe(false);
    });

    it('resolves the write in a bounded number of queries, without re-fetching the event or re-resolving the caller TeamPlayer', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

      await service.clearMyRsvp('club-1', 'team-1', 'event-1', 'user-1');

      expect(prisma.event.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.teamPlayer.findFirst).toHaveBeenCalledTimes(1);
      // Same fixed, bounded resolveEventRosterSummaries cost as setMyRsvp —
      // one query per concern for this single event, needed for a fresh
      // whole-roster rsvpSummary.
      expect(prisma.teamPlayer.count).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1'] } },
        select: { eventId: true, teamPlayerId: true, status: true },
      });
      expect(prisma.eventConvocation.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('listEventRsvps', () => {
    it('returns one entry per roster member, null status for anyone who has not responded, and isMe for the caller', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });
      prisma.teamPlayer.findMany.mockResolvedValue([
        {
          id: 'tp-1',
          playerId: 'player-1',
          role: 'PLAYER',
          player: { firstName: 'Lea', lastName: 'Bernard', userId: 'user-1' },
          rsvps: [
            {
              status: 'GOING',
              respondedAt: new Date('2026-01-02'),
              respondedByUserId: 'user-1',
              respondedBy: { id: 'user-1', firstName: 'Lea', lastName: 'Bernard' },
            },
          ],
        },
        {
          id: 'tp-2',
          playerId: 'player-2',
          role: 'COACH',
          player: { firstName: 'Nathan', lastName: 'Hubert', userId: 'user-2' },
          rsvps: [],
        },
      ]);

      const result = await service.listEventRsvps('club-1', 'team-1', 'event-1', 'user-1');

      expect(prisma.teamPlayer.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        include: {
          player: true,
          rsvps: {
            where: { eventId: 'event-1' },
            include: { respondedBy: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
        orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
      });
      expect(result).toEqual([
        {
          teamPlayerId: 'tp-1',
          playerId: 'player-1',
          firstName: 'Lea',
          lastName: 'Bernard',
          role: 'PLAYER',
          status: 'GOING',
          respondedAt: '2026-01-02T00:00:00.000Z',
          respondedBy: { firstName: 'Lea', lastInitial: 'B', isMe: true },
          respondedByGuardian: false,
          viaLink: false,
          travelMode: null,
          isMe: true,
        },
        {
          teamPlayerId: 'tp-2',
          playerId: 'player-2',
          firstName: 'Nathan',
          lastName: 'Hubert',
          role: 'COACH',
          status: null,
          respondedAt: null,
          respondedBy: null,
          respondedByGuardian: false,
          viaLink: false,
          travelMode: null,
          isMe: false,
        },
      ]);
    });

    it('flags an answer a parent gave, and marks the persona’s row as « me » when acting for a child', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
      });
      prisma.player.findFirst.mockResolvedValue({ id: 'child-1' });
      prisma.teamPlayer.findMany.mockResolvedValue([
        {
          id: 'tp-child',
          playerId: 'child-1',
          role: 'PLAYER',
          player: { firstName: 'Léo', lastName: 'Martin', userId: null },
          rsvps: [
            {
              status: 'GOING',
              respondedAt: new Date('2026-01-02'),
              respondedByUserId: 'parent-1',
              respondedBy: { id: 'parent-1', firstName: 'Sophie', lastName: 'Martin' },
            },
          ],
        },
      ]);

      const [row] = await service.listEventRsvps(
        'club-1',
        'team-1',
        'event-1',
        'parent-1',
        'child-1',
      );

      expect(row.respondedByGuardian).toBe(true);
      expect(row.respondedBy).toEqual({
        firstName: 'Sophie',
        lastInitial: 'M',
        isMe: true,
      });
      expect(row.isMe).toBe(true);
    });

    it('carries each GOING member’s travel mode on a match, and nobody else’s', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-10T19:30:00.000Z'),
      });
      prisma.teamPlayer.findMany.mockResolvedValue([
        {
          id: 'tp-1',
          playerId: 'player-1',
          role: 'PLAYER',
          player: { firstName: 'Lea', lastName: 'Bernard', userId: 'user-1' },
          rsvps: [{ status: 'GOING', travelMode: 'DIRECT', respondedAt: new Date('2026-01-02') }],
        },
        {
          id: 'tp-2',
          playerId: 'player-2',
          role: 'PLAYER',
          player: { firstName: 'Nathan', lastName: 'Hubert', userId: 'user-2' },
          rsvps: [
            { status: 'MAYBE', travelMode: 'MEETING_POINT', respondedAt: new Date('2026-01-02') },
          ],
        },
      ]);

      const result = await service.listEventRsvps('club-1', 'team-1', 'event-1', 'user-1');

      expect(result.map((r) => r.travelMode)).toEqual(['DIRECT', null]);
    });
  });

  describe('setMyTravelMode', () => {
    const matchEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'MATCH',
      startsAt: new Date('2026-01-10T19:30:00.000Z'),
      location: 'Salle Coubertin',
      notes: null,
      opponentName: 'Rezé',
      venue: 'AWAY',
      recurrenceId: null,
      createdAt: new Date('2026-01-01'),
    };

    beforeEach(() => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.teamPlayer.count.mockResolvedValue(0);
    });

    it('refuses a training', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...matchEvent, type: 'TRAINING' });

      await expect(
        service.setMyTravelMode('club-1', 'team-1', 'event-1', 'user-1', 'DIRECT'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses someone who is not on the roster', async () => {
      prisma.event.findUnique.mockResolvedValue(matchEvent);

      await expect(
        service.setMyTravelMode('club-1', 'team-1', 'event-1', 'user-1', 'DIRECT'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a player who has not answered GOING', async () => {
      prisma.event.findUnique.mockResolvedValue(matchEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventRsvp.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.setMyTravelMode('club-1', 'team-1', 'event-1', 'user-1', 'DIRECT'),
      ).rejects.toThrow(BadRequestException);
    });

    it('writes the caller’s own GOING row and answers with the choice', async () => {
      prisma.event.findUnique.mockResolvedValue(matchEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

      const result = await service.setMyTravelMode(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'DIRECT',
      );

      expect(prisma.eventRsvp.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', teamPlayerId: 'tp-1', status: 'GOING' },
        data: { travelMode: 'DIRECT' },
      });
      expect(result.myRsvpStatus).toBe('GOING');
      expect(result.myTravelMode).toBe('DIRECT');
    });
  });

  describe('travel mode and RSVP', () => {
    const matchEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'MATCH',
      startsAt: new Date('2026-01-10T19:30:00.000Z'),
      location: 'Salle Coubertin',
      notes: null,
      opponentName: 'Rezé',
      venue: 'AWAY',
      recurrenceId: null,
      createdAt: new Date('2026-01-01'),
    };

    beforeEach(() => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(matchEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.teamPlayer.count.mockResolvedValue(0);
    });

    it('drops the travel choice when the answer leaves GOING', async () => {
      await service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'MAYBE');

      expect(prisma.eventRsvp.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ status: 'MAYBE', travelMode: 'MEETING_POINT' }),
        }),
      );
    });

    it('keeps a « Direct » when « Présent » is answered again', async () => {
      prisma.eventRsvp.upsert.mockResolvedValue({
        travelMode: 'DIRECT',
        respondedAt: RESPONDED_AT,
        respondedBy: null,
      });

      const result = await service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'GOING');

      expect(prisma.eventRsvp.upsert.mock.calls[0][0].update).not.toHaveProperty('travelMode');
      expect(result.myTravelMode).toBe('DIRECT');
    });

    it('reads a GOING player who never chose as coming to the meeting point', async () => {
      prisma.event.findMany.mockResolvedValue([matchEvent]);
      prisma.event.count.mockResolvedValue(1);
      prisma.eventRsvp.findMany.mockResolvedValue([
        {
          eventId: 'event-1',
          status: 'GOING',
          travelMode: 'MEETING_POINT',
          respondedAt: RESPONDED_AT,
          respondedBy: null,
        },
      ]);

      const { items } = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      expect(items[0].myTravelMode).toBe('MEETING_POINT');
    });
  });

  describe('setEventConvocations', () => {
    const existingEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'TRAINING',
      startsAt: new Date('2026-01-05T18:00:00.000Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: null,
      recurrenceId: null,
      createdAt: new Date('2026-01-01'),
    };

    beforeEach(() => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findMany.mockResolvedValue([]);
    });

    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-2' });

      await expect(
        service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1'], 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a teamPlayerId is not on the team roster', async () => {
      prisma.teamPlayer.count.mockResolvedValue(1);

      await expect(
        service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1', 'tp-2'], 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('convokes exactly the given teamPlayerIds, deleting every other convocation for the event', async () => {
      prisma.teamPlayer.count.mockResolvedValue(2);

      await service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1', 'tp-2'], 'user-1');

      expect(prisma.teamPlayer.count).toHaveBeenCalledWith({
        where: { id: { in: ['tp-1', 'tp-2'] }, teamId: 'team-1' },
      });
      expect(prisma.eventConvocation.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', teamPlayerId: { notIn: ['tp-1', 'tp-2'] } },
      });
      expect(prisma.eventConvocation.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.eventConvocation.upsert).toHaveBeenNthCalledWith(1, {
        where: { eventId_teamPlayerId: { eventId: 'event-1', teamPlayerId: 'tp-1' } },
        create: { eventId: 'event-1', teamPlayerId: 'tp-1' },
        update: {},
      });
      expect(prisma.eventConvocation.upsert).toHaveBeenNthCalledWith(2, {
        where: { eventId_teamPlayerId: { eventId: 'event-1', teamPlayerId: 'tp-2' } },
        create: { eventId: 'event-1', teamPlayerId: 'tp-2' },
        update: {},
      });
      // assertEventInTeam is verified once up front, not re-run via the
      // roster re-fetch at the end (would otherwise double the clubTeam/
      // event lookups on every write).
      expect(prisma.clubTeam.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.event.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.teamPlayer.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        include: { player: true, convocations: { where: { eventId: 'event-1' } } },
        orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
      });
    });

    it('clears every convocation for the event when given an empty list, without checking the roster', async () => {
      await service.setEventConvocations('club-1', 'team-1', 'event-1', [], 'user-1');

      expect(prisma.teamPlayer.count).not.toHaveBeenCalled();
      expect(prisma.eventConvocation.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', teamPlayerId: { notIn: [] } },
      });
      expect(prisma.eventConvocation.upsert).not.toHaveBeenCalled();
    });

    it('notifies only the players who were not already convoked', async () => {
      prisma.teamPlayer.count.mockResolvedValue(2);
      // tp-1 was already on the call-up; only tp-2 is news.
      prisma.eventConvocation.findMany.mockResolvedValue([{ teamPlayerId: 'tp-1' }]);
      prisma.teamPlayer.findMany.mockResolvedValueOnce([audienceRow('tp-2', 'user-2')]);

      await service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1', 'tp-2'], 'user-1');

      expect(prisma.teamPlayer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['tp-2'] } } }),
      );
      expect(notifications.notify).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: 'user-2',
          type: 'EVENT_CONVOCATION',
          deepLink: '/clubs/club-1/teams/team-1/events/event-1',
        }),
      ]);
    });

    it('adds the meeting point to the convocation once its time is known', async () => {
      prisma.teamPlayer.count.mockResolvedValue(1);
      prisma.eventConvocation.findMany.mockResolvedValue([]);
      prisma.teamPlayer.findMany.mockResolvedValueOnce([audienceRow('tp-2', 'user-2')]);
      meetingPoints.resolvePlans.mockResolvedValue(
        new Map([
          [
            'event-1',
            {
              meetingPoint: { name: 'Parking club', address: '1 rue X' },
              meetsAt: '2026-01-05T16:15:00.000Z',
            },
          ],
        ]),
      );

      await service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-2'], 'user-1');

      expect(notifications.notify).toHaveBeenCalledWith([
        expect.objectContaining({ body: expect.stringContaining('RDV à 17:15 — Parking club.') }),
      ]);
    });

    it('tells a playing parent convoked with their child once, in one merged message', async () => {
      prisma.teamPlayer.count.mockResolvedValue(2);
      prisma.eventConvocation.findMany.mockResolvedValue([]);
      prisma.teamPlayer.findMany.mockResolvedValueOnce([
        audienceRow('tp-parent', 'parent-1', { firstName: 'Sophie' }),
        audienceRow('tp-child', null, { firstName: 'Léo', guardians: ['parent-1'] }),
      ]);

      await service.setEventConvocations(
        'club-1',
        'team-1',
        'event-1',
        ['tp-parent', 'tp-child'],
        'user-1',
      );

      const batch = notifications.notify.mock.calls[0][0];
      expect(batch).toHaveLength(1);
      expect(batch[0]).toMatchObject({
        userId: 'parent-1',
        title: 'Léo et vous êtes convoqué·es — U15 M',
        subjectFirstName: null,
        deepLink: '/clubs/club-1/teams/team-1/events/event-1',
      });
    });

    it('tells a child’s own account and each parent, the parents through the child’s club', async () => {
      prisma.teamPlayer.count.mockResolvedValue(1);
      prisma.eventConvocation.findMany.mockResolvedValue([]);
      prisma.teamPlayer.findMany.mockResolvedValueOnce([
        audienceRow('tp-child', 'child-user', {
          firstName: 'Léo',
          clubId: 'club-partner',
          guardians: ['parent-1', 'parent-2'],
        }),
      ]);

      await service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-child'], 'user-1');

      const batch = notifications.notify.mock.calls[0][0];
      expect(batch).toHaveLength(3);
      expect(batch).toContainEqual(
        expect.objectContaining({
          userId: 'child-user',
          title: 'Vous êtes convoqué·e — U15 M',
          subjectFirstName: null,
          deepLink: '/clubs/club-1/teams/team-1/events/event-1',
        }),
      );
      expect(batch).toContainEqual(
        expect.objectContaining({
          userId: 'parent-2',
          title: 'Léo est convoqué·e — U15 M',
          subjectFirstName: 'Léo',
          deepLink: '/clubs/club-partner/teams/team-1/events/event-1?pour=player-of-tp-child',
        }),
      );
    });

    it('notifies nobody when a manager re-saves an unchanged call-up', async () => {
      prisma.teamPlayer.count.mockResolvedValue(2);
      prisma.eventConvocation.findMany.mockResolvedValue([
        { teamPlayerId: 'tp-1' },
        { teamPlayerId: 'tp-2' },
      ]);

      await service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1', 'tp-2'], 'user-1');

      // This endpoint is a full replace a manager re-submits on every tweak;
      // without the diff, every save would re-notify the whole roster.
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('skips a newly convoked player who has no account to notify', async () => {
      prisma.teamPlayer.count.mockResolvedValue(1);
      prisma.eventConvocation.findMany.mockResolvedValue([]);
      // Player.userId is nullable — a rostered player who never claimed an
      // account, and has no parent linked, has nobody behind them.
      prisma.teamPlayer.findMany.mockResolvedValueOnce([audienceRow('tp-1', null)]);

      await service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1'], 'user-1');

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('notifies each newly convoked player only once when two identical PATCHes race (issue #141)', async () => {
      prisma.teamPlayer.count.mockResolvedValue(2);
      // teamPlayer.findMany backs two different call sites here:
      // notifyNewlyConvoked's recipient lookup (`where.id.in`) and
      // fetchConvocationRoster's full-roster fetch (`where.teamId`) — branch
      // on the shape so each gets what it needs.
      prisma.teamPlayer.findMany.mockImplementation(async (args: { where?: unknown }) => {
        const where = args?.where as { id?: unknown } | undefined;
        if (where?.id) {
          return [audienceRow('tp-1', 'user-2')];
        }
        return [];
      });

      // A fake row set standing in for the DB table, so the "read the
      // existing list" step can actually observe a prior transaction's
      // write — the thing the pre-fix code (read before the transaction)
      // could never do.
      const convoked = new Set<string>();
      prisma.eventConvocation.findMany.mockImplementation(async () =>
        Array.from(convoked).map((teamPlayerId) => ({ teamPlayerId })),
      );
      prisma.eventConvocation.deleteMany.mockImplementation(
        async ({ where }: { where: { teamPlayerId: { notIn: string[] } } }) => {
          const keep = new Set(where.teamPlayerId.notIn);
          for (const id of Array.from(convoked)) {
            if (!keep.has(id)) convoked.delete(id);
          }
          return { count: 0 };
        },
      );
      prisma.eventConvocation.upsert.mockImplementation(
        async ({ create }: { create: { teamPlayerId: string } }) => {
          convoked.add(create.teamPlayerId);
          return {};
        },
      );

      // Stands in for Postgres's Serializable isolation actually
      // serializing the two transactions: only one interactive
      // transaction body runs at a time, so the second call's read only
      // happens after the first has fully committed its write — exactly
      // what the fix relies on to make the read-then-write atomic.
      let chain: Promise<unknown> = Promise.resolve();
      prisma.$transaction.mockImplementation((opsOrFn: unknown) => {
        if (typeof opsOrFn !== 'function') return Promise.all(opsOrFn as unknown[]);
        const run = chain.then(() => (opsOrFn as (tx: unknown) => Promise<unknown>)(prisma));
        chain = run.catch(() => undefined);
        return run;
      });

      // Both requests are the *same* logical submission (double-click,
      // client retry) carrying the same call-up.
      await Promise.all([
        service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1', 'tp-2'], 'user-1'),
        service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1', 'tp-2'], 'user-1'),
      ]);

      // Only the transaction that commits first finds tp-1/tp-2 new; the
      // second reads a list that already contains both, so nobody is
      // notified twice for one logical submission.
      expect(notifications.notify).toHaveBeenCalledTimes(1);
    });
  });

  describe('listEventConvocations', () => {
    it('returns one entry per roster member, false/null for anyone not convoked, and isMe for the caller', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });
      prisma.teamPlayer.findMany.mockResolvedValue([
        {
          id: 'tp-1',
          playerId: 'player-1',
          role: 'PLAYER',
          player: { firstName: 'Lea', lastName: 'Bernard', userId: 'user-1' },
          convocations: [{ convokedAt: new Date('2026-01-02') }],
        },
        {
          id: 'tp-2',
          playerId: 'player-2',
          role: 'COACH',
          player: { firstName: 'Nathan', lastName: 'Hubert', userId: 'user-2' },
          convocations: [],
        },
      ]);

      const result = await service.listEventConvocations('club-1', 'team-1', 'event-1', 'user-1');

      expect(prisma.teamPlayer.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        include: { player: true, convocations: { where: { eventId: 'event-1' } } },
        orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
      });
      expect(result).toEqual([
        {
          teamPlayerId: 'tp-1',
          playerId: 'player-1',
          firstName: 'Lea',
          lastName: 'Bernard',
          role: 'PLAYER',
          convoked: true,
          convokedAt: '2026-01-02T00:00:00.000Z',
          isMe: true,
        },
        {
          teamPlayerId: 'tp-2',
          playerId: 'player-2',
          firstName: 'Nathan',
          lastName: 'Hubert',
          role: 'COACH',
          convoked: false,
          convokedAt: null,
          isMe: false,
        },
      ]);
    });
  });

  describe('setEventLogistics', () => {
    const matchEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'MATCH',
      startsAt: new Date('2026-01-05T18:00:00.000Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: 'ES Rezé',
      venue: 'HOME',
      jerseysTeamPlayerId: null,
      ballsTeamPlayerId: null,
      recurrenceId: null,
      externalId: null,
      timeConfirmed: true,
      createdAt: new Date('2026-01-01'),
    };
    const trainingEvent = { ...matchEvent, type: 'TRAINING', opponentName: null, venue: null };

    // findFirst backs two different lookups here (the caller's own
    // TeamPlayer, and the "is teamPlayerId on this roster" check) —
    // distinguished by the shape of `where` rather than call order, so each
    // test only needs to state what's actually rostered.
    function mockRoster(options: { callerTeamPlayerId?: string; rosterTeamPlayerIds?: string[] }) {
      prisma.teamPlayer.findFirst.mockImplementation(({ where }: { where: any }) => {
        if ('player' in where) {
          return Promise.resolve(
            options.callerTeamPlayerId ? { id: options.callerTeamPlayerId } : null,
          );
        }
        const onRoster = (options.rosterTeamPlayerIds ?? []).includes(where.id);
        return Promise.resolve(onRoster ? { id: where.id } : null);
      });
    }

    beforeEach(() => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(matchEvent);
      prisma.event.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...matchEvent, ...data }),
      );
      prisma.teamPlayer.findMany.mockResolvedValue([]);
    });

    it('allows logistics assignment on a TRAINING event too — no event.type gate', async () => {
      prisma.event.findUnique.mockResolvedValue(trainingEvent);
      prisma.event.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...trainingEvent, ...data }),
      );
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1'] });

      const result = await service.setEventLogistics(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'JERSEYS',
        'tp-1',
      );

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { jerseysTeamPlayerId: 'tp-1' },
      });
      expect(result.type).toBe('TRAINING');
    });

    it('answers USE_JERSEY_DUTY for the jersey slot of a MATCH on a team with the rotation on', async () => {
      prisma.team.findUniqueOrThrow.mockResolvedValue({ jerseyRotationEnabled: true });
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1'] });

      await expect(
        service.setEventLogistics('club-1', 'team-1', 'event-1', 'user-1', 'JERSEYS', 'tp-1'),
      ).rejects.toMatchObject({ response: { code: 'USE_JERSEY_DUTY' } });
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('leaves the balls slot of a MATCH alone on a team with the rotation on', async () => {
      prisma.team.findUniqueOrThrow.mockResolvedValue({ jerseyRotationEnabled: true });
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1'] });

      await service.setEventLogistics('club-1', 'team-1', 'event-1', 'user-1', 'BALLS', 'tp-1');

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { ballsTeamPlayerId: 'tp-1' },
      });
    });

    it('nulls logistics.jerseys beside a jerseyDuty, whatever the old column held', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...matchEvent, jerseysTeamPlayerId: 'tp-9' });
      prisma.event.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...matchEvent, jerseysTeamPlayerId: 'tp-9', ...data }),
      );
      prisma.team.findUniqueOrThrow.mockResolvedValue({ jerseyRotationEnabled: false });
      jerseyDuty.resolveSummaries.mockResolvedValue(
        new Map([
          ['event-1', { holder: null, status: 'UNASSIGNED', broughtBy: null, isMine: false }],
        ]),
      );
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1'] });

      const result = await service.setEventLogistics(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'BALLS',
        'tp-1',
      );

      expect(result.jerseyDuty).toEqual({
        holder: null,
        status: 'UNASSIGNED',
        broughtBy: null,
        isMine: false,
      });
      expect(result.logistics.jerseys).toBeNull();
    });

    it('allows a rostered non-manager to self-assign', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1'] });

      const result = await service.setEventLogistics(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'JERSEYS',
        'tp-1',
      );

      // Only the read-side WhatsApp visibility check, never the write gate.
      expect(teamManagerGuard.isTeamManager).toHaveBeenCalledTimes(1);
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { jerseysTeamPlayerId: 'tp-1' },
      });
      expect(result.type).toBe('MATCH');
    });

    it('allows a rostered non-manager to self-clear their own assignment', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...matchEvent, ballsTeamPlayerId: 'tp-1' });
      mockRoster({ callerTeamPlayerId: 'tp-1' });

      await service.setEventLogistics('club-1', 'team-1', 'event-1', 'user-1', 'BALLS', null);

      expect(teamManagerGuard.isTeamManager).toHaveBeenCalledTimes(1);
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { ballsTeamPlayerId: null },
      });
    });

    it('forbids a non-manager from assigning a teammate', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1', 'tp-2'] });
      teamManagerGuard.isTeamManager.mockResolvedValue(false);

      await expect(
        service.setEventLogistics('club-1', 'team-1', 'event-1', 'user-1', 'JERSEYS', 'tp-2'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('allows a manager to reassign anyone', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1', 'tp-2'] });
      teamManagerGuard.isTeamManager.mockResolvedValue(true);

      const result = await service.setEventLogistics(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'JERSEYS',
        'tp-2',
      );

      expect(teamManagerGuard.isTeamManager).toHaveBeenCalledWith('club-1', 'team-1', 'user-1');
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { jerseysTeamPlayerId: 'tp-2' },
      });
      expect(result.type).toBe('MATCH');
    });

    it('throws BadRequestException when the teamPlayerId is not on this team roster', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1' });
      teamManagerGuard.isTeamManager.mockResolvedValue(true);

      await expect(
        service.setEventLogistics('club-1', 'team-1', 'event-1', 'user-1', 'JERSEYS', 'tp-off'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('resolves the assignee display name in the returned event', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1'] });
      prisma.teamPlayer.findMany.mockResolvedValue([
        {
          id: 'tp-1',
          player: { firstName: 'Lea', lastName: 'Bernard' },
        },
      ]);

      const result = await service.setEventLogistics(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'JERSEYS',
        'tp-1',
      );

      expect(result.logistics).toEqual({
        jerseys: { teamPlayerId: 'tp-1', firstName: 'Lea', lastName: 'Bernard' },
        balls: null,
      });
    });
  });

  describe('castVote', () => {
    const HOUR_MS = 60 * 60 * 1000;
    const DAY_MS = 24 * HOUR_MS;
    // Within the vote window (opens startsAt+1h, closes startsAt+5d) for
    // every test that isn't specifically exercising a window boundary.
    const withinWindowMatchEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'MATCH',
      startsAt: new Date(Date.now() - 2 * DAY_MS),
      location: 'Gymnase A',
      notes: null,
      opponentName: 'ES Rezé',
      venue: 'HOME',
      jerseysTeamPlayerId: null,
      ballsTeamPlayerId: null,
      recurrenceId: null,
      externalId: null,
      timeConfirmed: true,
      createdAt: new Date('2020-01-01'),
    };
    const beforeWindowOpensEvent = {
      ...withinWindowMatchEvent,
      // Match started 30 minutes ago — the window doesn't open until 1h.
      startsAt: new Date(Date.now() - 30 * 60 * 1000),
    };
    const afterWindowClosesEvent = {
      ...withinWindowMatchEvent,
      startsAt: new Date(Date.now() - 6 * DAY_MS),
    };
    const trainingEvent = {
      ...withinWindowMatchEvent,
      type: 'TRAINING',
      opponentName: null,
      venue: null,
    };

    function mockRoster(options: { callerTeamPlayerId?: string; rosterTeamPlayerIds?: string[] }) {
      prisma.teamPlayer.findFirst.mockImplementation(({ where }: { where: any }) => {
        if ('player' in where) {
          return Promise.resolve(
            options.callerTeamPlayerId ? { id: options.callerTeamPlayerId } : null,
          );
        }
        const onRoster = (options.rosterTeamPlayerIds ?? []).includes(where.id);
        return Promise.resolve(onRoster ? { id: where.id } : null);
      });
    }

    beforeEach(() => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(withinWindowMatchEvent);
      prisma.eventVote.findMany.mockResolvedValue([]);
      prisma.teamPlayer.count.mockResolvedValue(0);
      // Default: the caller was marked present and convoked — tests about
      // the present/convoked-only rule itself override these.
      prisma.eventRsvp.findUnique.mockResolvedValue({ status: 'GOING' });
      prisma.eventConvocation.findUnique.mockResolvedValue({ convokedAt: new Date() });
    });

    it('throws BadRequestException on a TRAINING event', async () => {
      prisma.event.findUnique.mockResolvedValue(trainingEvent);
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1', 'tp-2'] });

      await expect(
        service.castVote('club-1', 'team-1', 'event-1', 'user-1', 'BEST', 'tp-2'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.eventVote.upsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException before the vote window opens (1h after kickoff)', async () => {
      prisma.event.findUnique.mockResolvedValue(beforeWindowOpensEvent);
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1', 'tp-2'] });

      await expect(
        service.castVote('club-1', 'team-1', 'event-1', 'user-1', 'BEST', 'tp-2'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.eventVote.upsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException once the vote window has closed (5 days after kickoff)', async () => {
      prisma.event.findUnique.mockResolvedValue(afterWindowClosesEvent);
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1', 'tp-2'] });

      await expect(
        service.castVote('club-1', 'team-1', 'event-1', 'user-1', 'BEST', 'tp-2'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.eventVote.upsert).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller is not rostered', async () => {
      mockRoster({});

      await expect(
        service.castVote('club-1', 'team-1', 'event-1', 'user-1', 'BEST', 'tp-2'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.eventVote.upsert).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller was not marked present (RSVP status other than GOING)', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1', 'tp-2'] });
      prisma.eventRsvp.findUnique.mockResolvedValue({ status: 'MAYBE' });

      await expect(
        service.castVote('club-1', 'team-1', 'event-1', 'user-1', 'BEST', 'tp-2'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.eventVote.upsert).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller never RSVPed at all', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1', 'tp-2'] });
      prisma.eventRsvp.findUnique.mockResolvedValue(null);

      await expect(
        service.castVote('club-1', 'team-1', 'event-1', 'user-1', 'BEST', 'tp-2'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.eventVote.upsert).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller was present but never convoked for this match', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1', 'tp-2'] });
      prisma.eventConvocation.findUnique.mockResolvedValue(null);

      await expect(
        service.castVote('club-1', 'team-1', 'event-1', 'user-1', 'BEST', 'tp-2'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.eventVote.upsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on a self-vote', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1'] });

      await expect(
        service.castVote('club-1', 'team-1', 'event-1', 'user-1', 'BEST', 'tp-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.eventVote.upsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the target is not on this team roster', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1'] });

      await expect(
        service.castVote('club-1', 'team-1', 'event-1', 'user-1', 'BEST', 'tp-off'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.eventVote.upsert).not.toHaveBeenCalled();
    });

    it('upserts on recast — updates the existing row rather than duplicating it', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1', 'tp-2'] });
      prisma.eventVote.upsert.mockResolvedValue({});

      await service.castVote('club-1', 'team-1', 'event-1', 'user-1', 'BEST', 'tp-2');

      expect(prisma.eventVote.upsert).toHaveBeenCalledWith({
        where: {
          eventId_category_voterTeamPlayerId: {
            eventId: 'event-1',
            category: 'BEST',
            voterTeamPlayerId: 'tp-1',
          },
        },
        create: {
          eventId: 'event-1',
          category: 'BEST',
          voterTeamPlayerId: 'tp-1',
          votedTeamPlayerId: 'tp-2',
        },
        update: { votedTeamPlayerId: 'tp-2' },
      });
    });

    it('returns the aggregated results after a successful vote', async () => {
      mockRoster({ callerTeamPlayerId: 'tp-1', rosterTeamPlayerIds: ['tp-1', 'tp-2'] });
      prisma.eventVote.upsert.mockResolvedValue({});
      prisma.eventVote.findMany.mockResolvedValue([
        {
          category: 'BEST',
          voterTeamPlayerId: 'tp-1',
          votedTeamPlayerId: 'tp-2',
          votedFor: { player: { firstName: 'Léa', lastName: 'Martin' } },
        },
      ]);
      prisma.teamPlayer.count.mockResolvedValue(2);

      const result = await service.castVote(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'BEST',
        'tp-2',
      );

      expect(result).toEqual({
        best: [{ teamPlayerId: 'tp-2', firstName: 'Léa', lastName: 'Martin', voteCount: 1 }],
        worst: [],
        totalVoters: 2,
        votesCast: 1,
        myVote: { best: 'tp-2', worst: null },
        myVoteHidden: false,
      });
    });
  });

  describe('getEventVoteResults', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    // Within the vote window (not yet ended) unless a test specifically
    // wants the "vote has ended, results are public" behavior.
    const matchEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'MATCH',
      startsAt: new Date(Date.now() - 2 * DAY_MS),
      location: 'Gymnase A',
      notes: null,
      opponentName: 'ES Rezé',
      venue: 'HOME',
      jerseysTeamPlayerId: null,
      ballsTeamPlayerId: null,
      recurrenceId: null,
      externalId: null,
      timeConfirmed: true,
      createdAt: new Date('2020-01-01'),
    };
    const endedMatchEvent = { ...matchEvent, startsAt: new Date(Date.now() - 6 * DAY_MS) };

    beforeEach(() => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(matchEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue(null);
    });

    it('throws BadRequestException on a TRAINING event', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...matchEvent, type: 'TRAINING' });

      await expect(
        service.getEventVoteResults('club-1', 'team-1', 'event-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    const fourVoteFixture = [
      {
        category: 'BEST',
        voterTeamPlayerId: 'tp-1',
        votedTeamPlayerId: 'tp-2',
        votedFor: { player: { firstName: 'Léa', lastName: 'Martin' } },
      },
      {
        category: 'BEST',
        voterTeamPlayerId: 'tp-3',
        votedTeamPlayerId: 'tp-2',
        votedFor: { player: { firstName: 'Léa', lastName: 'Martin' } },
      },
      {
        category: 'BEST',
        voterTeamPlayerId: 'tp-4',
        votedTeamPlayerId: 'tp-5',
        votedFor: { player: { firstName: 'Chloé', lastName: 'Dubois' } },
      },
      {
        category: 'WORST',
        voterTeamPlayerId: 'tp-1',
        votedTeamPlayerId: 'tp-6',
        votedFor: { player: { firstName: 'Nina', lastName: 'Perrin' } },
      },
    ];

    it('withholds best/worst (but keeps totalVoters/votesCast) when the caller has not voted yet — "vote to see results"', async () => {
      // Default beforeEach: teamPlayer.findFirst resolves null, so the
      // caller has no roster row at all — the strictest "haven't voted"
      // case, but the same withholding applies to any rostered caller who
      // simply hasn't cast a BEST vote yet.
      prisma.eventVote.findMany.mockResolvedValue(fourVoteFixture);
      prisma.teamPlayer.count.mockResolvedValue(6);

      const result = await service.getEventVoteResults('club-1', 'team-1', 'event-1', 'user-1');

      expect(result.best).toEqual([]);
      expect(result.worst).toEqual([]);
      expect(result.totalVoters).toBe(6);
      expect(result.votesCast).toBe(3);
      expect(result.myVote).toEqual({ best: null, worst: null });
    });

    it('aggregates both categories, sorted descending, without ever exposing voterTeamPlayerId, once the caller has voted', async () => {
      // tp-1 (the caller) already cast a BEST vote in this fixture, so
      // results are no longer withheld.
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventVote.findMany.mockResolvedValue(fourVoteFixture);
      prisma.teamPlayer.count.mockResolvedValue(6);

      const result = await service.getEventVoteResults('club-1', 'team-1', 'event-1', 'user-1');

      expect(result.best).toEqual([
        { teamPlayerId: 'tp-2', firstName: 'Léa', lastName: 'Martin', voteCount: 2 },
        { teamPlayerId: 'tp-5', firstName: 'Chloé', lastName: 'Dubois', voteCount: 1 },
      ]);
      expect(result.worst).toEqual([
        { teamPlayerId: 'tp-6', firstName: 'Nina', lastName: 'Perrin', voteCount: 1 },
      ]);
      expect(result.totalVoters).toBe(6);
      expect(result.votesCast).toBe(3);
      // Explicit assertion, not just implicit from the mapped shape — a
      // voterTeamPlayerId leak here would be a real privacy regression (see
      // EventVote's schema comment).
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('voterTeamPlayerId');
      expect(serialized).not.toContain('tp-3');
      expect(serialized).not.toContain('tp-4');
    });

    it("resolves myVote from the caller's own rows", async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventVote.findMany.mockResolvedValue([
        {
          category: 'BEST',
          voterTeamPlayerId: 'tp-1',
          votedTeamPlayerId: 'tp-2',
          votedFor: { player: { firstName: 'Léa', lastName: 'Martin' } },
        },
      ]);
      prisma.teamPlayer.count.mockResolvedValue(2);

      const result = await service.getEventVoteResults('club-1', 'team-1', 'event-1', 'user-1');

      expect(result.myVote).toEqual({ best: 'tp-2', worst: null });
    });

    it("hides the caller's own vote, but not the leaderboard it unlocks, when asked to", async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventVote.findMany.mockResolvedValue([
        {
          category: 'BEST',
          voterTeamPlayerId: 'tp-1',
          votedTeamPlayerId: 'tp-2',
          votedFor: { player: { firstName: 'Léa', lastName: 'Martin' } },
        },
      ]);
      prisma.teamPlayer.count.mockResolvedValue(2);

      const result = await service.getEventVoteResults(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        true,
      );

      expect(result.myVote).toEqual({ best: null, worst: null });
      expect(result.myVoteHidden).toBe(true);
      expect(result.best).toHaveLength(1);
    });

    it('breaks a vote-count tie alphabetically (lastName, then firstName) for a stable order', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventVote.findMany.mockResolvedValue([
        {
          category: 'BEST',
          voterTeamPlayerId: 'tp-1',
          votedTeamPlayerId: 'tp-9',
          votedFor: { player: { firstName: 'Nina', lastName: 'Zidane' } },
        },
        {
          category: 'BEST',
          voterTeamPlayerId: 'tp-2',
          votedTeamPlayerId: 'tp-8',
          votedFor: { player: { firstName: 'Julie', lastName: 'Abal' } },
        },
      ]);
      prisma.teamPlayer.count.mockResolvedValue(2);

      const result = await service.getEventVoteResults('club-1', 'team-1', 'event-1', 'user-1');

      expect(result.best.map((r) => r.lastName)).toEqual(['Abal', 'Zidane']);
    });

    it('makes results public to everyone once the vote window has ended, even for a caller who never voted', async () => {
      // Default beforeEach: teamPlayer.findFirst resolves null — the caller
      // has no roster row at all and never voted, yet still sees results
      // because the window is over.
      prisma.event.findUnique.mockResolvedValue(endedMatchEvent);
      prisma.eventVote.findMany.mockResolvedValue(fourVoteFixture);
      prisma.teamPlayer.count.mockResolvedValue(6);

      const result = await service.getEventVoteResults('club-1', 'team-1', 'event-1', 'user-1');

      expect(result.best).toEqual([
        { teamPlayerId: 'tp-2', firstName: 'Léa', lastName: 'Martin', voteCount: 2 },
        { teamPlayerId: 'tp-5', firstName: 'Chloé', lastName: 'Dubois', voteCount: 1 },
      ]);
      expect(result.worst).toEqual([
        { teamPlayerId: 'tp-6', firstName: 'Nina', lastName: 'Perrin', voteCount: 1 },
      ]);
      expect(result.myVote).toEqual({ best: null, worst: null });
    });
  });

  describe('getScoresheetUploadUrl', () => {
    const matchEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'MATCH',
      startsAt: new Date('2026-01-01T18:00:00Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: 'ES Rezé',
      venue: 'HOME',
      jerseysTeamPlayerId: null,
      ballsTeamPlayerId: null,
      recurrenceId: null,
      externalId: null,
      timeConfirmed: true,
      createdAt: new Date('2020-01-01'),
    };

    beforeEach(() => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(matchEvent);
    });

    it('throws BadRequestException on a TRAINING event', async () => {
      prisma.event.findUnique.mockResolvedValue({ ...matchEvent, type: 'TRAINING' });
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

      await expect(
        service.getScoresheetUploadUrl('club-1', 'team-1', 'event-1', 'user-1', 'image/jpeg'),
      ).rejects.toThrow(BadRequestException);
      expect(storage.getUploadUrl).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller is not rostered on this team', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue(null);

      await expect(
        service.getScoresheetUploadUrl('club-1', 'team-1', 'event-1', 'user-1', 'image/jpeg'),
      ).rejects.toThrow(ForbiddenException);
      expect(storage.getUploadUrl).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for an unsupported content type', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

      await expect(
        service.getScoresheetUploadUrl('club-1', 'team-1', 'event-1', 'user-1', 'application/zip'),
      ).rejects.toThrow(BadRequestException);
      expect(storage.getUploadUrl).not.toHaveBeenCalled();
    });

    it('returns a presigned upload URL and an event-scoped storageKey for an allowed content type', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

      const result = await service.getScoresheetUploadUrl(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'image/png',
      );

      expect(result.uploadUrl).toBe('https://signed.example/upload');
      expect(result.storageKey).toMatch(/^scoresheets\/event-1\/[0-9a-f-]+\.png$/);
      expect(storage.getUploadUrl).toHaveBeenCalledWith(result.storageKey, 'image/png');
    });

    it('accepts a PDF scoresheet export', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

      const result = await service.getScoresheetUploadUrl(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'application/pdf',
      );

      expect(result.storageKey).toMatch(/^scoresheets\/event-1\/[0-9a-f-]+\.pdf$/);
      expect(storage.getUploadUrl).toHaveBeenCalledWith(result.storageKey, 'application/pdf');
    });
  });

  describe('confirmScoresheetUpload', () => {
    const matchEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'MATCH',
      startsAt: new Date('2026-01-01T18:00:00Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: 'ES Rezé',
      venue: 'HOME',
      jerseysTeamPlayerId: null,
      ballsTeamPlayerId: null,
      recurrenceId: null,
      externalId: null,
      timeConfirmed: true,
      createdAt: new Date('2020-01-01'),
    };

    beforeEach(() => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(matchEvent);
    });

    it('throws ForbiddenException when the caller is not rostered on this team', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue(null);

      await expect(
        service.confirmScoresheetUpload(
          'club-1',
          'team-1',
          'event-1',
          'user-1',
          'scoresheets/event-1/abc.jpg',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.eventScoresheet.upsert).not.toHaveBeenCalled();
    });

    it('upserts on confirm — a retried upload updates the one row rather than duplicating it', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventScoresheet.upsert.mockResolvedValue({
        id: 'sheet-1',
        status: 'UPLOADED',
        uploadedByTeamPlayerId: 'tp-1',
        uploadedAt: new Date('2026-01-01T20:00:00Z'),
      });

      const result = await service.confirmScoresheetUpload(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'scoresheets/event-1/abc.jpg',
      );

      expect(prisma.eventScoresheet.upsert).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
        create: {
          eventId: 'event-1',
          storageKey: 'scoresheets/event-1/abc.jpg',
          uploadedByTeamPlayerId: 'tp-1',
        },
        update: {
          storageKey: 'scoresheets/event-1/abc.jpg',
          uploadedByTeamPlayerId: 'tp-1',
          uploadedAt: expect.any(Date),
          status: 'UPLOADED',
        },
      });
      expect(result).toEqual({
        status: 'QUEUED',
        uploadedByTeamPlayerId: 'tp-1',
        uploadedAt: '2026-01-01T20:00:00.000Z',
      });
      expect(scoresheets.enqueueOcr).toHaveBeenCalledWith('sheet-1');
    });

    it('does not attempt to delete anything on a first-ever upload (no previous row)', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventScoresheet.findUnique.mockResolvedValue(null);
      prisma.eventScoresheet.upsert.mockResolvedValue({
        id: 'sheet-1',
        status: 'UPLOADED',
        uploadedByTeamPlayerId: 'tp-1',
        uploadedAt: new Date('2026-01-01T20:00:00Z'),
      });

      await service.confirmScoresheetUpload(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'scoresheets/event-1/abc.jpg',
      );

      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('deletes the previous object from storage when a replace/retry changes the storageKey', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        storageKey: 'scoresheets/event-1/old.jpg',
      });
      prisma.eventScoresheet.upsert.mockResolvedValue({
        id: 'sheet-1',
        status: 'UPLOADED',
        uploadedByTeamPlayerId: 'tp-1',
        uploadedAt: new Date('2026-01-01T20:00:00Z'),
      });

      await service.confirmScoresheetUpload(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'scoresheets/event-1/new.jpg',
      );

      expect(storage.deleteObject).toHaveBeenCalledWith('scoresheets/event-1/old.jpg');
    });

    it('does not delete anything when a retried confirm reuses the same storageKey', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        storageKey: 'scoresheets/event-1/abc.jpg',
      });
      prisma.eventScoresheet.upsert.mockResolvedValue({
        id: 'sheet-1',
        status: 'UPLOADED',
        uploadedByTeamPlayerId: 'tp-1',
        uploadedAt: new Date('2026-01-01T20:00:00Z'),
      });

      await service.confirmScoresheetUpload(
        'club-1',
        'team-1',
        'event-1',
        'user-1',
        'scoresheets/event-1/abc.jpg',
      );

      expect(storage.deleteObject).not.toHaveBeenCalled();
    });

    it('does not let a storage delete failure surface as an error — the DB write already succeeded', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        storageKey: 'scoresheets/event-1/old.jpg',
      });
      prisma.eventScoresheet.upsert.mockResolvedValue({
        id: 'sheet-1',
        status: 'UPLOADED',
        uploadedByTeamPlayerId: 'tp-1',
        uploadedAt: new Date('2026-01-01T20:00:00Z'),
      });
      storage.deleteObject.mockRejectedValue(new Error('R2 unavailable'));

      await expect(
        service.confirmScoresheetUpload(
          'club-1',
          'team-1',
          'event-1',
          'user-1',
          'scoresheets/event-1/new.jpg',
        ),
      ).resolves.toEqual({
        status: 'QUEUED',
        uploadedByTeamPlayerId: 'tp-1',
        uploadedAt: '2026-01-01T20:00:00.000Z',
      });
    });
  });

  describe('getScoresheetStatus', () => {
    const matchEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'MATCH',
      startsAt: new Date('2026-01-01T18:00:00Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: 'ES Rezé',
      venue: 'HOME',
      jerseysTeamPlayerId: null,
      ballsTeamPlayerId: null,
      recurrenceId: null,
      externalId: null,
      timeConfirmed: true,
      createdAt: new Date('2020-01-01'),
    };

    beforeEach(() => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(matchEvent);
    });

    it('returns null before any upload', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue(null);

      const result = await service.getScoresheetStatus('club-1', 'team-1', 'event-1');

      expect(result).toBeNull();
    });

    it('returns the current status once uploaded', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        status: 'UPLOADED',
        uploadedByTeamPlayerId: 'tp-1',
        uploadedAt: new Date('2026-01-01T20:00:00Z'),
      });

      const result = await service.getScoresheetStatus('club-1', 'team-1', 'event-1');

      expect(result).toEqual({
        status: 'UPLOADED',
        uploadedByTeamPlayerId: 'tp-1',
        uploadedAt: '2026-01-01T20:00:00.000Z',
      });
    });
  });

  describe('WhatsApp reminder integration', () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: 'event-1',
      teamId: 'team-1',
      type: 'TRAINING',
      startsAt: new Date('2026-01-05T18:00:00.000Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: null,
      venue: null,
      recurrenceId: null,
      externalId: null,
      timeConfirmed: true,
      createdAt: new Date('2026-01-01'),
      waReminderOverride: null,
      waOffsetMinutes: null,
      ...over,
    });

    it('stores the override and offset on create and reconciles the whole series once', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockImplementation(({ data }) =>
        Promise.resolve(row({ id: `e-${data.startsAt.getTime()}`, ...data })),
      );

      await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'TRAINING',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
          recurrence: { frequency: 'WEEKLY', until: '2026-01-19T18:00:00.000Z' },
          waReminderOverride: true,
          waOffsetMinutes: 120,
        },
        'user-1',
      );

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ waReminderOverride: true, waOffsetMinutes: 120 }),
      });
      expect(whatsAppReminders.ensureGuestLink).toHaveBeenCalledWith('club-1', 'team-1', 'user-1');
      expect(whatsAppReminders.syncEvents).toHaveBeenCalledTimes(1);
      expect(whatsAppReminders.syncEvents.mock.calls[0][0]).toHaveLength(3);
    });

    it('does not touch the guest link unless the override turns the reminder on', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockResolvedValue(row());

      await service.createEvent(
        'club-1',
        'team-1',
        { type: 'TRAINING', startsAt: '2026-01-05T18:00:00.000Z', location: 'Gymnase A' },
        'user-1',
      );

      expect(whatsAppReminders.ensureGuestLink).not.toHaveBeenCalled();
      expect(whatsAppReminders.syncEvents).toHaveBeenCalledWith(['event-1']);
    });

    it('updateEvent writes only the WhatsApp fields it was given, null clearing the override', async () => {
      prisma.event.findUnique.mockResolvedValue(row());
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.update.mockResolvedValue(row({ waReminderOverride: null, waOffsetMinutes: 90 }));

      await service.updateEvent(
        'club-1',
        'team-1',
        'event-1',
        { waReminderOverride: null, waOffsetMinutes: 90 },
        'user-1',
      );

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { waReminderOverride: null, waOffsetMinutes: 90 },
      });
      expect(whatsAppReminders.syncEvents).toHaveBeenCalledWith(['event-1']);
    });

    it('updateEvent asks for update prompts after syncing, for every id in scope', async () => {
      prisma.event.findUnique.mockResolvedValue(row());
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.update.mockResolvedValue(row({ location: 'Gymnase B' }));
      const order: string[] = [];
      whatsAppReminders.syncEvents.mockImplementation(() => {
        order.push('sync');
        return Promise.resolve();
      });
      whatsAppReminders.onEventsChanged.mockImplementation(() => {
        order.push('prompts');
        return Promise.resolve();
      });

      await service.updateEvent('club-1', 'team-1', 'event-1', { location: 'Gymnase B' }, 'user-1');

      expect(order).toEqual(['sync', 'prompts']);
      expect(whatsAppReminders.onEventsChanged).toHaveBeenCalledWith(['event-1']);
    });

    it('createEvent never asks for update prompts: a new event was never shared', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockResolvedValue(row());
      await service.createEvent(
        'club-1',
        'team-1',
        { type: 'TRAINING', startsAt: '2026-01-05T18:00:00.000Z', location: 'Gymnase A' },
        'user-1',
      );
      expect(whatsAppReminders.onEventsChanged).not.toHaveBeenCalled();
    });

    it('deleteEvent prepares cancellations inside the transaction, before the rows go, and follows up after', async () => {
      prisma.event.findUnique.mockResolvedValue(row());
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.eventConvocation.findMany.mockResolvedValue([]);
      prisma.event.deleteMany.mockResolvedValue({ count: 1 });
      const prepared = { created: [], discardedShareIds: ['r1'] };
      const order: string[] = [];
      whatsAppReminders.prepareCancellations.mockImplementation(() => {
        order.push('prepare');
        return Promise.resolve(prepared);
      });
      prisma.event.deleteMany.mockImplementation(() => {
        order.push('delete');
        return Promise.resolve({ count: 1 });
      });
      whatsAppReminders.afterCancellations.mockImplementation(() => {
        order.push('after');
        return Promise.resolve();
      });

      await service.deleteEvent('club-1', 'team-1', 'event-1');

      expect(order).toEqual(['prepare', 'delete', 'after']);
      expect(whatsAppReminders.prepareCancellations).toHaveBeenCalledWith(
        expect.anything(),
        'team-1',
        ['event-1'],
      );
      expect(whatsAppReminders.afterCancellations).toHaveBeenCalledWith('team-1', prepared);
    });

    it('updateEvent leaves the WhatsApp columns alone when the request has none', async () => {
      prisma.event.findUnique.mockResolvedValue(row());
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.update.mockResolvedValue(row({ location: 'Gymnase B' }));

      await service.updateEvent('club-1', 'team-1', 'event-1', { location: 'Gymnase B' }, 'user-1');

      const { data } = prisma.event.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('waReminderOverride');
      expect(data).not.toHaveProperty('waOffsetMinutes');
    });

    describe('manager-only fields on a TeamEvent', () => {
      beforeEach(() => {
        prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
        prisma.event.findMany.mockResolvedValue([
          row({ waReminderOverride: true, waOffsetMinutes: 120 }),
        ]);
        prisma.event.count.mockResolvedValue(1);
        prisma.eventShare.findMany.mockResolvedValue([
          {
            eventId: 'event-1',
            type: 'REMINDER',
            state: 'PENDING',
            dueAt: new Date('2026-01-02T18:00:00.000Z'),
            sentAt: null,
            platform: null,
            sentBy: null,
          },
        ]);
      });

      it('a manager gets the share row and the resolved settings, in one shares read', async () => {
        teamManagerGuard.isTeamManager.mockResolvedValue(true);

        const { items } = await service.listEvents('club-1', 'team-1', {}, 'user-1');

        expect(items[0].whatsAppShare).toMatchObject({
          type: 'REMINDER',
          state: 'PENDING',
          dueAt: '2026-01-02T18:00:00.000Z',
        });
        expect(items[0].whatsAppSettings).toEqual({
          override: true,
          offsetMinutes: 120,
          effective: { enabled: true, offsetMinutes: 120 },
        });
        expect(prisma.eventShare.findMany).toHaveBeenCalledTimes(1);
      });

      it('anyone else gets null for both, and no query is spent', async () => {
        teamManagerGuard.isTeamManager.mockResolvedValue(false);

        const { items } = await service.listEvents('club-1', 'team-1', {}, 'user-1');

        expect(items[0].whatsAppShare).toBeNull();
        expect(items[0].whatsAppSettings).toBeNull();
        expect(prisma.eventShare.findMany).not.toHaveBeenCalled();
      });

      it('a guardian acting for a child never gets them, whatever their own rights', async () => {
        teamManagerGuard.isTeamManager.mockResolvedValue(true);
        prisma.player.findFirst.mockResolvedValue({ id: 'child' });

        const { items } = await service.listEvents(
          'club-1',
          'team-1',
          { forPlayerId: 'child' },
          'user-1',
        );

        expect(items[0].whatsAppShare).toBeNull();
        expect(items[0].whatsAppSettings).toBeNull();
      });
    });
  });
});
