import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DEFAULT_REMINDER_TEMPLATE } from '@basketeasy/types/whatsapp-reminder';
import { WhatsAppReminderService } from './whatsapp-reminder.service';

const FUTURE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

describe('WhatsAppReminderService', () => {
  let prisma: {
    clubTeam: { findUnique: jest.Mock };
    team: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
    event: { findFirst: jest.Mock };
    eventShare: { create: jest.Mock; findMany: jest.Mock; findUniqueOrThrow: jest.Mock };
  };
  let guestLinks: { get: jest.Mock };
  let meetingPoints: { resolvePlans: jest.Mock };
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
      event: { findFirst: jest.fn().mockResolvedValue(event()) },
      eventShare: { create: jest.fn(), findMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    };
    guestLinks = { get: jest.fn().mockResolvedValue({ url: 'https://k.test/r/abc' }) };
    meetingPoints = { resolvePlans: jest.fn().mockResolvedValue(new Map([['e1', null]])) };
    service = new WhatsAppReminderService(
      prisma as never,
      guestLinks as never,
      meetingPoints as never,
    );
  });

  describe('team settings', () => {
    it('refuses a team that is not the route club’s', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);
      await expect(service.getTeamSettings('c', 't1')).rejects.toThrow(NotFoundException);
    });

    it('refuses a template without the link, carrying the code', async () => {
      const promise = service.updateTeamSettings('c', 't1', { reminderTemplate: 'salut' });
      await expect(promise).rejects.toThrow(BadRequestException);
      await expect(promise).rejects.toMatchObject({ response: { code: 'MISSING_LINK' } });
      expect(prisma.team.update).not.toHaveBeenCalled();
    });

    it.each([[''], ['   '], [null], [DEFAULT_REMINDER_TEMPLATE]])(
      'stores %j as null (the default)',
      async (value) => {
        await expect(
          service.updateTeamSettings('c', 't1', { reminderTemplate: value }),
        ).resolves.toEqual({ reminderTemplate: null });
        expect(prisma.team.update).toHaveBeenCalledWith({
          where: { id: 't1' },
          data: { waReminderTemplate: null },
        });
      },
    );

    it('stores a custom valid template', async () => {
      await expect(
        service.updateTeamSettings('c', 't1', { reminderTemplate: 'Yo {link}' }),
      ).resolves.toEqual({ reminderTemplate: 'Yo {link}' });
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
