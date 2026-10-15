import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PUSH_CLIENT, PushSubscriptionGoneError } from './push-client';

// notify() hands delivery to a fire-and-forget promise it does not await, so
// every delivery assertion has to let the microtask queue drain first.
const flushDelivery = () => new Promise((resolve) => setImmediate(resolve));

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    notification: {
      createMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { findMany: jest.Mock };
    pushSubscription: { upsert: jest.Mock; deleteMany: jest.Mock };
  };
  let mail: { sendNotificationEmail: jest.Mock; sendAndForget: jest.Mock; absoluteUrl: jest.Mock };
  let push: { getPublicKey: jest.Mock; send: jest.Mock };

  const pushTarget = { endpoint: 'https://push.example/abc', p256dh: 'p256', auth: 'auth' };

  beforeEach(async () => {
    prisma = {
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      pushSubscription: {
        upsert: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    mail = {
      sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
      sendAndForget: jest.fn((send: () => Promise<void>) => {
        void send();
      }),
      absoluteUrl: jest.fn((path: string) => `https://kluvo.example${path}`),
    };
    push = { getPublicKey: jest.fn().mockReturnValue('vapid-public'), send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: PUSH_CLIENT, useValue: push },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  const convocation = {
    userId: 'user-1',
    type: 'EVENT_CONVOCATION' as const,
    title: 'Vous êtes convoqué·e — U15 M',
    body: 'Match contre ASVEL.',
    deepLink: '/clubs/club-1/teams/team-1/events/event-1',
  };

  describe('notify', () => {
    it('writes the in-app rows and delivers to e-mail and push', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'theo.dupont@example.com',
          emailNotificationsEnabled: true,
          pushSubscriptions: [pushTarget],
        },
      ]);

      await service.notify([convocation]);
      await flushDelivery();

      expect(prisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'user-1',
            type: 'EVENT_CONVOCATION',
            title: convocation.title,
            body: convocation.body,
            deepLink: convocation.deepLink,
            subjectFirstName: null,
          },
        ],
      });
      expect(mail.sendNotificationEmail).toHaveBeenCalledWith(
        'theo.dupont@example.com',
        expect.objectContaining({ title: convocation.title }),
      );
      // The push payload carries an absolute URL — the service worker opens
      // it directly and has no frontend origin of its own to prefix.
      expect(push.send).toHaveBeenCalledWith(
        pushTarget,
        expect.objectContaining({
          url: 'https://kluvo.example/clubs/club-1/teams/team-1/events/event-1',
        }),
      );
    });

    it('writes nothing and delivers nothing for an empty batch', async () => {
      await service.notify([]);

      expect(prisma.notification.createMany).not.toHaveBeenCalled();
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('skips the e-mail but still pushes when the user opted out of e-mails', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'theo.dupont@example.com',
          emailNotificationsEnabled: false,
          pushSubscriptions: [pushTarget],
        },
      ]);

      await service.notify([convocation]);
      await flushDelivery();

      // The in-app row is written regardless — the toggle is a delivery
      // preference, not a "don't tell me".
      expect(prisma.notification.createMany).toHaveBeenCalled();
      expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
      expect(push.send).toHaveBeenCalled();
    });

    it('deletes a push subscription the push service reports as gone', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'theo.dupont@example.com',
          emailNotificationsEnabled: true,
          pushSubscriptions: [pushTarget],
        },
      ]);
      push.send.mockRejectedValue(new PushSubscriptionGoneError(pushTarget.endpoint));

      await service.notify([convocation]);
      await flushDelivery();

      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: pushTarget.endpoint },
      });
    });

    it('keeps a subscription whose send failed transiently', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'theo.dupont@example.com',
          emailNotificationsEnabled: true,
          pushSubscriptions: [pushTarget],
        },
      ]);
      push.send.mockRejectedValue(new Error('503 Service Unavailable'));

      await service.notify([convocation]);
      await flushDelivery();

      expect(prisma.pushSubscription.deleteMany).not.toHaveBeenCalled();
    });

    it('resolves even when delivery blows up entirely', async () => {
      prisma.user.findMany.mockRejectedValue(new Error('database is on fire'));

      // A convocation a manager already made must not be rolled back because
      // nobody could be told about it.
      await expect(service.notify([convocation])).resolves.toBeUndefined();
      await flushDelivery();
    });

    it('resolves recipients in one query however many notifications are in the batch', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.notify([
        convocation,
        { ...convocation, userId: 'user-2' },
        { ...convocation, userId: 'user-3' },
      ]);
      await flushDelivery();

      expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    it('returns the account-wide unread count, not the page count', async () => {
      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'notif-1',
          type: 'EVENT_CONVOCATION',
          title: convocation.title,
          body: convocation.body,
          deepLink: convocation.deepLink,
          readAt: null,
          createdAt: new Date('2026-09-04T09:00:00.000Z'),
        },
      ]);
      prisma.notification.count.mockResolvedValue(7);

      const result = await service.list('user-1', { limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].createdAt).toBe('2026-09-04T09:00:00.000Z');
      expect(result.unreadCount).toBe(7);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', readAt: null },
      });
    });

    it('caps an oversized limit rather than trusting the caller', async () => {
      await service.list('user-1', { limit: 5000 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('markRead', () => {
    it('scopes the update to the caller so another account cannot be touched', async () => {
      await service.markRead('user-1', 'notif-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });

    it('is a no-op for an already-read notification', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      prisma.notification.count.mockResolvedValue(1);

      await expect(service.markRead('user-1', 'notif-1')).resolves.toBeUndefined();
    });

    it('404s for a notification that is not the caller’s', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 0 });
      prisma.notification.count.mockResolvedValue(0);

      await expect(service.markRead('user-1', 'someone-elses')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('savePushSubscription', () => {
    it('upserts on the endpoint so a re-subscribing browser never duplicates', async () => {
      await service.savePushSubscription('user-1', pushTarget, 'Firefox/142.0');

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: pushTarget.endpoint },
        create: { userId: 'user-1', userAgent: 'Firefox/142.0', ...pushTarget },
        update: { userId: 'user-1', userAgent: 'Firefox/142.0', ...pushTarget },
      });
    });
  });
});
