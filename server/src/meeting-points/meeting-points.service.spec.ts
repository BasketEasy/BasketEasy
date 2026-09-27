import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service';
import type { GeocodingService } from './geocoding.service';
import { travelRouteKey } from './meeting-plan';
import {
  MEETING_CHANGE_NOTIFY_WINDOW_MS,
  MeetingPointsService,
  type MeetingEventRow,
} from './meeting-points.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { RoutingClient } from './routing-client';

describe('MeetingPointsService', () => {
  let prisma: {
    club: { findUnique: jest.Mock; update: jest.Mock };
    team: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    clubTeam: { findUnique: jest.Mock };
    event: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    eventRsvp: { findMany: jest.Mock };
    clubMembership: { findMany: jest.Mock };
  };
  let notifications: { notify: jest.Mock };
  let geocoding: { geocode: jest.Mock };
  let routing: { geocode: jest.Mock; drivingMinutes: jest.Mock };
  let queue: { addBulk: jest.Mock };
  let service: MeetingPointsService;

  const clubColumns = {
    name: 'BC Nantes',
    meetingPointName: 'Parking club',
    meetingPointAddress: '1 rue du Club, Nantes',
    arrivalBufferMinutes: 45,
  };
  const teamRow = {
    meetingPointName: null,
    meetingPointAddress: null,
    arrivalBufferMinutes: null,
    clubTeams: [{ club: clubColumns }],
  };

  function match(overrides: Partial<MeetingEventRow> = {}): MeetingEventRow {
    return {
      id: 'event-1',
      teamId: 'team-1',
      type: 'MATCH',
      startsAt: new Date('2026-01-10T19:30:00.000Z'),
      location: 'Salle Coubertin, Rezé',
      meetingPointName: null,
      meetingPointAddress: null,
      travelMinutes: null,
      travelMinutesManual: false,
      travelRouteKey: null,
      meetsAtOverride: null,
      ...overrides,
    };
  }
  const clubRoute = travelRouteKey('1 rue du Club, Nantes', 'Salle Coubertin, Rezé');

  beforeEach(() => {
    prisma = {
      club: { findUnique: jest.fn().mockResolvedValue(clubColumns), update: jest.fn() },
      team: {
        findUnique: jest.fn().mockResolvedValue(teamRow),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      clubTeam: { findUnique: jest.fn().mockResolvedValue({ isOwner: true }) },
      event: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      eventRsvp: { findMany: jest.fn().mockResolvedValue([]) },
      clubMembership: { findMany: jest.fn().mockResolvedValue([]) },
    };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    geocoding = { geocode: jest.fn() };
    routing = { geocode: jest.fn(), drivingMinutes: jest.fn() };
    queue = { addBulk: jest.fn().mockResolvedValue([]) };
    service = new MeetingPointsService(
      prisma as unknown as PrismaService,
      geocoding as unknown as GeocodingService,
      routing as unknown as RoutingClient,
      queue as unknown as Queue<{ eventId: string }>,
      notifications as unknown as NotificationsService,
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
          team: { clubTeams: { some: { clubId: 'club-1', isOwner: true } } },
        }),
        select: { id: true },
      });
      expect(queue.addBulk).toHaveBeenCalledWith([
        expect.objectContaining({ data: { eventId: 'event-1' } }),
      ]);
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
    });

    it('returns the owner club defaults alongside the team’s own settings', async () => {
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
            clubTeams: expect.objectContaining({ where: { isOwner: true } }),
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
    it('skips the settings query entirely for a batch of trainings', async () => {
      const plans = await service.resolvePlans('team-1', [match({ type: 'TRAINING' })]);
      expect(plans.get('event-1')).toBeNull();
      expect(prisma.team.findUnique).not.toHaveBeenCalled();
    });

    it('queues a recompute for a match whose route key is stale', async () => {
      await service.resolvePlans('team-1', [
        match(),
        match({ id: 'event-2', travelRouteKey: clubRoute }),
      ]);
      expect(queue.addBulk).toHaveBeenCalledWith([
        expect.objectContaining({ data: { eventId: 'event-1' } }),
      ]);
    });

    it('never fails the read when the queue is unreachable', async () => {
      queue.addBulk.mockRejectedValue(new Error('redis down'));
      await expect(service.resolvePlans('team-1', [match()])).resolves.toBeInstanceOf(Map);
    });
  });

  describe('setEventMeeting', () => {
    it('refuses a training', async () => {
      await expect(
        service.setEventMeeting(match({ type: 'TRAINING' }), { travelMinutes: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores typed minutes against the current route', async () => {
      await service.setEventMeeting(match(), { travelMinutes: 30 });

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: expect.objectContaining({
          travelMinutes: 30,
          travelMinutesManual: true,
          travelRouteKey: clubRoute,
        }),
      });
      expect(queue.addBulk).not.toHaveBeenCalled();
    });

    it('returning to computed minutes queues a recompute', async () => {
      await service.setEventMeeting(
        match({ travelMinutes: 30, travelMinutesManual: true, travelRouteKey: clubRoute }),
        { travelMinutes: null },
      );

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: expect.objectContaining({
          travelMinutes: null,
          travelMinutesManual: false,
          travelRouteKey: null,
        }),
      });
      expect(queue.addBulk).toHaveBeenCalled();
    });

    it('a new place override queues a recompute for the new route', async () => {
      await service.setEventMeeting(match({ travelRouteKey: clubRoute }), {
        meetingPoint: { name: 'Parking Leclerc', address: 'Route de Vannes' },
      });
      expect(queue.addBulk).toHaveBeenCalled();
    });

    it('refuses a meeting time after tip-off', async () => {
      await expect(
        service.setEventMeeting(match(), { meetsAt: '2026-01-10T20:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses minutes or a time when no meeting point exists at any level', async () => {
      prisma.team.findUnique.mockResolvedValue({ ...teamRow, clubTeams: [] });
      await expect(service.setEventMeeting(match(), { travelMinutes: 10 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.setEventMeeting(match(), { meetsAt: '2026-01-10T18:00:00.000Z' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recomputeTravel', () => {
    it('does nothing for a route already computed, unless forced', async () => {
      prisma.event.findUnique.mockResolvedValue(match({ travelRouteKey: clubRoute }));

      await service.recomputeTravel('event-1');
      expect(geocoding.geocode).not.toHaveBeenCalled();
    });

    it('stores the driving minutes and the route they belong to', async () => {
      prisma.event.findUnique.mockResolvedValue(match());
      geocoding.geocode.mockResolvedValue({ latitude: 1, longitude: 1 });
      routing.drivingMinutes.mockResolvedValue(23);

      await service.recomputeTravel('event-1');

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { travelMinutes: 23, travelMinutesManual: false, travelRouteKey: clubRoute },
      });
    });

    it('writes the route key even when the address cannot be found', async () => {
      prisma.event.findUnique.mockResolvedValue(match());
      geocoding.geocode.mockResolvedValue(null);

      await service.recomputeTravel('event-1');

      expect(routing.drivingMinutes).not.toHaveBeenCalled();
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { travelMinutes: null, travelMinutesManual: false, travelRouteKey: clubRoute },
      });
    });

    it('forcing replaces typed minutes and bypasses the "not found" cache', async () => {
      prisma.event.findUnique.mockResolvedValue(
        match({ travelMinutes: 30, travelMinutesManual: true, travelRouteKey: clubRoute }),
      );
      geocoding.geocode.mockResolvedValue({ latitude: 1, longitude: 1 });
      routing.drivingMinutes.mockResolvedValue(21);

      await service.recomputeTravel('event-1', { force: true });

      expect(geocoding.geocode).toHaveBeenCalledWith(expect.any(String), {
        bypassNegativeCache: true,
      });
      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { travelMinutes: 21, travelMinutesManual: false, travelRouteKey: clubRoute },
      });
    });
  });

  describe('refreshTravel', () => {
    it('turns a provider failure into a 503 the manager can act on', async () => {
      prisma.event.findUnique.mockResolvedValue(match());
      geocoding.geocode.mockRejectedValue(new Error('ORS 503'));

      await expect(service.refreshTravel(match())).rejects.toThrow(ServiceUnavailableException);
    });
  });
  describe('announceMeetingChanges', () => {
    // Tip-off in three days: inside the notification window.
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    soon.setUTCHours(19, 30, 0, 0);
    const soonRoute = { travelMinutes: 23, travelRouteKey: clubRoute };
    const withTeam = (row: MeetingEventRow) => ({
      ...row,
      opponentName: 'Rezé',
      meetingAnnouncedKey: 'Parking club|1 rue du Club, Nantes|old',
    });

    beforeEach(() => {
      prisma.team.findMany.mockResolvedValue([
        { id: 'team-1', name: 'U15 M', clubTeams: [{ clubId: 'club-1', isOwner: true }] },
      ]);
    });

    it('tells players when a meeting hour becomes known for the first time', async () => {
      prisma.event.findMany.mockResolvedValue([
        { ...withTeam(match({ startsAt: soon, ...soonRoute })), meetingAnnouncedKey: null },
      ]);
      prisma.eventRsvp.findMany.mockResolvedValue([
        { eventId: 'event-1', teamPlayer: { player: { userId: 'user-1' } } },
      ]);

      await service.announceMeetingChanges(['event-1']);

      expect(prisma.event.updateMany).toHaveBeenCalledWith({
        where: { id: 'event-1', meetingAnnouncedKey: null },
        data: { meetingAnnouncedKey: expect.stringContaining('Parking club|') },
      });
      expect(notifications.notify).toHaveBeenCalledWith([
        expect.objectContaining({ userId: 'user-1', title: 'RDV fixé — U15 M' }),
      ]);
    });

    it('never announces an unknown time', async () => {
      prisma.event.findMany.mockResolvedValue([withTeam(match({ startsAt: soon }))]);

      await service.announceMeetingChanges(['event-1']);

      expect(prisma.event.updateMany).not.toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('updates the key quietly for a match beyond the window', async () => {
      const far = new Date(Date.now() + MEETING_CHANGE_NOTIFY_WINDOW_MS + 24 * 60 * 60 * 1000);
      prisma.event.findMany.mockResolvedValue([withTeam(match({ startsAt: far, ...soonRoute }))]);

      await service.announceMeetingChanges(['event-1']);

      expect(prisma.event.updateMany).toHaveBeenCalled();
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('tells GOING players coming to the meeting point, linking through their own club', async () => {
      prisma.team.findMany.mockResolvedValue([
        {
          id: 'team-1',
          name: 'U15 M',
          clubTeams: [
            { clubId: 'club-1', isOwner: true },
            { clubId: 'club-2', isOwner: false },
          ],
        },
      ]);
      prisma.event.findMany.mockResolvedValue([withTeam(match({ startsAt: soon, ...soonRoute }))]);
      prisma.eventRsvp.findMany.mockResolvedValue([
        { eventId: 'event-1', teamPlayer: { player: { userId: 'user-partner' } } },
        { eventId: 'event-1', teamPlayer: { player: { userId: null } } },
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

    it('does not announce twice when another write already recorded the change', async () => {
      prisma.event.findMany.mockResolvedValue([withTeam(match({ startsAt: soon, ...soonRoute }))]);
      prisma.event.updateMany.mockResolvedValue({ count: 0 });

      await service.announceMeetingChanges(['event-1']);

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('swallows its own failures', async () => {
      prisma.event.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.announceMeetingChanges(['event-1'])).resolves.toBeUndefined();
    });
  });
});
