import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { EventShareState, EventShareType, NotificationType, Prisma } from '@prisma/client';
import type { WhatsAppTemplateVars } from '@basketeasy/types/whatsapp-reminder';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { WHATSAPP_REMINDER_QUEUE } from '../queue/queue.module';
import {
  changeRequestedNotification,
  describeShareSubject,
  shareRequestedNotification,
} from './whatsapp-notification-copy';

export const SEND_JOB = 'send';
export const NUDGE_JOB = 'nudge';
export const EXPIRE_JOB = 'expire';
export const SWEEP_JOB = 'sweep';
const SWEEP_SCHEDULER_ID = 'wa-sweep';

/** How often the sweep looks for shares whose job was lost. */
const SWEEP_EVERY_MS = 10 * 60 * 1000;
/** A send this far overdue means its job is gone, not merely late. */
const SWEEP_GRACE_MS = 2 * 60 * 1000;
const SWEEP_BATCH = 200;

// A DB or Redis blip in a handler must not drop the reminder: the handlers are
// idempotent (conditional writes), so a retry is safe.
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: true,
};

const NUDGE_DELAY_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export interface ShareJobData {
  shareId: string;
  /** Only on a grouped `nudge`: every prompt one call raised, `shareId` being the earliest. */
  shareIds?: string[];
  /** Only on `expire`: the kick-off the job was queued for, compared by `syncEvents`. */
  startsAt?: string;
}

// `:` is BullMQ's Redis key separator and recent versions reject it in a custom
// job id. Keyed on the share, not the event, so a later UPDATE or CANCELLATION
// share never collides with the reminder's jobs.
const jobId = (shareId: string, name: string) => `wa-${shareId}-${name}`;

type SyncEvent = {
  id: string;
  teamId: string;
  startsAt: Date;
  waReminderOverride: boolean | null;
  waOffsetMinutes: number | null;
};
type SyncTeam = { waReminderEnabled: boolean; waDefaultOffsetMinutes: number };
type SyncShare = {
  id: string;
  eventId: string | null;
  state: EventShareState;
  dueAt: Date | null;
};

// « Match contre X, sam. 4 oct. », from the live event or, once it is deleted,
// from the snapshot a CANCELLATION kept.
function promptSubject(share: {
  eventSnapshot: unknown;
  event: { type: 'TRAINING' | 'MATCH'; startsAt: Date; opponentName: string | null } | null;
  expiresAt: Date | null;
}): string {
  if (share.event) return describeShareSubject(share.event);
  const snapshot = (share.eventSnapshot ?? {}) as Partial<WhatsAppTemplateVars>;
  return `${snapshot.event_name ?? 'Événement'}, ${snapshot.event_date ?? ''}`.replace(/, $/, '');
}

// The share ids a notification's deep link names: `partages` for a grouped one,
// else the single `partage`.
function shareIdsOf(deepLink: string): string[] {
  const params = new URL(deepLink, 'http://kluvo.invalid').searchParams;
  const grouped = params.get('partages');
  if (grouped) return grouped.split(',').filter(Boolean);
  const single = params.get('partage');
  return single ? [single] : [];
}

/** `enabled = event.override ?? team.enabled`, `offset = event.offset ?? team.offset`. */
export function resolveSettings(
  event: { waReminderOverride: boolean | null; waOffsetMinutes: number | null },
  team: SyncTeam,
): { enabled: boolean; offsetMinutes: number } {
  return {
    enabled: event.waReminderOverride ?? team.waReminderEnabled,
    offsetMinutes: event.waOffsetMinutes ?? team.waDefaultOffsetMinutes,
  };
}

/**
 * Keeps the REMINDER `EventShare` row and the delayed jobs in step with what an
 * event's settings and kick-off say they should be. `syncEvents` is the one
 * reconcile entry point Events and the FFBB import call after a write; the
 * processor's `send`/`nudge`/`expire` re-read state before acting, so a job left
 * behind by a crash (Redis is not Postgres) is harmless: the job is a hint,
 * `EventShare` is the truth.
 */
@Injectable()
export class WhatsAppReminderScheduler implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @InjectQueue(WHATSAPP_REMINDER_QUEUE) private readonly queue: Queue<ShareJobData>,
  ) {}

  /**
   * Registers the repeatable sweep. A scheduling failure is logged and
   * swallowed, same policy as the retention sweep: an unreachable Redis must
   * not stop the API serving every other route.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        SWEEP_SCHEDULER_ID,
        { every: SWEEP_EVERY_MS },
        { name: SWEEP_JOB, data: { shareId: '' }, opts: { removeOnComplete: true } },
      );
    } catch (error) {
      this.logSyncFailure('sweep scheduling', error);
    }
  }

  /**
   * Acts on `EventShare`, the truth, when a delayed job was lost (Redis
   * failure while queueing, a job dropped after a handler error): sends that
   * are overdue and shares that outlived their event. Both handlers re-read
   * and write conditionally, so a sweep racing a live job is harmless.
   */
  async sweep(): Promise<void> {
    const now = new Date();
    const overdue = await this.prisma.eventShare.findMany({
      where: {
        state: EventShareState.SCHEDULED,
        dueAt: { lte: new Date(now.getTime() - SWEEP_GRACE_MS) },
        event: { startsAt: { gt: now } },
      },
      select: { id: true },
      take: SWEEP_BATCH,
    });
    const stale = await this.prisma.eventShare.findMany({
      where: {
        state: { in: [EventShareState.SCHEDULED, EventShareState.PENDING] },
        OR: [{ event: { startsAt: { lte: now } } }, { eventId: null, expiresAt: { lte: now } }],
      },
      select: { id: true },
      take: SWEEP_BATCH,
    });
    for (const { id } of overdue) {
      try {
        await this.send(id);
      } catch (error) {
        this.logSyncFailure(id, error);
      }
    }
    for (const { id } of stale) {
      try {
        await this.expire(id);
      } catch (error) {
        this.logSyncFailure(id, error);
      }
    }
  }

  /**
   * Best-effort by contract: a Redis failure is logged, never thrown, so it can
   * never turn a successful event write into a 500.
   */
  async syncEvents(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    try {
      const events = await this.prisma.event.findMany({
        where: { id: { in: eventIds } },
        select: {
          id: true,
          teamId: true,
          startsAt: true,
          waReminderOverride: true,
          waOffsetMinutes: true,
        },
      });
      if (events.length === 0) return;
      const teamIds = [...new Set(events.map((e) => e.teamId))];
      const [teams, shares] = await Promise.all([
        this.prisma.team.findMany({
          where: { id: { in: teamIds } },
          select: { id: true, waReminderEnabled: true, waDefaultOffsetMinutes: true },
        }),
        this.prisma.eventShare.findMany({
          where: { eventId: { in: events.map((e) => e.id) }, type: EventShareType.REMINDER },
          select: { id: true, eventId: true, state: true, dueAt: true },
        }),
      ]);
      const teamById = new Map(teams.map((t) => [t.id, t]));
      const shareByEvent = new Map(shares.map((s) => [s.eventId, s]));
      for (const event of events) {
        const team = teamById.get(event.teamId);
        if (!team) continue;
        try {
          await this.syncOne(event, team, shareByEvent.get(event.id) ?? null);
        } catch (error) {
          this.logSyncFailure(event.id, error);
        }
      }
    } catch (error) {
      this.logSyncFailure(eventIds.join(','), error);
    }
  }

  private logSyncFailure(what: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`WhatsApp reminder sync failed for ${what}: ${message}`);
  }

  private async syncOne(event: SyncEvent, team: SyncTeam, share: SyncShare | null): Promise<void> {
    const now = new Date();
    const { enabled, offsetMinutes } = resolveSettings(event, team);
    const dueAt = new Date(event.startsAt.getTime() - offsetMinutes * MINUTE_MS);
    const eventInFuture = event.startsAt > now;
    const state = share?.state ?? null;

    if (state === EventShareState.SENT || state === EventShareState.EXPIRED) return;

    if (state === EventShareState.SCHEDULED || state === EventShareState.PENDING) {
      if (!enabled) {
        await this.voidShare(share!);
        return;
      }
      if (!eventInFuture) return;
      if (state === EventShareState.PENDING && dueAt <= now) {
        // Rule 8: the offset changed after the push. No new push, state kept.
        await this.ensureExpire(share!.id, event.startsAt);
        return;
      }
      if (state === EventShareState.PENDING) {
        // Moved (or offset raised) so the reminder is not due yet: back to SCHEDULED.
        const { count } = await this.prisma.eventShare.updateMany({
          where: { id: share!.id, state: EventShareState.PENDING },
          data: {
            state: EventShareState.SCHEDULED,
            dueAt,
            firstNotifiedAt: null,
            nudgedAt: null,
          },
        });
        if (count === 0) return;
        await this.removeJobs(share!.id, [NUDGE_JOB]);
        await this.withdraw(share!.id);
        await this.queueSend(share!.id, dueAt);
        await this.ensureExpire(share!.id, event.startsAt);
        return;
      }
      // SCHEDULED
      if (dueAt <= now) {
        await this.notifyNow(share!.id, event);
        return;
      }
      if (share!.dueAt?.getTime() !== dueAt.getTime()) {
        await this.prisma.eventShare.updateMany({
          where: { id: share!.id, state: EventShareState.SCHEDULED },
          data: { dueAt },
        });
        await this.queueSend(share!.id, dueAt);
      }
      await this.ensureExpire(share!.id, event.startsAt);
      return;
    }

    // No row, or VOID.
    if (!enabled || !eventInFuture) return;

    // Conditional writes, not an upsert: `share` was read a moment ago, and a
    // concurrent confirm may have made it SENT since. Only a row that is still
    // VOID (or absent) may go back to SCHEDULED.
    const scheduled = {
      state: EventShareState.SCHEDULED,
      dueAt,
      firstNotifiedAt: null,
      nudgedAt: null,
    };
    let row: { id: string };
    if (share) {
      const { count } = await this.prisma.eventShare.updateMany({
        where: { id: share.id, state: EventShareState.VOID },
        data: scheduled,
      });
      if (count === 0) return;
      row = share;
    } else {
      try {
        row = await this.prisma.eventShare.create({
          data: {
            eventId: event.id,
            teamId: event.teamId,
            type: EventShareType.REMINDER,
            ...scheduled,
          },
          select: { id: true },
        });
      } catch (error) {
        // A concurrent sync created it first: it owns the scheduling.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
        throw error;
      }
    }
    if (dueAt > now) {
      await this.queueSend(row.id, dueAt);
      await this.ensureExpire(row.id, event.startsAt);
    } else {
      // Rule 9: an event created inside the window notifies immediately.
      await this.notifyNow(row.id, event);
    }
  }

  private async voidShare(share: SyncShare): Promise<void> {
    const { count } = await this.prisma.eventShare.updateMany({
      where: {
        id: share.id,
        state: { in: [EventShareState.SCHEDULED, EventShareState.PENDING] },
      },
      data: { state: EventShareState.VOID },
    });
    await this.removeJobs(share.id, [SEND_JOB, NUDGE_JOB, EXPIRE_JOB]);
    if (count > 0) await this.withdraw(share.id);
  }

  // SCHEDULED -> PENDING, notify, and queue the nudge. The conditional update is
  // what lets a racing confirm win.
  private async notifyNow(shareId: string, event: { startsAt: Date }): Promise<void> {
    const moved = await this.markPending(shareId);
    if (!moved) return;
    await this.notifyManagers(shareId, false);
    await this.queueNudge(shareId, event.startsAt);
    await this.ensureExpire(shareId, event.startsAt);
  }

  private async markPending(shareId: string): Promise<boolean> {
    const { count } = await this.prisma.eventShare.updateMany({
      where: { id: shareId, state: EventShareState.SCHEDULED },
      data: { state: EventShareState.PENDING, firstNotifiedAt: new Date() },
    });
    return count > 0;
  }

  /** `send` job: only a SCHEDULED share of a future event whose reminder is still on. */
  async send(shareId: string): Promise<void> {
    const share = await this.loadShareForJob(shareId);
    if (!share || share.state !== EventShareState.SCHEDULED) return;
    const { event } = share;
    // Only a REMINDER is ever SCHEDULED, and it always has its event.
    if (!event || event.startsAt <= new Date()) return;
    if (!resolveSettings(event, event.team).enabled) return;
    await this.notifyNow(shareId, event);
  }

  /** `nudge` job: once, only while nobody has shared. */
  async nudge(shareId: string, shareIds?: string[]): Promise<void> {
    if (shareIds && shareIds.length > 1) return this.nudgeGroup(shareIds);
    const share = await this.loadShareForJob(shareId);
    if (!share || share.state !== EventShareState.PENDING || share.nudgedAt) return;
    // A CANCELLATION has no event any more: its own expiry is the deleted event's kick-off.
    const endsAt = share.event?.startsAt ?? share.expiresAt;
    if (!endsAt || endsAt <= new Date()) return;
    const { count } = await this.prisma.eventShare.updateMany({
      where: { id: shareId, state: EventShareState.PENDING, nudgedAt: null },
      data: { nudgedAt: new Date() },
    });
    if (count === 0) return;
    await this.notifyManagers(shareId, true);
  }

  // One nudge for a whole call's prompts, for those still PENDING and unnudged.
  private async nudgeGroup(shareIds: string[]): Promise<void> {
    const now = new Date();
    const shares = await this.prisma.eventShare.findMany({
      where: { id: { in: shareIds }, state: EventShareState.PENDING, nudgedAt: null },
      select: {
        id: true,
        type: true,
        teamId: true,
        eventId: true,
        expiresAt: true,
        eventSnapshot: true,
        event: { select: { type: true, startsAt: true, opponentName: true } },
      },
    });
    const live = shares.filter((share) => {
      const endsAt = share.event?.startsAt ?? share.expiresAt;
      return endsAt && endsAt > now && share.type !== EventShareType.REMINDER;
    });
    if (live.length === 0) return;
    const { count } = await this.prisma.eventShare.updateMany({
      where: {
        id: { in: live.map((share) => share.id) },
        state: EventShareState.PENDING,
        nudgedAt: null,
      },
      data: { nudgedAt: now },
    });
    if (count === 0) return;
    await this.notifyChangePrompts(
      live[0].teamId,
      live[0].type as 'UPDATE' | 'CANCELLATION',
      live.map((share) => ({
        shareId: share.id,
        eventId: share.eventId,
        startsAt: share.event?.startsAt ?? share.expiresAt ?? now,
        subject: promptSubject(share),
      })),
      true,
    );
  }

  /** `expire` job: the event started without a share. */
  async expire(shareId: string): Promise<void> {
    // The job carries the kick-off it was queued for; the event may have moved
    // since. Only the current kick-off decides (a CANCELLATION has no event:
    // its own expiry is the deleted event's kick-off).
    const share = await this.loadShareForJob(shareId);
    if (!share) return;
    const endsAt = share.event?.startsAt ?? share.expiresAt;
    if (endsAt && endsAt > new Date()) return;
    const { count } = await this.prisma.eventShare.updateMany({
      where: {
        id: shareId,
        state: { in: [EventShareState.SCHEDULED, EventShareState.PENDING] },
      },
      data: { state: EventShareState.EXPIRED },
    });
    if (count > 0) await this.withdraw(shareId);
  }

  /** Called by `confirmShare` once a manager has really shared: clears everyone's bell. */
  async onShared(shareId: string): Promise<void> {
    await this.withdraw(shareId);
    try {
      await this.removeJobs(shareId, [SEND_JOB, NUDGE_JOB, EXPIRE_JOB]);
    } catch (error) {
      this.logSyncFailure(shareId, error);
    }
  }

  private loadShareForJob(shareId: string) {
    return this.prisma.eventShare.findUnique({
      where: { id: shareId },
      select: {
        id: true,
        state: true,
        nudgedAt: true,
        expiresAt: true,
        event: {
          select: {
            id: true,
            teamId: true,
            type: true,
            startsAt: true,
            opponentName: true,
            waReminderOverride: true,
            waOffsetMinutes: true,
            team: { select: { waReminderEnabled: true, waDefaultOffsetMinutes: true } },
          },
        },
      },
    });
  }

  // Notification.readAt on every manager's unread row that names this share.
  // A grouped notification (a series edit or delete) links the earliest prompt
  // in `partage` and lists all of them in `partages`, so sharing any one of them
  // finds it, and it is only cleared once none of its prompts is still PENDING.
  async withdraw(shareId: string): Promise<void> {
    const rows = await this.prisma.notification.findMany({
      where: {
        type: NotificationType.WHATSAPP_SHARE_REQUESTED,
        readAt: null,
        deepLink: { contains: shareId },
      },
      select: { id: true, deepLink: true },
    });
    if (rows.length === 0) return;
    // `contains` is a substring match: keep only rows that name this exact id.
    const groups = rows
      .map((row) => ({ id: row.id, shareIds: shareIdsOf(row.deepLink ?? '') }))
      .filter((group) => group.shareIds.includes(shareId));
    const others = [...new Set(groups.flatMap((g) => g.shareIds))].filter((id) => id !== shareId);
    const pending = new Set<string>(
      others.length === 0
        ? []
        : (
            await this.prisma.eventShare.findMany({
              where: { id: { in: others }, state: EventShareState.PENDING },
              select: { id: true },
            })
          ).map((share) => share.id),
    );
    const clear = groups
      .filter((g) => !g.shareIds.some((id) => id !== shareId && pending.has(id)))
      .map((g) => g.id);
    if (clear.length === 0) return;
    await this.prisma.notification.updateMany({
      where: { id: { in: clear } },
      data: { readAt: new Date() },
    });
  }

  // A share's own notification: the first ask, or the nudge an hour later.
  private async notifyManagers(shareId: string, isNudge: boolean): Promise<void> {
    const share = await this.prisma.eventShare.findUnique({
      where: { id: shareId },
      select: {
        id: true,
        type: true,
        teamId: true,
        eventId: true,
        expiresAt: true,
        eventSnapshot: true,
        event: {
          select: { id: true, teamId: true, type: true, startsAt: true, opponentName: true },
        },
      },
    });
    if (!share) return;
    if (share.type === EventShareType.REMINDER) {
      if (!share.event) return;
      const recipients = await this.resolveManagers(share.teamId);
      if (recipients.length === 0) return;
      const copy = shareRequestedNotification(share.event, isNudge);
      const { id: eventId } = share.event;
      await this.notifications.notify(
        recipients.map(({ userId, clubId }) => ({
          userId,
          type: NotificationType.WHATSAPP_SHARE_REQUESTED,
          title: copy.title,
          body: copy.body,
          deepLink: `/clubs/${clubId}/teams/${share.teamId}/events/${eventId}?partage=${shareId}`,
        })),
      );
      return;
    }
    await this.notifyChangePrompts(
      share.teamId,
      share.type,
      [
        {
          shareId,
          eventId: share.eventId,
          startsAt: share.event?.startsAt ?? share.expiresAt ?? new Date(),
          subject: promptSubject(share),
        },
      ],
      isNudge,
    );
  }

  /**
   * One notification per manager for a whole call, however many prompts it
   * raised (a series edit or delete can cover up to 104 occurrences): it names
   * one, or counts several and links to the earliest. The acting manager is
   * included on purpose: the bell is also the to-do list.
   *
   * An UPDATE links to its event; a CANCELLATION to the team page, since the
   * event page would 404.
   */
  async notifyChangePrompts(
    teamId: string,
    kind: 'UPDATE' | 'CANCELLATION',
    prompts: Array<{ shareId: string; eventId: string | null; startsAt: Date; subject: string }>,
    isNudge = false,
  ): Promise<void> {
    if (prompts.length === 0) return;
    const recipients = await this.resolveManagers(teamId);
    if (recipients.length === 0) return;
    const earliest = [...prompts].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    const partage =
      prompts.length > 1
        ? `partage=${earliest.shareId}&partages=${prompts.map((p) => p.shareId).join(',')}`
        : `partage=${earliest.shareId}`;
    const copy = changeRequestedNotification(
      kind,
      prompts.map((p) => p.subject),
      isNudge,
    );
    await this.notifications.notify(
      recipients.map(({ userId, clubId }) => ({
        userId,
        type: NotificationType.WHATSAPP_SHARE_REQUESTED,
        title: copy.title,
        body: copy.body,
        deepLink:
          kind === 'UPDATE' && earliest.eventId
            ? `/clubs/${clubId}/teams/${teamId}/events/${earliest.eventId}?${partage}`
            : `/clubs/${clubId}/teams/${teamId}?${partage}`,
      })),
    );
  }

  /**
   * For the prompts one call raised: each one's expiry at its own kick-off, and
   * ONE nudge an hour later carrying all of them, so a series change nudges
   * once like it notified once.
   */
  async queueFollowUps(prompts: Array<{ shareId: string; startsAt: Date }>): Promise<void> {
    if (prompts.length === 0) return;
    const earliest = [...prompts].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    try {
      await this.queueNudge(
        earliest.shareId,
        earliest.startsAt,
        prompts.map((p) => p.shareId),
      );
    } catch (error) {
      this.logSyncFailure(earliest.shareId, error);
    }
    for (const prompt of prompts) {
      try {
        await this.ensureExpire(prompt.shareId, prompt.startsAt);
      } catch (error) {
        this.logSyncFailure(prompt.shareId, error);
      }
    }
  }

  /** Drops the jobs of shares that are going away, and clears their bells. */
  async discard(shareIds: string[]): Promise<void> {
    for (const shareId of shareIds) {
      try {
        await this.removeJobs(shareId, [SEND_JOB, NUDGE_JOB, EXPIRE_JOB]);
        await this.withdraw(shareId);
      } catch (error) {
        this.logSyncFailure(shareId, error);
      }
    }
  }

  /**
   * TeamAdmins of the team plus club ADMINs of every linked club, deduplicated
   * by user, in two reads. The deep link's club is one the manager is an ADMIN
   * of, else any linked club they belong to (a ClubRolesGuard 403 on click-through
   * is the alternative), else the owner-first first linked club.
   */
  async resolveManagers(teamId: string): Promise<Array<{ userId: string; clubId: string }>> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        clubTeams: { orderBy: { isOwner: 'desc' }, select: { clubId: true } },
        teamAdmins: { select: { userId: true } },
      },
    });
    if (!team || team.clubTeams.length === 0) return [];
    const clubIds = team.clubTeams.map((ct) => ct.clubId);
    const teamAdminIds = team.teamAdmins.map((a) => a.userId);
    const memberships = await this.prisma.clubMembership.findMany({
      where: {
        clubId: { in: clubIds },
        OR: [{ role: 'ADMIN' }, { userId: { in: teamAdminIds } }],
      },
      select: { userId: true, clubId: true, role: true },
    });

    const clubOrder = new Map(clubIds.map((id, index) => [id, index]));
    const best = new Map<string, { clubId: string; isAdmin: boolean }>();
    const consider = (userId: string, clubId: string, isAdmin: boolean) => {
      const current = best.get(userId);
      const better =
        !current ||
        (isAdmin && !current.isAdmin) ||
        (isAdmin === current.isAdmin &&
          (clubOrder.get(clubId) ?? 0) < (clubOrder.get(current.clubId) ?? 0));
      if (better) best.set(userId, { clubId, isAdmin });
    };
    for (const m of memberships) consider(m.userId, m.clubId, m.role === 'ADMIN');
    // A TeamAdmin with no membership in a linked club is still a manager.
    for (const userId of teamAdminIds) {
      if (!best.has(userId)) best.set(userId, { clubId: clubIds[0], isAdmin: false });
    }
    return [...best.entries()].map(([userId, { clubId }]) => ({ userId, clubId }));
  }

  private async queueSend(shareId: string, dueAt: Date): Promise<void> {
    await this.queue.remove(jobId(shareId, SEND_JOB));
    await this.queue.add(
      SEND_JOB,
      { shareId },
      {
        jobId: jobId(shareId, SEND_JOB),
        delay: Math.max(0, dueAt.getTime() - Date.now()),
        ...JOB_OPTIONS,
      },
    );
  }

  private async queueNudge(shareId: string, startsAt: Date, shareIds?: string[]): Promise<void> {
    // No nudge when it would land in the last hour before kick-off.
    if (Date.now() + NUDGE_DELAY_MS >= startsAt.getTime()) return;
    await this.queue.remove(jobId(shareId, NUDGE_JOB));
    await this.queue.add(
      NUDGE_JOB,
      shareIds && shareIds.length > 1 ? { shareId, shareIds } : { shareId },
      {
        jobId: jobId(shareId, NUDGE_JOB),
        delay: NUDGE_DELAY_MS,
        ...JOB_OPTIONS,
      },
    );
  }

  // The expire job carries the kick-off it was queued for, so a moved event is
  // noticed by comparing rather than by re-adding on every sync.
  async ensureExpire(shareId: string, startsAt: Date): Promise<void> {
    const existing = await this.queue.getJob(jobId(shareId, EXPIRE_JOB));
    if (existing?.data.startsAt === startsAt.toISOString()) return;
    if (existing) await this.queue.remove(jobId(shareId, EXPIRE_JOB));
    await this.queue.add(
      EXPIRE_JOB,
      { shareId, startsAt: startsAt.toISOString() },
      {
        jobId: jobId(shareId, EXPIRE_JOB),
        delay: Math.max(0, startsAt.getTime() - Date.now()),
        ...JOB_OPTIONS,
      },
    );
  }

  private async removeJobs(shareId: string, names: string[]): Promise<void> {
    await Promise.all(names.map((name) => this.queue.remove(jobId(shareId, name))));
  }
}
