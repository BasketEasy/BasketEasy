import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GUEST_RSVP_CLOSED_CODE } from '@basketeasy/types/guest-links';
import { GuestRsvpService } from './guest-rsvp.service';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('GuestRsvpService', () => {
  let prisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
  let meetingPoints: { resolvePlans: jest.Mock };
  let notifications: { notify: jest.Mock };
  let limiter: { consumeIp: jest.Mock; chargeToken: jest.Mock; chargeInviteRequest: jest.Mock };
  let service: GuestRsvpService;

  const soon = () => ({
    id: 'event-1',
    teamId: 'team-1',
    type: 'MATCH',
    startsAt: new Date(Date.now() + 2 * DAY),
    timeConfirmed: true,
    location: 'Salle A',
    opponentName: 'Rezé',
    venue: 'HOME',
    notes: null,
  });

  beforeEach(() => {
    prisma = {
      team: { findUniqueOrThrow: jest.fn() },
      teamPlayer: {
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn(),
      },
      event: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      eventRsvp: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ travelMode: 'MEETING_POINT' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      eventRsvpChange: { create: jest.fn() },
      eventConvocation: { findMany: jest.fn().mockResolvedValue([]) },
      clubMembership: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    } as never;
    meetingPoints = { resolvePlans: jest.fn().mockResolvedValue(new Map()) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    limiter = {
      consumeIp: jest.fn(),
      chargeToken: jest.fn(),
      chargeInviteRequest: jest.fn(),
    };
    service = new GuestRsvpService(
      prisma as never,
      meetingPoints as never,
      notifications as never,
      limiter as never,
    );
  });

  describe('reading', () => {
    it('lists players before coaches, as first name + last initial', async () => {
      prisma.team.findUniqueOrThrow.mockResolvedValue({
        name: 'U15',
        clubTeams: [{ club: { name: 'BC Nantes' } }],
      });
      prisma.teamPlayer.findMany.mockResolvedValue([
        { id: 'tp-c', role: 'COACH', player: { firstName: 'Anne', lastName: 'Durand' } },
        { id: 'tp-2', role: 'PLAYER', player: { firstName: 'Zoé', lastName: 'Bernard' } },
        { id: 'tp-1', role: 'PLAYER', player: { firstName: 'Léo', lastName: 'Martin' } },
      ]);

      const page = await service.getPage('team-1');

      expect(page.clubName).toBe('BC Nantes');
      expect(page.roster).toEqual([
        { teamPlayerId: 'tp-1', firstName: 'Léo', lastInitial: 'M', role: 'PLAYER' },
        { teamPlayerId: 'tp-2', firstName: 'Zoé', lastInitial: 'B', role: 'PLAYER' },
        { teamPlayerId: 'tp-c', firstName: 'Anne', lastInitial: 'D', role: 'COACH' },
      ]);
    });

    it('queries only the next 14 days, strictly before kickoff', async () => {
      prisma.team.findUniqueOrThrow.mockResolvedValue({ name: 'U15', clubTeams: [] });
      prisma.teamPlayer.findMany.mockResolvedValue([]);

      await service.getPage('team-1');

      const { startsAt } = prisma.event.findMany.mock.calls[0][0].where;
      expect(startsAt.lte.getTime() - startsAt.gt.getTime()).toBe(14 * DAY);
    });

    it('builds one attendance entry per roster member, with travel only for a GOING match', async () => {
      prisma.team.findUniqueOrThrow.mockResolvedValue({ name: 'U15', clubTeams: [] });
      prisma.teamPlayer.findMany.mockResolvedValue([
        { id: 'tp-1', role: 'PLAYER', player: { firstName: 'Léo', lastName: 'M' } },
        { id: 'tp-2', role: 'PLAYER', player: { firstName: 'Zoé', lastName: 'B' } },
        { id: 'tp-3', role: 'PLAYER', player: { firstName: 'Ana', lastName: 'C' } },
      ]);
      prisma.event.findMany.mockResolvedValue([soon()]);
      prisma.eventRsvp.findMany.mockResolvedValue([
        {
          eventId: 'event-1',
          teamPlayerId: 'tp-1',
          status: 'GOING',
          travelMode: 'DIRECT',
          source: 'GUEST_LINK',
        },
        {
          eventId: 'event-1',
          teamPlayerId: 'tp-2',
          status: 'MAYBE',
          travelMode: 'DIRECT',
          source: 'APP',
        },
      ]);
      prisma.eventConvocation.findMany.mockResolvedValue([
        { eventId: 'event-1', teamPlayerId: 'tp-1' },
      ]);

      const { events } = await service.getPage('team-1');

      expect(events[0].attendance).toEqual([
        {
          teamPlayerId: 'tp-1',
          status: 'GOING',
          travelMode: 'DIRECT',
          convoked: true,
          viaLink: true,
        },
        {
          teamPlayerId: 'tp-2',
          status: 'MAYBE',
          travelMode: null,
          convoked: false,
          viaLink: false,
        },
        { teamPlayerId: 'tp-3', status: null, travelMode: null, convoked: false, viaLink: false },
      ]);
    });

    it('never serves a player id, a last name or a user id', async () => {
      prisma.team.findUniqueOrThrow.mockResolvedValue({ name: 'U15', clubTeams: [] });
      prisma.teamPlayer.findMany.mockResolvedValue([
        { id: 'tp-1', role: 'PLAYER', player: { firstName: 'Léo', lastName: 'Martin' } },
      ]);

      const json = JSON.stringify(await service.getPage('team-1'));

      expect(json).not.toContain('Martin');
    });
  });

  describe('setRsvp', () => {
    beforeEach(() => {
      prisma.event.findFirst.mockResolvedValue(soon());
      prisma.event.findMany.mockResolvedValue([soon()]);
      prisma.teamPlayer.findMany.mockResolvedValue([]);
    });

    it('is rate limited before anything is read', async () => {
      limiter.consumeIp.mockImplementation(() => {
        throw new Error('429');
      });

      await expect(
        service.setRsvp('team-1', 'tok', '1.1.1.1', 'event-1', {
          teamPlayerId: 'tp-1',
          status: 'GOING',
        }),
      ).rejects.toThrow('429');
      expect(prisma.event.findFirst).not.toHaveBeenCalled();
    });

    it('does not spend the shared token budget on a request that fails validation', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.setRsvp('team-1', 'tok', '1.1.1.1', 'event-x', {
          teamPlayerId: 'tp-1',
          status: 'GOING',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(limiter.consumeIp).toHaveBeenCalledWith('tok', '1.1.1.1');
      expect(limiter.chargeToken).not.toHaveBeenCalled();
    });

    it('is a 404 for an event of another team', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.setRsvp('team-1', 'tok', undefined, 'event-x', {
          teamPlayerId: 'tp-1',
          status: 'GOING',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it.each([
      ['already started', -HOUR],
      ['beyond 14 days', 15 * DAY],
    ])('is a 409 GUEST_RSVP_CLOSED for an event %s', async (_label, offset) => {
      prisma.event.findFirst.mockResolvedValue({
        ...soon(),
        startsAt: new Date(Date.now() + offset),
      });

      const error = await service
        .setRsvp('team-1', 'tok', undefined, 'event-1', { teamPlayerId: 'tp-1', status: 'GOING' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: GUEST_RSVP_CLOSED_CODE,
      });
      expect(prisma.eventRsvp.upsert).not.toHaveBeenCalled();
    });

    it('is a 400 for a teamPlayerId that is not on this roster', async () => {
      prisma.teamPlayer.count.mockResolvedValue(0);

      await expect(
        service.setRsvp('team-1', 'tok', undefined, 'event-1', {
          teamPlayerId: 'tp-9',
          status: 'GOING',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a travel mode without GOING, or on a training', async () => {
      await expect(
        service.setRsvp('team-1', 'tok', undefined, 'event-1', {
          teamPlayerId: 'tp-1',
          status: 'MAYBE',
          travelMode: 'DIRECT',
        }),
      ).rejects.toThrow(BadRequestException);

      prisma.event.findFirst.mockResolvedValue({ ...soon(), type: 'TRAINING' });
      await expect(
        service.setRsvp('team-1', 'tok', undefined, 'event-1', {
          teamPlayerId: 'tp-1',
          status: 'GOING',
          travelMode: 'DIRECT',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('writes the answer as GUEST_LINK with no author, plus a history row, in one transaction', async () => {
      prisma.eventRsvp.upsert.mockResolvedValue({ travelMode: 'DIRECT' });

      await service.setRsvp('team-1', 'tok', undefined, 'event-1', {
        teamPlayerId: 'tp-1',
        status: 'GOING',
        travelMode: 'DIRECT',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            source: 'GUEST_LINK',
            respondedByUserId: null,
            travelMode: 'DIRECT',
          }),
          update: expect.objectContaining({
            source: 'GUEST_LINK',
            respondedByUserId: null,
            travelMode: 'DIRECT',
          }),
        }),
      );
      expect(prisma.eventRsvpChange.create).toHaveBeenCalledWith({
        data: {
          eventId: 'event-1',
          teamPlayerId: 'tp-1',
          status: 'GOING',
          travelMode: 'DIRECT',
          source: 'GUEST_LINK',
          via: null,
          respondedByUserId: null,
        },
      });
    });

    it('tags the history row with the WhatsApp attribution, and never touches EventRsvp with it', async () => {
      await service.setRsvp('team-1', 'tok', undefined, 'event-1', {
        teamPlayerId: 'tp-1',
        status: 'GOING',
        via: 'WHATSAPP',
      });
      expect(prisma.eventRsvpChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ via: 'WHATSAPP', source: 'GUEST_LINK' }),
      });
      const { create, update } = prisma.eventRsvp.upsert.mock.calls[0][0];
      expect(create).not.toHaveProperty('via');
      expect(update).not.toHaveProperty('via');
    });

    it('keeps the travel choice on a re-tapped GOING and resets it when leaving GOING', async () => {
      await service.setRsvp('team-1', 'tok', undefined, 'event-1', {
        teamPlayerId: 'tp-1',
        status: 'GOING',
      });
      expect(prisma.eventRsvp.upsert.mock.calls[0][0].update).not.toHaveProperty('travelMode');

      await service.setRsvp('team-1', 'tok', undefined, 'event-1', {
        teamPlayerId: 'tp-1',
        status: 'MAYBE',
      });
      expect(prisma.eventRsvp.upsert.mock.calls[1][0].update.travelMode).toBe('MEETING_POINT');
      expect(prisma.eventRsvpChange.create.mock.calls[1][0].data.travelMode).toBeNull();
    });

    it('fires no notification', async () => {
      await service.setRsvp('team-1', 'tok', undefined, 'event-1', {
        teamPlayerId: 'tp-1',
        status: 'GOING',
      });

      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('clearRsvp', () => {
    beforeEach(() => {
      prisma.event.findFirst.mockResolvedValue(soon());
      prisma.event.findMany.mockResolvedValue([soon()]);
      prisma.teamPlayer.findMany.mockResolvedValue([]);
    });

    it('logs a null change when an answer was cleared', async () => {
      await service.clearRsvp('team-1', 'tok', undefined, 'event-1', 'tp-1');

      expect(prisma.eventRsvpChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: null, travelMode: null, source: 'GUEST_LINK' }),
      });
    });

    it('tags a cleared answer with the attribution too', async () => {
      await service.clearRsvp('team-1', 'tok', undefined, 'event-1', 'tp-1', 'WHATSAPP');

      expect(prisma.eventRsvpChange.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ via: 'WHATSAPP' }),
      });
    });

    it('logs nothing when there was no answer', async () => {
      prisma.eventRsvp.deleteMany.mockResolvedValue({ count: 0 });

      await service.clearRsvp('team-1', 'tok', undefined, 'event-1', 'tp-1');

      expect(prisma.eventRsvpChange.create).not.toHaveBeenCalled();
    });

    it('is closed after kickoff', async () => {
      prisma.event.findFirst.mockResolvedValue({
        ...soon(),
        startsAt: new Date(Date.now() - HOUR),
      });

      await expect(
        service.clearRsvp('team-1', 'tok', undefined, 'event-1', 'tp-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('requestInvite', () => {
    const rosterRow = (overrides: Record<string, unknown> = {}) => ({
      player: {
        id: 'player-1',
        clubId: 'club-9',
        firstName: 'Léo',
        lastName: 'Martin',
        userId: null,
        invite: null,
        ...overrides,
      },
    });

    beforeEach(() => {
      prisma.teamPlayer.findFirst.mockResolvedValue(rosterRow());
      prisma.clubMembership.findMany.mockResolvedValue([
        { userId: 'admin-1' },
        { userId: 'admin-2' },
      ]);
    });

    it('notifies the admins of the player’s own club, the only ones who can issue the invite', async () => {
      await service.requestInvite('team-1', 'tok', undefined, 'tp-1');

      expect(prisma.clubMembership.findMany).toHaveBeenCalledWith({
        where: { clubId: 'club-9', role: 'ADMIN' },
        select: { userId: true },
      });
      const inputs = notifications.notify.mock.calls[0][0];
      expect(inputs.map((i: { userId: string }) => i.userId)).toEqual(['admin-1', 'admin-2']);
      expect(inputs[0]).toMatchObject({
        type: 'GUEST_INVITE_REQUESTED',
        title: "Léo M. demande un lien d'invitation Kluvo",
        deepLink: '/clubs/club-9/members?tab=players&invite=player-1',
      });
    });

    it.each([
      ['not on the roster', () => prisma.teamPlayer.findFirst.mockResolvedValue(null)],
      [
        'already has an account',
        () => prisma.teamPlayer.findFirst.mockResolvedValue(rosterRow({ userId: 'u' })),
      ],
      [
        'has a live invite',
        () =>
          prisma.teamPlayer.findFirst.mockResolvedValue(
            rosterRow({ invite: { acceptedAt: null, expiresAt: new Date(Date.now() + DAY) } }),
          ),
      ],
      [
        'asked in the last 7 days',
        () => prisma.notification.findFirst.mockResolvedValue({ id: 'n' }),
      ],
    ])('resolves quietly without notifying when the player %s', async (_label, arrange) => {
      arrange();

      await expect(
        service.requestInvite('team-1', 'tok', undefined, 'tp-1'),
      ).resolves.toBeUndefined();

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('stays quiet when the club has no admin to tell', async () => {
      prisma.clubMembership.findMany.mockResolvedValue([]);

      await service.requestInvite('team-1', 'tok', undefined, 'tp-1');

      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('still notifies when the only invite has expired', async () => {
      prisma.teamPlayer.findFirst.mockResolvedValue(
        rosterRow({ invite: { acceptedAt: null, expiresAt: new Date(Date.now() - DAY) } }),
      );

      await service.requestInvite('team-1', 'tok', undefined, 'tp-1');

      expect(notifications.notify).toHaveBeenCalled();
    });
  });
});
