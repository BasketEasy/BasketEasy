import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { EventMeeting } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { GeocodingService } from './geocoding.service';
import { travelRouteKey } from './meeting-plan';
import type { NotificationsService } from '../notifications/notifications.service';
import type { MeetingChangeFeed } from './meeting-change-feed';
import {
  MEETING_CHANGE_NOTIFY_WINDOW_MS,
  MeetingPointsService,
  REFRESH_TIMEOUT_MS,
  STALE_ENQUEUE_DEBOUNCE_MS,
  type MeetingEventRow,
  type MeetingTravelJobData,
} from './meeting-points.service';
import type { RoutingClient } from './routing-client';

// One row of resolvePlayerAudience's teamPlayer read.
function audienceRow(
  teamPlayerId: string,
  userId: string | null,
  { guardians = [] as string[], firstName = 'Théo' } = {},
) {
  return {
    id: teamPlayerId,
    player: {
      id: teamPlayerId.replace('tp-', 'player-'),
      firstName,
      clubId: 'club-1',
      userId,
      guardians: guardians.map((guardianId) => ({ userId: guardianId })),
    },
  };
}

describe('MeetingPointsService', () => {
  let prisma: {
    club: { findUnique: jest.Mock; update: jest.Mock };
    team: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    clubTeam: { findUnique: jest.Mock };
    event: { findUnique: jest.Mock; findMany: jest.Mock };
    eventMeeting: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
    eventRsvp: { findMany: jest.Mock };
    teamPlayer: { findMany: jest.Mock };
    clubMembership: { findMany: jest.Mock };
  };
  let notifications: { notify: jest.Mock };
  let changeFeed: { publish: jest.Mock };
  let geocoding: { geocode: jest.Mock };
  let routing: { geocode: jest.Mock; drivingMinutes: jest.Mock };
  let queue: { addBulk: jest.Mock; add: jest.Mock };
  let service: MeetingPointsService;

  const clubColumns = {
    name: 'BC Nantes',
    meetingPointName: 'Parking club',
    meetingPointAddress: '1 rue du Club, Nantes',
    arrivalBufferMinutes: 45,
  };
  const teamRow = {
    id: 'team-1',
    name: 'U15 M',
    meetingPointName: null,
    meetingPointAddress: null,
    arrivalBufferMinutes: null,
    clubTeams: [{ clubId: 'club-1', isOwner: true, club: clubColumns }],
  };

  function match(overrides: Partial<MeetingEventRow> = {}): MeetingEventRow {
    return {
      id: 'event-1',
      teamId: 'team-1',
      type: 'MATCH',
      startsAt: new Date('2026-01-10T19:30:00.000Z'),
      location: 'Salle Coubertin, Rezé',
      venue: 'AWAY',
      ...overrides,
    };
  }
  function meeting(overrides: Partial<EventMeeting> = {}): EventMeeting {
    return {
      eventId: 'event-1',
      meetingPointName: null,
      meetingPointAddress: null,
      travelMinutes: null,
      travelMinutesManual: false,
      travelRouteKey: null,
      meetsAtOverride: null,
      meetingAnnouncedKey: null,
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    };
  }
  /** The row loadMatch / recomputeTravel read: the event with its meeting relation. */
  function stored(state: EventMeeting | null = null, overrides: Partial<MeetingEventRow> = {}) {
    return { ...match(overrides), meeting: state };
  }
  const clubRoute = travelRouteKey('1 rue du Club, Nantes', 'Salle Coubertin, Rezé');

  beforeEach(() => {
    prisma = {
      club: { findUnique: jest.fn().mockResolvedValue(clubColumns), update: jest.fn() },
      team: {
        findUnique: jest.fn().mockResolvedValue(teamRow),
        findMany: jest.fn().mockResolvedValue([teamRow]),
        update: jest.fn(),
      },
      clubTeam: { findUnique: jest.fn().mockResolvedValue({ isOwner: true }) },
      event: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      eventMeeting: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(({ create }: { create: Partial<EventMeeting> }) =>
          Promise.resolve(meeting(create)),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      eventRsvp: { findMany: jest.fn().mockResolvedValue([]) },
      // resolvePlayerAudience's read: each GOING slot's player and guardians.
      teamPlayer: { findMany: jest.fn().mockResolvedValue([]) },
      clubMembership: { findMany: jest.fn().mockResolvedValue([]) },
    };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    changeFeed = { publish: jest.fn() };
    geocoding = { geocode: jest.fn() };
    routing = { geocode: jest.fn(), drivingMinutes: jest.fn() };
    queue = { addBulk: jest.fn().mockResolvedValue([]), add: jest.fn().mockResolvedValue({}) };
    service = new MeetingPointsService(
      prisma as unknown as PrismaService,
      geocoding as unknown as GeocodingService,
      routing as unknown as RoutingClient,
      queue as unknown as Queue<MeetingTravelJobData>,
      notifications as unknown as NotificationsService,
      changeFeed as unknown as MeetingChangeFeed,
    );
  });

  describe('settings', () => {
    it('trims and stores a club meeting point, then queues the owned teams’ upcoming matches', async () => {
      prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }]);

      await service.updateClubSettings('club-1', {
        meetingPoint: { name: ' Parking ', address: ' 1 rue X ' },
        arrivalBufferMinutes: 60,
      });

      expect(prisma.club.update).toHaveBeenCalledWith({
        where: { id: 'club-1' },
        data: {
          meetingPointName: 'Parking',
          meetingPointAddress: '1 rue X',
          arrivalBufferMinutes: 60,
        },
      });
      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          type: 'MATCH',
          // Only matches that inherit the club place: no place of their own,
          // on an owned team with no team place either.
          OR: [{ meeting: { is: null } }, { meeting: { is: { meetingPointName: null } } }],
          team: {
            meetingPointName: null,
            clubTeams: { some: { clubId: 'club-1', isOwner: true } },
          },
        }),
        select: { id: true },
      });
      expect(queue.addBulk).toHaveBeenCalledWith([
        expect.objectContaining({ data: { eventId: 'event-1' } }),
      ]);
    });

    it('queues an announcement, not recomputes, when only the buffer or the name changed', async () => {
      await service.updateClubSettings('club-1', {
        meetingPoint: { name: 'Nouveau nom', address: ' 1 RUE du club, nantes' },
        arrivalBufferMinutes: 60,
      });

      expect(queue.addBulk).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith('announce', { clubId: 'club-1' }, expect.anything());
    });

    it('queues nothing at all when nothing players see changed', async () => {
      await service.updateClubSettings('club-1', {
        meetingPoint: { name: 'Parking club', address: '1 rue du Club, Nantes' },
        arrivalBufferMinutes: 45,
      });

      expect(queue.addBulk).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('queues a team’s inheriting matches when its effective place moves', async () => {
      prisma.event.findMany.mockResolvedValue([{ id: 'event-1' }]);

      await service.updateTeamSettings('club-1', 'team-1', {
        meetingPoint: { name: 'Gymnase', address: '2 rue Y' },
        arrivalBufferMinutes: null,
      });

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ teamId: 'team-1' }),
        select: { id: true },
      });
      expect(queue.addBulk).toHaveBeenCalled();
    });

    it('clears both columns together when the meeting point is removed', async () => {
      await service.updateTeamSettings('club-1', 'team-1', {
        meetingPoint: null,
        arrivalBufferMinutes: null,
      });

      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 'team-1' },
        data: { meetingPointName: null, meetingPointAddress: null, arrivalBufferMinutes: null },
      });
      // The team already inherited the club place: no route moved, nothing
      // players see changed.
      expect(queue.addBulk).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('queues a team announcement, not recomputes, when only the buffer changed', async () => {
      await service.updateTeamSettings('club-1', 'team-1', {
        meetingPoint: null,
        arrivalBufferMinutes: 60,
      });

      expect(queue.addBulk).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith('announce', { teamId: 'team-1' }, expect.anything());
    });

    it('queues a team announcement, not recomputes, when only the place name changed', async () => {
      await service.updateTeamSettings('club-1', 'team-1', {
        // Same address as the inherited club place, different name.
        meetingPoint: { name: 'Devant le gymnase', address: ' 1 RUE du club, nantes' },
        arrivalBufferMinutes: null,
      });

      expect(queue.addBulk).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith('announce', { teamId: 'team-1' }, expect.anything());
    });

    it('returns the owner club defaults alongside the team’s own settings', async () => {
      prisma.team.findUnique.mockResolvedValue({
        ...teamRow,
        // A CTC partner's default never applies.
        clubTeams: [
          { clubId: 'club-2', isOwner: false, club: { ...clubColumns, name: 'Partenaire' } },
          ...teamRow.clubTeams,
        ],
      });
      await expect(service.getTeamSettings('club-1', 'team-1')).resolves.toEqual({
        meetingPoint: null,
        arrivalBufferMinutes: null,
        clubDefaults: {
          clubName: 'BC Nantes',
          meetingPoint: { name: 'Parking club', address: '1 rue du Club, Nantes' },
          arrivalBufferMinutes: 45,
        },
      });
      expect(prisma.team.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            clubTeams: {
              select: expect.objectContaining({ clubId: true, isOwner: true }),
            },
          }),
        }),
      );
    });

    it('404s a team that is not linked to the route’s club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);
      await expect(service.getTeamSettings('club-2', 'team-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolvePlans', () => {
    it('skips every query for a batch of trainings', async () => {
      const plans = await service.resolvePlans('team-1', [match({ type: 'TRAINING' })]);
      expect(plans.get('event-1')).toBeNull();
      expect(prisma.team.findUnique).not.toHaveBeenCalled();
      expect(prisma.eventMeeting.findMany).not.toHaveBeenCalled();
    });

    it('reads the matches’ meeting rows in one query and resolves each plan', async () => {
      prisma.eventMeeting.findMany.mockResolvedValue([
        meeting({ eventId: 'event-2', travelMinutes: 23, travelRouteKey: clubRoute }),
      ]);

      const plans = await service.resolvePlans('team-1', [
        match(),
        match({ id: 'event-2' }),
        match({ id: 'event-3', type: 'TRAINING' }),
      ]);

      expect(prisma.eventMeeting.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1', 'event-2'] } },
      });
      expect(plans.get('event-1')?.meetsAt).toBeNull();
      expect(plans.get('event-2')?.meetsAt).toBe('2026-01-10T18:15:00.000Z');
      expect(plans.get('event-3')).toBeNull();
    });

    it('queues a recompute for a match whose route key is stale', async () => {
      prisma.eventMeeting.findMany.mockResolvedValue([
        meeting({ eventId: 'event-2', travelRouteKey: clubRoute }),
      ]);
      await service.resolvePlans('team-1', [match(), match({ id: 'event-2' })]);
      expect(queue.addBulk).toHaveBeenCalledWith([
        expect.objectContaining({ data: { eventId: 'event-1' } }),
      ]);
    });

    it('queues the same stale match at most once per debounce window', async () => {
      jest.useFakeTimers();
      try {
        await service.resolvePlans('team-1', [match()]);
        await service.resolvePlans('team-1', [match()]);
        expect(queue.addBulk).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(STALE_ENQUEUE_DEBOUNCE_MS);
        await service.resolvePlans('team-1', [match()]);
        expect(queue.addBulk).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('keys each recompute job without a colon, which BullMQ refuses in a custom id', async () => {
      await service.enqueueRecompute(['event-1']);
      const [[jobs]] = queue.addBulk.mock.calls;
      expect(jobs[0].opts.jobId).toBe('meeting-travel-event-1');
      expect(jobs[0].opts.jobId).not.toContain(':');
    });

    it('never fails the read when the queue is unreachable', async () => {
      queue.addBulk.mockRejectedValue(new Error('redis down'));
      await expect(service.resolvePlans('team-1', [match()])).resolves.toBeInstanceOf(Map);
    });
  });

  describe('resolvePlansAcrossTeams', () => {
    it('resolves a batch spanning several teams in two queries', async () => {
      prisma.team.findMany.mockResolvedValue([teamRow, { ...teamRow, id: 'team-2' }]);
      prisma.eventMeeting.findMany.mockResolvedValue([
        meeting({ eventId: 'event-2', travelMinutes: 23, travelRouteKey: clubRoute }),
      ]);

      const plans = await service.resolvePlansAcrossTeams([
        match(),
        match({ id: 'event-2', teamId: 'team-2' }),
        match({ id: 'event-3', type: 'TRAINING' }),
      ]);

      expect(prisma.team.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['team-1', 'team-2'] } } }),
      );
      expect(prisma.team.findUnique).not.toHaveBeenCalled();
      expect(prisma.eventMeeting.findMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['event-1', 'event-2'] } },
      });
      expect(plans.get('event-2')?.meetsAt).toBe('2026-01-10T18:15:00.000Z');
      expect(plans.get('event-3')).toBeNull();
    });

    it('skips every query for a batch of trainings', async () => {
      const plans = await service.resolvePlansAcrossTeams([match({ type: 'TRAINING' })]);
      expect(plans.get('event-1')).toBeNull();
      expect(prisma.team.findMany).not.toHaveBeenCalled();
    });
  });

  describe('setEventMeeting', () => {
    beforeEach(() => {
      prisma.event.findUnique.mockResolvedValue(stored());
    });

    it('404s an event on another team', async () => {
      prisma.event.findUnique.mockResolvedValue(stored(null, { teamId: 'team-2' }));
      await expect(
        service.setEventMeeting('club-1', 'team-1', 'event-1', { travelMinutes: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refuses a training', async () => {
      prisma.event.findUnique.mockResolvedValue(stored(null, { type: 'TRAINING' }));
      await expect(
        service.setEventMeeting('club-1', 'team-1', 'event-1', { travelMinutes: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores typed minutes against the current route and answers with the plan', async () => {
      const plan = await service.setEventMeeting('club-1', 'team-1', 'event-1', {
        travelMinutes: 30,
      });

      expect(prisma.eventMeeting.upsert).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
        create: expect.objectContaining({
          eventId: 'event-1',
          travelMinutes: 30,
          travelMinutesManual: true,
          travelRouteKey: clubRoute,
        }),
        update: expect.objectContaining({ travelMinutes: 30, travelRouteKey: clubRoute }),
      });
      expect(plan).toMatchObject({ travelMinutesSource: 'MANUAL', meetsAtSource: 'COMPUTED' });
      expect(queue.addBulk).not.toHaveBeenCalled();
    });

    it('returning to computed minutes queues a recompute', async () => {
      prisma.event.findUnique.mockResolvedValue(
        stored(
          meeting({ travelMinutes: 30, travelMinutesManual: true, travelRouteKey: clubRoute }),
        ),
      );

      await service.setEventMeeting('club-1', 'team-1', 'event-1', { travelMinutes: null });

      expect(prisma.eventMeeting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            travelMinutes: null,
            travelMinutesManual: false,
            travelRouteKey: null,
          }),
        }),
      );
      expect(queue.addBulk).toHaveBeenCalled();
    });

    it('a new place override queues a recompute for the new route', async () => {
      prisma.event.findUnique.mockResolvedValue(stored(meeting({ travelRouteKey: clubRoute })));
      await service.setEventMeeting('club-1', 'team-1', 'event-1', {
        meetingPoint: { name: 'Parking Leclerc', address: 'Route de Vannes' },
      });
      expect(queue.addBulk).toHaveBeenCalled();
    });

    it('refuses a meeting time after tip-off', async () => {
      await expect(
        service.setEventMeeting('club-1', 'team-1', 'event-1', {
          meetsAt: '2026-01-10T20:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses minutes or a time when no meeting point exists at any level', async () => {
      prisma.team.findUnique.mockResolvedValue({ ...teamRow, clubTeams: [] });
      await expect(
        service.setEventMeeting('club-1', 'team-1', 'event-1', { travelMinutes: 10 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.setEventMeeting('club-1', 'team-1', 'event-1', {
          meetsAt: '2026-01-10T18:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recomputeTravel', () => {
    it('does nothing for a route already computed, unless forced', async () => {
      prisma.event.findUnique.mockResolvedValue(stored(meeting({ travelRouteKey: clubRoute })));

      await service.recomputeTravel('event-1');
      expect(geocoding.geocode).not.toHaveBeenCalled();
    });

    it('stores the driving minutes and the route they belong to', async () => {
      prisma.event.findUnique.mockResolvedValue(stored());
      geocoding.geocode.mockResolvedValue({ latitude: 1, longitude: 1 });
      routing.drivingMinutes.mockResolvedValue(23);

      await service.recomputeTravel('event-1');

      expect(prisma.eventMeeting.upsert).toHaveBeenCalledWith({
        where: { eventId: 'event-1' },
        create: {
          eventId: 'event-1',
          travelMinutes: 23,
          travelMinutesManual: false,
          travelRouteKey: clubRoute,
        },
        update: { travelMinutes: 23, travelMinutesManual: false, travelRouteKey: clubRoute },
      });
    });

    it('writes the route key even when the address cannot be found', async () => {
      prisma.event.findUnique.mockResolvedValue(stored());
      geocoding.geocode.mockResolvedValue(null);

      await service.recomputeTravel('event-1');

      expect(routing.drivingMinutes).not.toHaveBeenCalled();
      expect(prisma.eventMeeting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { travelMinutes: null, travelMinutesManual: false, travelRouteKey: clubRoute },
        }),
      );
    });

    it('forcing replaces typed minutes and bypasses the "not found" cache', async () => {
      prisma.event.findUnique.mockResolvedValue(
        stored(
          meeting({ travelMinutes: 30, travelMinutesManual: true, travelRouteKey: clubRoute }),
        ),
      );
      geocoding.geocode.mockResolvedValue({ latitude: 1, longitude: 1 });
      routing.drivingMinutes.mockResolvedValue(21);

      await service.recomputeTravel('event-1', { force: true });

      expect(geocoding.geocode).toHaveBeenCalledWith(expect.any(String), {
        bypassNegativeCache: true,
        timeoutMs: undefined,
      });
      expect(prisma.eventMeeting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { travelMinutes: 21, travelMinutesManual: false, travelRouteKey: clubRoute },
        }),
      );
    });
  });

  describe('refreshTravel', () => {
    beforeEach(() => {
      prisma.event.findUnique.mockResolvedValue(stored());
      geocoding.geocode.mockResolvedValue({ latitude: 1, longitude: 1 });
      routing.drivingMinutes.mockResolvedValue(23);
    });

    it('recomputes with the tighter in-request timeout and answers with the plan', async () => {
      prisma.eventMeeting.findUnique.mockResolvedValue(
        meeting({ travelMinutes: 23, travelRouteKey: clubRoute }),
      );

      const plan = await service.refreshTravel('club-1', 'team-1', 'event-1');

      expect(geocoding.geocode).toHaveBeenCalledWith(expect.any(String), {
        bypassNegativeCache: true,
        timeoutMs: REFRESH_TIMEOUT_MS,
      });
      expect(routing.drivingMinutes).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        timeoutMs: REFRESH_TIMEOUT_MS,
      });
      expect(plan.travelMinutes).toBe(23);
    });

    it('does not call the provider again for a second press within the cooldown', async () => {
      await service.refreshTravel('club-1', 'team-1', 'event-1');
      await service.refreshTravel('club-1', 'team-1', 'event-1');
      expect(routing.drivingMinutes).toHaveBeenCalledTimes(1);
    });

    it('turns a provider failure into a 503 the manager can act on', async () => {
      geocoding.geocode.mockRejectedValue(new Error('ORS 503'));

      await expect(service.refreshTravel('club-1', 'team-1', 'event-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('announceMeetingChanges', () => {
    // Tip-off in three days: inside the notification window.
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    soon.setUTCHours(19, 30, 0, 0);
    const known = meeting({ travelMinutes: 23, travelRouteKey: clubRoute });
    function upcoming(state: EventMeeting | null) {
      return { ...stored(state, { startsAt: soon }), opponentName: 'Rezé' };
    }

    it('reads only matches inside the notification window, and teams in one query', async () => {
      await service.announceMeetingChanges(['event-1', 'event-2']);

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['event-1', 'event-2'] },
            startsAt: { gt: expect.any(Date), lte: expect.any(Date) },
          }),
        }),
      );
      const { startsAt } = prisma.event.findMany.mock.calls[0][0].where;
      expect(startsAt.lte.getTime() - startsAt.gt.getTime()).toBe(MEETING_CHANGE_NOTIFY_WINDOW_MS);
      expect(prisma.team.findMany).not.toHaveBeenCalled();
    });

    it('tells players when a meeting hour becomes known for the first time', async () => {
      prisma.event.findMany.mockResolvedValue([upcoming(known)]);
      prisma.eventRsvp.findMany.mockResolvedValue([{ eventId: 'event-1', teamPlayerId: 'tp-1' }]);
      prisma.teamPlayer.findMany.mockResolvedValue([audienceRow('tp-1', 'user-1')]);

      await service.announceMeetingChanges(['event-1']);

      expect(prisma.team.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventMeeting.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', meetingAnnouncedKey: null },
        data: { meetingAnnouncedKey: expect.stringContaining('Parking club|') },
      });
      expect(notifications.notify).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: 'user-1',
          type: 'EVENT_MEETING_FIXED',
          title: 'RDV fixé — U15 M',
        }),
      ]);
    });

    it('never announces an unknown time', async () => {
      prisma.event.findMany.mockResolvedValue([upcoming(null)]);

      await service.announceMeetingChanges(['event-1']);

      expect(prisma.eventMeeting.updateMany).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('tells GOING players coming to the meeting point, linking through their own club', async () => {
      prisma.team.findMany.mockResolvedValue([
        {
          ...teamRow,
          clubTeams: [
            ...teamRow.clubTeams,
            { clubId: 'club-2', isOwner: false, club: { ...clubColumns, name: 'Partenaire' } },
          ],
        },
      ]);
      prisma.event.findMany.mockResolvedValue([
        upcoming({ ...known, meetingAnnouncedKey: 'Parking club|1 rue du Club, Nantes|old' }),
      ]);
      prisma.eventRsvp.findMany.mockResolvedValue([
        { eventId: 'event-1', teamPlayerId: 'tp-partner' },
        { eventId: 'event-1', teamPlayerId: 'tp-nobody' },
      ]);
      prisma.teamPlayer.findMany.mockResolvedValue([
        audienceRow('tp-partner', 'user-partner'),
        audienceRow('tp-nobody', null),
      ]);
      prisma.clubMembership.findMany.mockResolvedValue([
        { userId: 'user-partner', clubId: 'club-2' },
      ]);

      await service.announceMeetingChanges(['event-1']);

      expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { eventId: { in: ['event-1'] }, status: 'GOING', travelMode: 'MEETING_POINT' },
        }),
      );
      expect(notifications.notify).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: 'user-partner',
          type: 'EVENT_MEETING_CHANGED',
          title: 'RDV modifié — U15 M',
          deepLink: '/clubs/club-2/teams/team-1/events/event-1',
        }),
      ]);
    });

    it('tells a coming child’s parent too, through the child’s club, naming the child', async () => {
      prisma.event.findMany.mockResolvedValue([upcoming(known)]);
      prisma.eventRsvp.findMany.mockResolvedValue([{ eventId: 'event-1', teamPlayerId: 'tp-leo' }]);
      prisma.teamPlayer.findMany.mockResolvedValue([
        audienceRow('tp-leo', 'leo-user', { firstName: 'Léo', guardians: ['parent-1'] }),
      ]);

      await service.announceMeetingChanges(['event-1']);

      const batch = notifications.notify.mock.calls[0][0];
      expect(batch).toHaveLength(2);
      expect(batch).toContainEqual(
        expect.objectContaining({
          userId: 'parent-1',
          subjectFirstName: 'Léo',
          body: expect.stringMatching(/^Pour Léo : Rendez-vous/),
          deepLink: '/clubs/club-1/teams/team-1/events/event-1?pour=player-leo',
        }),
      );
      expect(batch).toContainEqual(
        expect.objectContaining({ userId: 'leo-user', subjectFirstName: null }),
      );
    });

    it('does not announce twice when another write already recorded the change', async () => {
      prisma.event.findMany.mockResolvedValue([upcoming(known)]);
      prisma.eventMeeting.updateMany.mockResolvedValue({ count: 0 });

      await service.announceMeetingChanges(['event-1']);

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('swallows its own failures', async () => {
      prisma.event.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.announceMeetingChanges(['event-1'])).resolves.toBeUndefined();
    });
  });

  describe('a TRAINING that just became a MATCH', () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    soon.setUTCHours(19, 30, 0, 0);

    it('has no meeting hour to announce until its route is computed, then announces it', async () => {
      prisma.eventRsvp.findMany.mockResolvedValue([{ eventId: 'event-1', teamPlayerId: 'tp-1' }]);
      prisma.teamPlayer.findMany.mockResolvedValue([audienceRow('tp-1', 'user-1')]);

      // Straight after the flip: no EventMeeting row, so no travel time.
      prisma.event.findMany.mockResolvedValue([
        { ...stored(null, { startsAt: soon }), opponentName: 'Rezé' },
      ]);
      await service.announceMeetingChanges(['event-1']);
      expect(notifications.notify).not.toHaveBeenCalled();

      // The queued recompute stores the route and announces from it.
      prisma.event.findUnique.mockResolvedValue(stored(null, { startsAt: soon }));
      geocoding.geocode.mockResolvedValue({ latitude: 1, longitude: 1 });
      routing.drivingMinutes.mockResolvedValue(23);
      prisma.event.findMany.mockResolvedValue([
        {
          ...stored(meeting({ travelMinutes: 23, travelRouteKey: clubRoute }), { startsAt: soon }),
          opponentName: 'Rezé',
        },
      ]);
      await service.recomputeTravel('event-1');

      expect(notifications.notify).toHaveBeenCalledWith([
        expect.objectContaining({ userId: 'user-1', type: 'EVENT_MEETING_FIXED' }),
      ]);
    });
  });

  describe('announceUpcoming', () => {
    const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    it('announces the window’s matches of the club’s owned teams', async () => {
      prisma.event.findMany.mockResolvedValueOnce([{ id: 'event-1', startsAt: inDays(3) }]);

      await service.announceUpcoming({ clubId: 'club-1' });

      expect(prisma.event.findMany).toHaveBeenNthCalledWith(1, {
        where: expect.objectContaining({
          team: { clubTeams: { some: { clubId: 'club-1', isOwner: true } } },
        }),
        select: { id: true, startsAt: true },
      });
      expect(prisma.event.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ['event-1'] } }) }),
      );
    });

    it('publishes the 14-day window to the change feed but only announces to players inside 7 days', async () => {
      prisma.event.findMany.mockResolvedValueOnce([
        { id: 'near', startsAt: inDays(3) },
        { id: 'far', startsAt: inDays(10) },
      ]);

      await service.announceUpcoming({ teamId: 'team-1' });

      expect(changeFeed.publish).toHaveBeenCalledWith(['near', 'far']);
      expect(prisma.event.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: expect.objectContaining({ id: { in: ['near'] } }) }),
      );
    });
  });

  describe('the meeting change feed', () => {
    it('announceMeetingChanges publishes every id, before any window filter', async () => {
      await service.announceMeetingChanges(['event-1', 'event-far']);
      expect(changeFeed.publish).toHaveBeenCalledWith(['event-1', 'event-far']);
    });

    it('publishes nothing for an empty batch', async () => {
      await service.announceMeetingChanges([]);
      expect(changeFeed.publish).not.toHaveBeenCalled();
    });
  });
});
