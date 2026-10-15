import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { NotificationType, Prisma } from '@prisma/client';
import type { AppNotification, NotificationList } from '@basketeasy/types/notifications';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PUSH_CLIENT, PushSubscriptionGoneError, type PushClient } from './push-client';

// Cap on one page of the notification list. The bell shows the most recent
// handful and /notifications shows a longer run; neither paginates yet, so
// this is the ceiling rather than a page size to tune.
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  /** A finished French sentence — rendered verbatim in-app, in e-mail and in push. */
  title: string;
  body?: string | null;
  /** Frontend-relative path, never an absolute URL. See the Notification model. */
  deepLink?: string | null;
  /** The child a guardian is told about (« Léo »); null or absent when it's the reader. */
  subjectFirstName?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(PUSH_CLIENT) private readonly push: PushClient,
  ) {}

  /**
   * Writes the in-app rows, then fans the same payload out to e-mail and web
   * push.
   *
   * Two rules hold here and are the reason this is one method rather than
   * three call sites:
   *
   * 1. **The in-app row is the source of truth and is written synchronously.**
   *    A convocation that exists in the database but was never e-mailed is a
   *    degraded notification; one that was e-mailed but never stored is a
   *    notification the user can't find again.
   * 2. **Delivery is best-effort and never fails the caller.** Every emitter
   *    calls this as a side effect of a mutation the user asked for
   *    (convoking a roster, deleting an event). A bounced address or a dead
   *    push service must not roll that back.
   *
   * Recipients are resolved in one query regardless of how many are being
   * notified, and push targets in one more — no per-recipient round trip.
   */
  async notify(inputs: NotifyInput[]): Promise<void> {
    if (inputs.length === 0) return;

    await this.prisma.notification.createMany({
      data: inputs.map((input) => ({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        deepLink: input.deepLink ?? null,
        subjectFirstName: input.subjectFirstName ?? null,
      })),
    });

    // Fire-and-forget: `notify` is awaited by its emitters only so the rows
    // are committed before the response returns; the outbound delivery is
    // explicitly not part of that wait.
    void this.deliver(inputs).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Notification delivery failed: ${message}`);
    });
  }

  private async deliver(inputs: NotifyInput[]): Promise<void> {
    const userIds = [...new Set(inputs.map((input) => input.userId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        emailNotificationsEnabled: true,
        pushSubscriptions: { select: { endpoint: true, p256dh: true, auth: true } },
      },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));

    for (const input of inputs) {
      const user = usersById.get(input.userId);
      if (!user) continue;

      const payload = {
        title: input.title,
        body: input.body ?? null,
        deepLink: input.deepLink ?? null,
      };

      if (user.emailNotificationsEnabled) {
        this.mail.sendAndForget(
          () => this.mail.sendNotificationEmail(user.email, payload),
          `notification e-mail to ${user.email}`,
        );
      }

      for (const subscription of user.pushSubscriptions) {
        await this.sendPush(subscription, {
          title: payload.title,
          body: payload.body,
          url: payload.deepLink ? this.mail.absoluteUrl(payload.deepLink) : null,
        });
      }
    }
  }

  private async sendPush(
    target: { endpoint: string; p256dh: string; auth: string },
    payload: { title: string; body: string | null; url: string | null },
  ): Promise<void> {
    try {
      await this.push.send(target, payload);
    } catch (err) {
      if (err instanceof PushSubscriptionGoneError) {
        // The browser is gone for good — drop the row rather than retrying
        // it on every future notification.
        await this.prisma.pushSubscription
          .deleteMany({ where: { endpoint: err.endpoint } })
          .catch(() => undefined);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Push to ${target.endpoint} failed: ${message}`);
    }
  }

  async list(
    userId: string,
    options: { limit?: number; before?: string } = {},
  ): Promise<NotificationList> {
    const take = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(options.before ? { createdAt: { lt: new Date(options.before) } } : {}),
    };

    // The unread count spans the whole account, not the returned page: the
    // bell's badge has to stay right even when the list is truncated.
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { items: rows.map(toAppNotification), unreadCount };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    // updateMany scoped by userId, not a plain update by id: it makes
    // "someone else's notification" a no-op match rather than a row this
    // caller could flip, without a second read to check ownership first.
    const updated = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (updated.count === 0) {
      // Already read is the common, harmless case — distinguish it from a
      // notification that isn't this user's (or doesn't exist) so a stale
      // client doesn't get a 404 for double-clicking.
      const exists = await this.prisma.notification.count({
        where: { id: notificationId, userId },
      });
      if (exists === 0) {
        throw new NotFoundException('Notification introuvable');
      }
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  getPushPublicKey(): string | null {
    return this.push.getPublicKey();
  }

  /**
   * Upsert on `endpoint` (its unique key): a browser that re-subscribes after
   * clearing its data, or a user signing in on a shared machine, replaces the
   * row rather than leaving a duplicate addressed to the previous owner.
   */
  async savePushSubscription(
    userId: string,
    subscription: { endpoint: string; p256dh: string; auth: string },
    userAgent?: string,
  ): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: { userId, userAgent: userAgent ?? null, ...subscription },
      update: { userId, userAgent: userAgent ?? null, ...subscription },
    });
  }

  async deletePushSubscription(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }
}

function toAppNotification(row: {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  deepLink: string | null;
  subjectFirstName: string | null;
  readAt: Date | null;
  createdAt: Date;
}): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    deepLink: row.deepLink,
    subjectFirstName: row.subjectFirstName,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
