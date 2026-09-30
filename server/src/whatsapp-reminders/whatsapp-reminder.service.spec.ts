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
  };
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
    };
    service = new WhatsAppReminderService(
      prisma as never,
      guestLinks as never,
      meetingPoints as never,
      scheduler as never,
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
  });
});
