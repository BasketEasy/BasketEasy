import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DEFAULT_REMINDER_TEMPLATE } from '@basketeasy/types/whatsapp-reminder';
import { WhatsAppReminderService } from './whatsapp-reminder.service';

const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

describe('WhatsAppReminderService', () => {
  let prisma: {
    clubTeam: { findUnique: jest.Mock };
    team: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
    user: { count: jest.Mock };
    event: { findFirst: jest.Mock; findMany: jest.Mock };
    eventShare: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let guestLinks: { get: jest.Mock; enable: jest.Mock };
  let meetingPoints: { resolvePlans: jest.Mock };
  let scheduler: {
    resolveManagers: jest.Mock;
    syncEvents: jest.Mock;
    onShared: jest.Mock;
    ensureExpire: jest.Mock;
  };
  let feed: { subscribe: jest.Mock };
  let service: WhatsAppReminderService;

  const event = (startsAt = FUTURE) => ({
    id: 'e1',
    teamId: 't1',
    type: 'TRAINING',
    startsAt,
    timeConfirmed: true,
    location: 'Gymnase',
    opponentName: null,
  });

  beforeEach(() => {
    prisma = {
      clubTeam: { findUnique: jest.fn().mockResolvedValue({ teamId: 't1' }) },
      team: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'U15', waReminderTemplate: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { count: jest.fn().mockResolvedValue(1) },
      event: {
        findFirst: jest.fn().mockResolvedValue(event()),
        findMany: jest.fn().mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]),
      },
      eventShare: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    guestLinks = {
      get: jest.fn().mockResolvedValue({ url: 'https://k.test/r/abc' }),
      enable: jest.fn().mockResolvedValue({ url: 'https://k.test/r/abc' }),
    };
    meetingPoints = { resolvePlans: jest.fn().mockResolvedValue(new Map([['e1', null]])) };
    scheduler = {
      resolveManagers: jest.fn().mockResolvedValue([{ userId: 'm1', clubId: 'c' }]),
      syncEvents: jest.fn().mockResolvedValue(undefined),
      onShared: jest.fn().mockResolvedValue(undefined),
      ensureExpire: jest.fn().mockResolvedValue(undefined),
    };
    feed = { subscribe: jest.fn() };
    service = new WhatsAppReminderService(
      prisma as never,
      guestLinks as never,
      meetingPoints as never,
      scheduler as never,
      feed as never,
    );
  });

  describe('team settings', () => {
    const team = (over: Record<string, unknown> = {}) => ({
      name: 'U15',
      waReminderTemplate: null,
      waReminderEnabled: false,
      waDefaultOffsetMinutes: 4320,
      ...over,
    });

    beforeEach(() => prisma.team.findUniqueOrThrow.mockResolvedValue(team()));

    it('refuses a team that is not the route club’s', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);
      await expect(service.getTeamSettings('c', 't1')).rejects.toThrow(NotFoundException);
    });

    it('reads the template, the toggle, the default offset and whether anyone would hear it', async () => {
      await expect(service.getTeamSettings('c', 't1')).resolves.toEqual({
        reminderTemplate: null,
        reminderEnabled: false,
        defaultOffsetMinutes: 4320,
        hasReachableManager: true,
      });
    });

    it('rule 6: warns when no manager has a delivery channel', async () => {
      prisma.user.count.mockResolvedValue(0);
      expect((await service.getTeamSettings('c', 't1')).hasReachableManager).toBe(false);
    });

    it('rule 6: warns when the team has no manager at all, without a query', async () => {
      scheduler.resolveManagers.mockResolvedValue([]);
      expect((await service.getTeamSettings('c', 't1')).hasReachableManager).toBe(false);
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it('refuses a template without the link, carrying the code', async () => {
      const promise = service.updateTeamSettings('c', 't1', { reminderTemplate: 'salut' }, 'u');
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({ response: { code: 'MISSING_LINK' } });
      expect(prisma.team.update).not.toHaveBeenCalled();
    });

    it.each([[''], ['   '], [null], [DEFAULT_REMINDER_TEMPLATE]])(
      'stores template %j as null (the default)',
      async (value) => {
        await service.updateTeamSettings('c', 't1', { reminderTemplate: value }, 'u');
        expect(prisma.team.update).toHaveBeenCalledWith({
          where: { id: 't1' },
          data: { waReminderTemplate: null },
        });
      },
    );

    it('stores a custom valid template', async () => {
      await service.updateTeamSettings('c', 't1', { reminderTemplate: 'Yo {link}' }, 'u');
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { waReminderTemplate: 'Yo {link}' },
      });
    });

    it('a template-only save does not touch the schedule', async () => {
      await service.updateTeamSettings('c', 't1', { reminderTemplate: 'Yo {link}' }, 'u');
      expect(scheduler.syncEvents).not.toHaveBeenCalled();
      expect(guestLinks.enable).not.toHaveBeenCalled();
    });

    it('rule 7: switching the reminder on switches the guest link on, and says so', async () => {
      guestLinks.get.mockResolvedValue(null);
      const result = await service.updateTeamSettings('c', 't1', { reminderEnabled: true }, 'u');
      expect(guestLinks.enable).toHaveBeenCalledWith('c', 't1', 'u');
      expect(result.guestLinkEnabled).toBe(true);
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { waReminderEnabled: true },
      });
    });

    it('does not claim to have enabled a link that was already on', async () => {
      const result = await service.updateTeamSettings('c', 't1', { reminderEnabled: true }, 'u');
      expect(result.guestLinkEnabled).toBe(false);
    });

    it('switching the reminder off leaves the guest link alone', async () => {
      await service.updateTeamSettings('c', 't1', { reminderEnabled: false }, 'u');
      expect(guestLinks.enable).not.toHaveBeenCalled();
    });

    it('re-syncs every upcoming event of the team in one batch after a schedule change', async () => {
      await service.updateTeamSettings('c', 't1', { defaultOffsetMinutes: 1440 }, 'u');
      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { teamId: 't1', startsAt: { gt: expect.any(Date) } },
        select: { id: true },
      });
      expect(scheduler.syncEvents).toHaveBeenCalledTimes(1);
      expect(scheduler.syncEvents).toHaveBeenCalledWith(['e1', 'e2']);
    });
  });

  describe('getEventShare', () => {
    it('reports NOT_SENT with a rendered message, writing nothing', async () => {
      prisma.eventShare.findMany.mockResolvedValue([]);
      const result = await service.getEventShare('c', 't1', 'e1', 'u');
      expect(result.guestLinkActive).toBe(true);
      expect(result.shares).toEqual([
        expect.objectContaining({ type: 'REMINDER', state: 'NOT_SENT', sentBy: null }),
      ]);
      expect(result.shares[0].message).toContain('https://k.test/r/abc?src=wa');
      expect(prisma.eventShare.create).not.toHaveBeenCalled();
    });

    it('has no message while the guest link is off', async () => {
      guestLinks.get.mockResolvedValue(null);
      prisma.eventShare.findMany.mockResolvedValue([]);
      const result = await service.getEventShare('c', 't1', 'e1', 'u');
      expect(result.guestLinkActive).toBe(false);
      expect(result.shares[0].message).toBeNull();
    });

    it('404s an event that is not the team’s', async () => {
      prisma.event.findFirst.mockResolvedValue(null);
      await expect(service.getEventShare('c', 't1', 'e1', 'u')).rejects.toThrow(NotFoundException);
    });
  });

  describe('confirmShare', () => {
    const sentRow = {
      type: 'REMINDER',
      state: 'SENT',
      dueAt: null,
      sentAt: new Date('2026-10-01T10:00:00Z'),
      platform: 'WA_ME',
      sentBy: { id: 'first', firstName: 'Sophie', lastName: 'Martin' },
    };

    it('refuses a past event', async () => {
      prisma.event.findFirst.mockResolvedValue(event(new Date(Date.now() - 1000)));
      await expect(
        service.confirmShare('c', 't1', 'e1', 'REMINDER', 'u', 'COPY'),
      ).rejects.toMatchObject({ response: { code: 'WA_SHARE_CLOSED' } });
    });

    it('refuses while the guest link is off', async () => {
      guestLinks.get.mockResolvedValue(null);
      const promise = service.confirmShare('c', 't1', 'e1', 'REMINDER', 'u', 'COPY');
      await expect(promise).rejects.toThrow(ConflictException);
      await expect(promise).rejects.toMatchObject({ response: { code: 'GUEST_LINK_DISABLED' } });
    });

    it('records the sender, platform and content key', async () => {
      prisma.eventShare.create.mockResolvedValue({});
      prisma.eventShare.findUniqueOrThrow.mockResolvedValue(sentRow);
      const status = await service.confirmShare('c', 't1', 'e1', 'REMINDER', 'first', 'WA_ME');
      expect(prisma.eventShare.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'e1',
          type: 'REMINDER',
          state: 'SENT',
          sentByUserId: 'first',
          platform: 'WA_ME',
          sentContentKey: expect.stringMatching(/^[0-9a-f]{8}$/),
        }),
      });
      expect(status).toMatchObject({ state: 'SENT', sentBy: { firstName: 'Sophie', isMe: true } });
    });

    it('a second confirmation is a 200 returning the first writer’s status', async () => {
      prisma.eventShare.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
      );
      prisma.eventShare.findUniqueOrThrow.mockResolvedValue(sentRow);
      const status = await service.confirmShare('c', 't1', 'e1', 'REMINDER', 'second', 'COPY');
      expect(status).toMatchObject({
        platform: 'WA_ME',
        sentBy: { firstName: 'Sophie', isMe: false },
      });
    });

    it('rethrows anything that is not the unique violation', async () => {
      prisma.eventShare.create.mockRejectedValue(new Error('db down'));
      await expect(service.confirmShare('c', 't1', 'e1', 'REMINDER', 'u', 'COPY')).rejects.toThrow(
        'db down',
      );
    });

    const unique = () =>
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });

    it('a loser of the race withdraws nothing again', async () => {
      prisma.eventShare.create.mockRejectedValue(unique());
      prisma.eventShare.updateMany.mockResolvedValue({ count: 0 });
      prisma.eventShare.findUniqueOrThrow.mockResolvedValue(sentRow);
      await service.confirmShare('c', 't1', 'e1', 'REMINDER', 'second', 'COPY');
      expect(scheduler.onShared).not.toHaveBeenCalled();
    });

    it('moves a scheduled or pending row to SENT only if nobody got there first', async () => {
      prisma.eventShare.create.mockRejectedValue(unique());
      prisma.eventShare.updateMany.mockResolvedValue({ count: 1 });
      prisma.eventShare.findUniqueOrThrow.mockResolvedValue({ ...sentRow, id: 's1' });
      await service.confirmShare('c', 't1', 'e1', 'REMINDER', 'first', 'WA_ME');
      expect(prisma.eventShare.updateMany).toHaveBeenCalledWith({
        where: { eventId: 'e1', type: 'REMINDER', state: { not: 'SENT' } },
        data: expect.objectContaining({ state: 'SENT', sentByUserId: 'first', platform: 'WA_ME' }),
      });
      expect(scheduler.onShared).toHaveBeenCalledWith('s1');
    });

    it('records what the group is about to read, for the next comparison and « what moved »', async () => {
      prisma.eventShare.create.mockResolvedValue({});
      prisma.eventShare.findUniqueOrThrow.mockResolvedValue({ ...sentRow, id: 's1' });
      await service.confirmShare('c', 't1', 'e1', 'UPDATE', 'first', 'COPY');
      expect(prisma.eventShare.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          teamId: 't1',
          type: 'UPDATE',
          sentVars: expect.objectContaining({ event_name: 'Entraînement', link: null }),
        }),
      });
    });

    it('sends a cancellation to the team-page route, never the event one', async () => {
      await expect(
        service.confirmShare('c', 't1', 'e1', 'CANCELLATION', 'u', 'COPY'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.eventShare.create).not.toHaveBeenCalled();
    });
  });

  describe('UPDATE in getEventShare', () => {
    const at = new Date('2026-10-01T10:00:00Z');
    const reminder = {
      id: 'r1',
      type: 'REMINDER',
      state: 'SENT',
      dueAt: null,
      sentAt: at,
      platform: 'WA_ME',
      sentBy: null,
      sentContentKey: 'abcd1234',
      sentVars: {
        event_name: 'Entraînement',
        event_date: 'sam. 3 oct.',
        event_time: '15:30',
        location: 'Gymnase',
        opponent: null,
        meeting_time: null,
        meeting_place: null,
      },
    };
    const update = (state: string) => ({
      ...reminder,
      id: 'u1',
      type: 'UPDATE',
      state,
      sentAt: null,
      sentContentKey: null,
      sentVars: null,
    });

    it('lists no UPDATE until one has been raised', async () => {
      prisma.eventShare.findMany.mockResolvedValue([reminder]);
      const { shares } = await service.getEventShare('c', 't1', 'e1', 'u');
      expect(shares.map((s) => s.type)).toEqual(['REMINDER']);
    });

    it('lists a pending UPDATE with what moved, old value first', async () => {
      prisma.eventShare.findMany.mockResolvedValue([reminder, update('PENDING')]);
      const { shares } = await service.getEventShare('c', 't1', 'e1', 'u');
      const upd = shares.find((s) => s.type === 'UPDATE')!;
      expect(upd.state).toBe('PENDING');
      expect(upd.message).toContain('Changement');
      expect(upd.changes).toEqual(
        expect.arrayContaining([
          { label: 'Heure de début', from: '15:30', to: expect.any(String) },
        ]),
      );
      expect(shares.find((s) => s.type === 'REMINDER')!.changes).toEqual([]);
    });

    it('says nothing moved for a sent UPDATE', async () => {
      prisma.eventShare.findMany.mockResolvedValue([reminder, update('SENT')]);
      const { shares } = await service.getEventShare('c', 't1', 'e1', 'u');
      expect(shares.find((s) => s.type === 'UPDATE')!.changes).toEqual([]);
    });

    it('uses the team’s own update template when it has one', async () => {
      prisma.team.findUniqueOrThrow.mockResolvedValue({
        name: 'U15',
        waReminderTemplate: null,
        waUpdateTemplate: 'Oups {event_name} {link}',
        waCancellationTemplate: null,
      });
      prisma.eventShare.findMany.mockResolvedValue([reminder, update('PENDING')]);
      const { shares } = await service.getEventShare('c', 't1', 'e1', 'u');
      expect(shares.find((s) => s.type === 'UPDATE')!.message).toBe(
        'Oups Entraînement https://k.test/r/abc?src=wa',
      );
    });
  });

  describe('onEventsChanged', () => {
    const at = new Date('2026-10-01T10:00:00Z');
    const eventRow = (over: Record<string, unknown> = {}) => ({
      id: 'e1',
      teamId: 't1',
      type: 'TRAINING',
      startsAt: FUTURE,
      timeConfirmed: true,
      location: 'Gymnase',
      opponentName: null,
      ...over,
    });
    // The key of the message as it reads for `eventRow()`.
    let currentKey: string;
    const sent = (over: Record<string, unknown> = {}) => ({
      id: 'r1',
      eventId: 'e1',
      type: 'REMINDER',
      state: 'SENT',
      sentAt: at,
      sentContentKey: 'stale',
      sentVars: {},
      ...over,
    });

    beforeEach(async () => {
      scheduler = {
        ...scheduler,
        notifyChangePrompts: jest.fn().mockResolvedValue(undefined),
        queueFollowUps: jest.fn().mockResolvedValue(undefined),
        discard: jest.fn().mockResolvedValue(undefined),
      } as never;
      service = new WhatsAppReminderService(
        prisma as never,
        { ...guestLinks, urlForTeam: jest.fn().mockResolvedValue('https://k.test/r/abc') } as never,
        meetingPoints as never,
        scheduler as never,
        feed as never,
      );
      prisma.event.findMany.mockResolvedValue([eventRow()]);
      prisma.team.findUniqueOrThrow.mockResolvedValue({ name: 'U15' });
      prisma.eventShare.create.mockResolvedValue({ id: 'u1' });
      const { contentKey } = await import('@basketeasy/types/whatsapp-reminder');
      const { buildTemplateVars } = await import('./whatsapp-template-vars');
      currentKey = contentKey(buildTemplateVars(eventRow() as never, 'U15', null, ''));
    });

    const notifiedFor = () =>
      (scheduler as unknown as { notifyChangePrompts: jest.Mock }).notifyChangePrompts;

    it('raises nothing for an event nobody was told about', async () => {
      prisma.eventShare.findMany.mockResolvedValue([
        sent({ state: 'SCHEDULED', sentAt: null, sentContentKey: null }),
      ]);
      await service.onEventsChanged(['e1']);
      expect(prisma.eventShare.create).not.toHaveBeenCalled();
      expect(notifiedFor()).toHaveBeenCalledWith('t1', 'UPDATE', []);
    });

    it('raises nothing when the message reads the same', async () => {
      prisma.eventShare.findMany.mockResolvedValue([sent({ sentContentKey: currentKey })]);
      await service.onEventsChanged(['e1']);
      expect(prisma.eventShare.create).not.toHaveBeenCalled();
    });

    it('creates a PENDING UPDATE and one notification when the message changed', async () => {
      prisma.eventShare.findMany.mockResolvedValue([sent()]);
      await service.onEventsChanged(['e1']);
      expect(prisma.eventShare.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'e1',
          teamId: 't1',
          type: 'UPDATE',
          state: 'PENDING',
        }),
        select: { id: true },
      });
      expect(notifiedFor()).toHaveBeenCalledWith('t1', 'UPDATE', [
        expect.objectContaining({ shareId: 'u1', eventId: 'e1' }),
      ]);
      expect(
        (scheduler as unknown as { queueFollowUps: jest.Mock }).queueFollowUps,
      ).toHaveBeenCalledWith([expect.objectContaining({ shareId: 'u1', startsAt: FUTURE })]);
    });

    it('resets an already shared UPDATE to PENDING, keeping what the group last read', async () => {
      prisma.eventShare.findMany.mockResolvedValue([
        sent({ sentAt: new Date('2026-10-01T09:00:00Z') }),
        sent({ id: 'u1', type: 'UPDATE', sentAt: at, sentContentKey: 'older' }),
      ]);
      prisma.eventShare.updateMany.mockResolvedValue({ count: 1 });
      await service.onEventsChanged(['e1']);
      const { data, where } = prisma.eventShare.updateMany.mock.calls[0][0];
      expect(where).toEqual({ id: 'u1', state: { not: 'PENDING' } });
      expect(data).toMatchObject({ state: 'PENDING', nudgedAt: null, sentByUserId: null });
      expect(data).not.toHaveProperty('sentContentKey');
      expect(data).not.toHaveProperty('sentVars');
      expect(data).not.toHaveProperty('sentAt');
    });

    it('does not notify again for an UPDATE that is already PENDING', async () => {
      prisma.eventShare.findMany.mockResolvedValue([
        sent(),
        sent({ id: 'u1', type: 'UPDATE', state: 'PENDING', sentAt: null, sentContentKey: null }),
      ]);
      await service.onEventsChanged(['e1']);
      expect(prisma.eventShare.create).not.toHaveBeenCalled();
      expect(prisma.eventShare.updateMany).not.toHaveBeenCalled();
      expect(notifiedFor()).toHaveBeenCalledWith('t1', 'UPDATE', []);
    });

    it('moves a pending UPDATE expiry to the event current kick-off', async () => {
      prisma.eventShare.findMany.mockResolvedValue([
        sent(),
        sent({ id: 'u1', type: 'UPDATE', state: 'PENDING', sentAt: null, sentContentKey: null }),
      ]);
      await service.onEventsChanged(['e1']);
      expect(scheduler.ensureExpire).toHaveBeenCalledWith('u1', expect.any(Date));
    });

    it('voids a pending UPDATE when the edit is reverted', async () => {
      prisma.eventShare.findMany.mockResolvedValue([
        sent({ sentContentKey: currentKey }),
        sent({ id: 'u1', type: 'UPDATE', state: 'PENDING', sentAt: null, sentContentKey: null }),
      ]);
      prisma.eventShare.updateMany.mockResolvedValue({ count: 1 });
      await service.onEventsChanged(['e1']);
      expect(prisma.eventShare.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', state: 'PENDING' },
        data: { state: 'VOID' },
      });
      expect((scheduler as unknown as { discard: jest.Mock }).discard).toHaveBeenCalledWith(['u1']);
    });

    it('a series edit raises one notification for the whole call', async () => {
      const second = eventRow({ id: 'e2', startsAt: new Date(FUTURE.getTime() + 7 * 86400000) });
      prisma.event.findMany.mockResolvedValue([eventRow(), second]);
      prisma.eventShare.findMany.mockResolvedValue([sent(), sent({ id: 'r2', eventId: 'e2' })]);
      prisma.eventShare.create
        .mockResolvedValueOnce({ id: 'u1' })
        .mockResolvedValueOnce({ id: 'u2' });
      meetingPoints.resolvePlans.mockResolvedValue(new Map());
      await service.onEventsChanged(['e1', 'e2']);
      expect(notifiedFor()).toHaveBeenCalledTimes(1);
      expect(notifiedFor().mock.calls[0][2]).toHaveLength(2);
    });

    it('never throws into the caller', async () => {
      prisma.event.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.onEventsChanged(['e1'])).resolves.toBeUndefined();
    });

    it('ignores events that already started', async () => {
      prisma.event.findMany.mockResolvedValue([]);
      await service.onEventsChanged(['e1']);
      expect(prisma.eventShare.findMany).not.toHaveBeenCalled();
    });

    it('subscribes to the meeting change feed and reacts to it', () => {
      service.onModuleInit();
      expect(feed.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancellations', () => {
    const tx = () => ({
      eventShare: {
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      event: { findMany: jest.fn() },
      team: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'U15' }) },
    });

    it('snapshots each announced event, drops every other share, and keeps the link out of the snapshot', async () => {
      const client = tx();
      client.eventShare.findMany.mockResolvedValue([
        { id: 'r1', eventId: 'e1', state: 'SENT' },
        { id: 'u1', eventId: 'e1', state: 'PENDING' },
        { id: 'r2', eventId: 'e2', state: 'SCHEDULED' },
      ]);
      client.event.findMany.mockResolvedValue([event()]);
      client.eventShare.create.mockResolvedValue({ id: 'c1' });
      meetingPoints.resolvePlans.mockResolvedValue(new Map([['e1', null]]));

      const prepared = await service.prepareCancellations(client as never, 't1', ['e1', 'e2']);

      expect(client.eventShare.create).toHaveBeenCalledTimes(1);
      expect(client.eventShare.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'e1',
          teamId: 't1',
          type: 'CANCELLATION',
          state: 'PENDING',
          expiresAt: FUTURE,
          eventSnapshot: expect.objectContaining({ event_name: 'Entraînement', link: null }),
        }),
        select: { id: true },
      });
      expect(client.eventShare.deleteMany).toHaveBeenCalledWith({
        where: { eventId: { in: ['e1', 'e2'] }, type: { in: ['REMINDER', 'UPDATE'] } },
      });
      expect(prepared.created).toEqual([
        expect.objectContaining({ shareId: 'c1', startsAt: FUTURE }),
      ]);
      expect(prepared.discardedShareIds).toEqual(['r1', 'u1', 'r2']);
    });

    it('raises nothing for events never announced, but still drops their shares', async () => {
      const client = tx();
      client.eventShare.findMany.mockResolvedValue([
        { id: 'r2', eventId: 'e2', state: 'SCHEDULED' },
      ]);

      const prepared = await service.prepareCancellations(client as never, 't1', ['e2']);

      expect(client.eventShare.create).not.toHaveBeenCalled();
      expect(client.eventShare.deleteMany).toHaveBeenCalled();
      expect(prepared.created).toEqual([]);
    });

    it('does not raise a cancellation for an event that already started', async () => {
      const client = tx();
      client.eventShare.findMany.mockResolvedValue([{ id: 'r1', eventId: 'e1', state: 'SENT' }]);
      client.event.findMany.mockResolvedValue([]);
      const prepared = await service.prepareCancellations(client as never, 't1', ['e1']);
      expect(prepared.created).toEqual([]);
      expect(client.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ startsAt: { gt: expect.any(Date) } }),
        }),
      );
    });

    it('afterCancellations discards the old jobs and asks managers once', async () => {
      const s = {
        discard: jest.fn().mockResolvedValue(undefined),
        queueFollowUps: jest.fn().mockResolvedValue(undefined),
        notifyChangePrompts: jest.fn().mockResolvedValue(undefined),
      };
      const svc = new WhatsAppReminderService(
        prisma as never,
        guestLinks as never,
        meetingPoints as never,
        s as never,
        feed as never,
      );
      await svc.afterCancellations('t1', {
        created: [
          { shareId: 'c1', startsAt: FUTURE, subject: 'A' },
          { shareId: 'c2', startsAt: FUTURE, subject: 'B' },
        ],
        discardedShareIds: ['r1'],
      });
      expect(s.discard).toHaveBeenCalledWith(['r1']);
      expect(s.queueFollowUps).toHaveBeenCalledTimes(1);
      expect(s.queueFollowUps).toHaveBeenCalledWith([
        expect.objectContaining({ shareId: 'c1' }),
        expect.objectContaining({ shareId: 'c2' }),
      ]);
      expect(s.notifyChangePrompts).toHaveBeenCalledTimes(1);
      expect(s.notifyChangePrompts).toHaveBeenCalledWith('t1', 'CANCELLATION', [
        expect.objectContaining({ shareId: 'c1', eventId: null }),
        expect.objectContaining({ shareId: 'c2', eventId: null }),
      ]);
    });

    describe('pending list and confirm by share id', () => {
      const row = (over: Record<string, unknown> = {}) => ({
        id: 'c1',
        type: 'CANCELLATION',
        state: 'PENDING',
        dueAt: null,
        sentAt: null,
        platform: null,
        sentBy: null,
        expiresAt: FUTURE,
        eventSnapshot: {
          event_name: 'Match contre ES Vertou',
          event_date: 'sam. 4 oct.',
          link: null,
        },
        ...over,
      });

      beforeEach(() => {
        service = new WhatsAppReminderService(
          prisma as never,
          { ...guestLinks, urlForTeam: jest.fn().mockResolvedValue(null) } as never,
          meetingPoints as never,
          scheduler as never,
          feed as never,
        );
      });

      it('renders each from its snapshot, even with the guest link off', async () => {
        prisma.eventShare.findMany.mockResolvedValue([row()]);
        prisma.team.findUniqueOrThrow.mockResolvedValue({ waCancellationTemplate: null });
        const [pending] = await service.listPendingCancellations('c', 't1', 'u');
        expect(pending).toMatchObject({
          shareId: 'c1',
          eventName: 'Match contre ES Vertou',
          eventDate: 'sam. 4 oct.',
          message: expect.stringContaining("Match contre ES Vertou du sam. 4 oct. : c'est annulé"),
        });
      });

      it('lists only cancellations whose event has not started', async () => {
        prisma.eventShare.findMany.mockResolvedValue([]);
        prisma.team.findUniqueOrThrow.mockResolvedValue({ waCancellationTemplate: null });
        await service.listPendingCancellations('c', 't1', 'u');
        expect(prisma.eventShare.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              teamId: 't1',
              type: 'CANCELLATION',
              state: { in: ['PENDING', 'SENT'] },
              expiresAt: { gt: expect.any(Date) },
            },
          }),
        );
      });

      it('refuses another team’s share', async () => {
        (prisma as never as { eventShare: { findFirst: jest.Mock } }).eventShare.findFirst = jest
          .fn()
          .mockResolvedValue(null);
        await expect(
          service.confirmCancellation('c', 't1', 'other-teams-share', 'u', 'COPY'),
        ).rejects.toThrow(NotFoundException);
        expect(prisma.eventShare.updateMany).not.toHaveBeenCalled();
      });

      it('confirms first-writer-wins and clears the bells', async () => {
        const p = prisma as never as { eventShare: { findFirst: jest.Mock } };
        p.eventShare.findFirst = jest.fn().mockResolvedValue({ id: 'c1', expiresAt: FUTURE });
        prisma.eventShare.updateMany.mockResolvedValue({ count: 1 });
        prisma.eventShare.findUniqueOrThrow.mockResolvedValue(
          row({ state: 'SENT', sentAt: new Date(), platform: 'COPY' }),
        );
        const status = await service.confirmCancellation('c', 't1', 'c1', 'u', 'COPY');
        expect(p.eventShare.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'c1', teamId: 't1', type: 'CANCELLATION' } }),
        );
        expect(prisma.eventShare.updateMany).toHaveBeenCalledWith({
          where: { id: 'c1', state: { not: 'SENT' } },
          data: expect.objectContaining({ state: 'SENT', sentByUserId: 'u', platform: 'COPY' }),
        });
        expect(scheduler.onShared).toHaveBeenCalledWith('c1');
        expect(status.state).toBe('SENT');
      });

      it('refuses once the event would have started', async () => {
        const p = prisma as never as { eventShare: { findFirst: jest.Mock } };
        p.eventShare.findFirst = jest
          .fn()
          .mockResolvedValue({ id: 'c1', expiresAt: new Date(Date.now() - 1000) });
        await expect(
          service.confirmCancellation('c', 't1', 'c1', 'u', 'COPY'),
        ).rejects.toMatchObject({ response: { code: 'WA_SHARE_CLOSED' } });
      });
    });
  });
});
