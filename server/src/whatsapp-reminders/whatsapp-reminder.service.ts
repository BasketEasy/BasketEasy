import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { EventShareState, EventShareType, Prisma, type EventSharePlatform } from '@prisma/client';
import {
  DEFAULT_TEMPLATES,
  GUEST_LINK_DISABLED_CODE,
  WA_SHARE_CLOSED_CODE,
  WHATSAPP_TEMPLATE_ERROR_MESSAGES,
  contentKey,
  renderTemplate,
  validateTemplate,
  type EventShareChange,
  type EventShareStatus,
  type EventWhatsAppShare,
  type TeamPendingCancellation,
  type TeamWhatsAppSettings,
  type UpdateTeamWhatsAppSettingsRequest,
  type UpdateTeamWhatsAppSettingsResponse,
  type WhatsAppTemplateVars,
} from '@basketeasy/types/whatsapp-reminder';
import { PrismaService } from '../prisma/prisma.service';
import { toRsvpRespondent, RSVP_RESPONDENT_SELECT } from '../common/rsvp-respondent';
import { GuestLinksService } from '../guest-links/guest-links.service';
import { MeetingChangeFeed } from '../meeting-points/meeting-change-feed';
import { MeetingPointsService } from '../meeting-points/meeting-points.service';
import { describeShareSubject } from './whatsapp-notification-copy';
import { WhatsAppReminderScheduler } from './whatsapp-reminder.scheduler';
import { buildTemplateVars, diffVars, toSnapshot } from './whatsapp-template-vars';

// The Team column holding each share type's template; null means the default.
const TEMPLATE_COLUMNS = {
  REMINDER: 'waReminderTemplate',
  UPDATE: 'waUpdateTemplate',
  CANCELLATION: 'waCancellationTemplate',
} as const satisfies Record<EventShareType, keyof Prisma.TeamUpdateInput>;

const REQUEST_FIELDS = {
  REMINDER: 'reminderTemplate',
  UPDATE: 'updateTemplate',
  CANCELLATION: 'cancellationTemplate',
} as const satisfies Record<EventShareType, keyof UpdateTeamWhatsAppSettingsRequest>;

const MESSAGE_TYPES = [EventShareType.REMINDER, EventShareType.UPDATE];

/** What a cancellation prompt needs once its event row is gone. */
export interface CancellationPrompt {
  shareId: string;
  startsAt: Date;
  subject: string;
}

/** What `prepareCancellations` decided inside the delete's transaction, for `afterCancellations`. */
export interface PreparedCancellations {
  created: CancellationPrompt[];
  discardedShareIds: string[];
}

@Injectable()
export class WhatsAppReminderService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly guestLinks: GuestLinksService,
    private readonly meetingPoints: MeetingPointsService,
    private readonly scheduler: WhatsAppReminderScheduler,
    private readonly meetingChanges: MeetingChangeFeed,
  ) {}

  // The RDV changes inside meeting-points/, which must not import this module:
  // it publishes on a feed and this end subscribes.
  onModuleInit(): void {
    this.meetingChanges.subscribe((eventIds) => {
      void this.onEventsChanged(eventIds);
    });
  }

  /** Events and the FFBB import call this after a write; see WhatsAppReminderScheduler. */
  syncEvents(eventIds: string[]): Promise<void> {
    return this.scheduler.syncEvents(eventIds);
  }

  /** Idempotent and already audited: a second call for a live link writes nothing. */
  async ensureGuestLink(clubId: string, teamId: string, userId: string): Promise<void> {
    await this.guestLinks.enable(clubId, teamId, userId);
  }

  async getTeamSettings(clubId: string, teamId: string): Promise<TeamWhatsAppSettings> {
    await this.assertTeamInClub(clubId, teamId);
    return this.readTeamSettings(teamId);
  }

  private async readTeamSettings(teamId: string): Promise<TeamWhatsAppSettings> {
    const [team, managers] = await Promise.all([
      this.prisma.team.findUniqueOrThrow({
        where: { id: teamId },
        select: {
          waReminderTemplate: true,
          waUpdateTemplate: true,
          waCancellationTemplate: true,
          waReminderEnabled: true,
          waDefaultOffsetMinutes: true,
        },
      }),
      this.scheduler.resolveManagers(teamId),
    ]);
    // Rule 6: nobody who could hear the reminder. The in-app row is still
    // written; the settings card warns.
    const reachable =
      managers.length === 0
        ? 0
        : await this.prisma.user.count({
            where: {
              id: { in: managers.map((m) => m.userId) },
              OR: [{ emailNotificationsEnabled: true }, { pushSubscriptions: { some: {} } }],
            },
          });
    return {
      reminderTemplate: team.waReminderTemplate,
      updateTemplate: team.waUpdateTemplate,
      cancellationTemplate: team.waCancellationTemplate,
      reminderEnabled: team.waReminderEnabled,
      defaultOffsetMinutes: team.waDefaultOffsetMinutes,
      hasReachableManager: reachable > 0,
    };
  }

  async updateTeamSettings(
    clubId: string,
    teamId: string,
    dto: UpdateTeamWhatsAppSettingsRequest,
    userId: string,
  ): Promise<UpdateTeamWhatsAppSettingsResponse> {
    await this.assertTeamInClub(clubId, teamId);
    const data: Prisma.TeamUpdateInput = {};

    for (const type of Object.values(EventShareType)) {
      const value = dto[REQUEST_FIELDS[type]];
      if (value === undefined) continue;
      // An empty string or the default itself is stored as null, so improving
      // the default reaches every team that never customised it.
      const template = value?.trim() ? value : null;
      if (template !== null) {
        const result = validateTemplate(template, type);
        if (!result.ok) {
          throw new BadRequestException({
            message: WHATSAPP_TEMPLATE_ERROR_MESSAGES[result.code],
            code: result.code,
            variable: result.variable,
          });
        }
      }
      data[TEMPLATE_COLUMNS[type]] = template === DEFAULT_TEMPLATES[type] ? null : template;
    }
    if (dto.reminderEnabled !== undefined) data.waReminderEnabled = dto.reminderEnabled;
    if (dto.defaultOffsetMinutes !== undefined)
      data.waDefaultOffsetMinutes = dto.defaultOffsetMinutes;

    // Rule 7: a reminder needs a link to carry, so switching it on switches the
    // guest link on too (idempotent, and audited as any enable is).
    let guestLinkEnabled = false;
    if (dto.reminderEnabled === true) {
      guestLinkEnabled = (await this.guestLinks.get(clubId, teamId)) === null;
      await this.guestLinks.enable(clubId, teamId, userId);
    }

    await this.prisma.team.update({ where: { id: teamId }, data });

    if (dto.reminderEnabled !== undefined || dto.defaultOffsetMinutes !== undefined) {
      const upcoming = await this.prisma.event.findMany({
        where: { teamId, startsAt: { gt: new Date() } },
        select: { id: true },
      });
      await this.scheduler.syncEvents(upcoming.map((e) => e.id));
    }
    return { ...(await this.readTeamSettings(teamId)), guestLinkEnabled };
  }

  // Read-only: an absent row is `NOT_SENT`, never created here. The UPDATE
  // share only appears once one has been raised.
  async getEventShare(
    clubId: string,
    teamId: string,
    eventId: string,
    callerId: string,
  ): Promise<EventWhatsAppShare> {
    const { event, vars, templates } = await this.loadShareContext(clubId, teamId, eventId);
    const rows = await this.prisma.eventShare.findMany({
      where: { eventId: event.id, type: { in: MESSAGE_TYPES } },
      include: { sentBy: RSVP_RESPONDENT_SELECT },
    });
    const reference = newestSent(rows);
    const types = MESSAGE_TYPES.filter(
      (type) => type === EventShareType.REMINDER || rows.some((r) => r.type === type),
    );
    const shares = types.map((type) => {
      const row = rows.find((r) => r.type === type);
      const status: EventShareStatus = row
        ? toStatus(row, callerId)
        : { type, state: 'NOT_SENT', dueAt: null, sentAt: null, sentBy: null, platform: null };
      // What moved is only worth saying for an update still waiting to be sent.
      const changes: EventShareChange[] =
        vars &&
        type === EventShareType.UPDATE &&
        row?.state === EventShareState.PENDING &&
        reference
          ? diffVars(asVars(reference.sentVars), vars)
          : [];
      return {
        ...status,
        message: vars ? renderTemplate(templates[type], vars) : null,
        changes,
      };
    });
    return { guestLinkActive: vars !== null, shares };
  }

  async confirmShare(
    clubId: string,
    teamId: string,
    eventId: string,
    type: EventShareType,
    userId: string,
    platform: EventSharePlatform,
  ): Promise<EventShareStatus> {
    if (type === EventShareType.CANCELLATION) {
      // The event is gone by then: a cancellation is confirmed by its share id.
      throw new BadRequestException('Une annulation se confirme depuis la page de l’équipe');
    }
    const { event, vars } = await this.loadShareContext(clubId, teamId, eventId);
    if (event.startsAt <= new Date()) {
      throw new ConflictException({
        message: 'Cet événement a déjà commencé',
        code: WA_SHARE_CLOSED_CODE,
      });
    }
    if (!vars) {
      throw new ConflictException({
        message: 'Le lien de réponse est désactivé',
        code: GUEST_LINK_DISABLED_CODE,
      });
    }

    // First writer wins. A row that doesn't exist yet is created SENT; one that
    // does (SCHEDULED, PENDING, VOID, EXPIRED) is moved to SENT only if nobody
    // got there first. The loser is a success, not an error: both admins really
    // did send it, and it reads back the first writer's status.
    const sent = {
      state: EventShareState.SENT,
      sentAt: new Date(),
      sentByUserId: userId,
      platform,
      // What the group is about to read: the next comparison, and the next
      // « what moved » line, run against this.
      sentContentKey: contentKey(vars),
      sentVars: toSnapshot(vars) as Prisma.InputJsonValue,
    };
    let won = false;
    try {
      await this.prisma.eventShare.create({ data: { eventId, teamId, type, ...sent } });
      won = true;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
      const { count } = await this.prisma.eventShare.updateMany({
        where: { eventId, type, state: { not: EventShareState.SENT } },
        data: sent,
      });
      won = count > 0;
    }
    const row = await this.prisma.eventShare.findUniqueOrThrow({
      where: { eventId_type: { eventId, type } },
      include: { sentBy: RSVP_RESPONDENT_SELECT },
    });
    // Once anyone has shared, the other managers' bells clear.
    if (won) await this.scheduler.onShared(row.id);
    return toStatus(row, userId);
  }

  /**
   * Cancellations still worth sharing, rendered from their snapshot: the event
   * is gone, so this is the only place they can be found. Read-only.
   */
  async listPendingCancellations(
    clubId: string,
    teamId: string,
    callerId: string,
  ): Promise<TeamPendingCancellation[]> {
    await this.assertTeamInClub(clubId, teamId);
    const [rows, team, url] = await Promise.all([
      this.prisma.eventShare.findMany({
        where: {
          teamId,
          type: EventShareType.CANCELLATION,
          state: { in: [EventShareState.PENDING, EventShareState.SENT] },
          expiresAt: { gt: new Date() },
        },
        orderBy: { expiresAt: 'asc' },
        include: { sentBy: RSVP_RESPONDENT_SELECT },
      }),
      this.prisma.team.findUniqueOrThrow({
        where: { id: teamId },
        select: { waCancellationTemplate: true },
      }),
      this.guestLinks.urlForTeam(teamId),
    ]);
    const template = team.waCancellationTemplate ?? DEFAULT_TEMPLATES.CANCELLATION;
    return rows.map((row) => {
      const snapshot = asVars(row.eventSnapshot);
      // The link is optional in a cancellation: with the guest link off the
      // line carrying it simply drops.
      const vars = { ...snapshot, link: url ? `${url}?src=wa` : null } as WhatsAppTemplateVars;
      return {
        shareId: row.id,
        eventName: snapshot.event_name ?? 'Événement',
        eventDate: snapshot.event_date ?? '',
        message: renderTemplate(template, vars),
        status: toStatus(row, callerId),
      };
    });
  }

  /** Confirms a cancellation by its share id: its event no longer exists. */
  async confirmCancellation(
    clubId: string,
    teamId: string,
    shareId: string,
    userId: string,
    platform: EventSharePlatform,
  ): Promise<EventShareStatus> {
    await this.assertTeamInClub(clubId, teamId);
    // Re-verify the share belongs to the route's team before any write.
    const share = await this.prisma.eventShare.findFirst({
      where: { id: shareId, teamId, type: EventShareType.CANCELLATION },
      select: { id: true, expiresAt: true },
    });
    if (!share) throw new NotFoundException('Partage introuvable');
    if (!share.expiresAt || share.expiresAt <= new Date()) {
      throw new ConflictException({
        message: 'Cet événement aurait déjà commencé',
        code: WA_SHARE_CLOSED_CODE,
      });
    }
    const { count } = await this.prisma.eventShare.updateMany({
      where: { id: shareId, state: { not: EventShareState.SENT } },
      data: {
        state: EventShareState.SENT,
        sentAt: new Date(),
        sentByUserId: userId,
        platform,
      },
    });
    const row = await this.prisma.eventShare.findUniqueOrThrow({
      where: { id: shareId },
      include: { sentBy: RSVP_RESPONDENT_SELECT },
    });
    if (count > 0) await this.scheduler.onShared(shareId);
    return toStatus(row, userId);
  }

  /**
   * After a write that can change what a shared message says: ask managers to
   * share an update for every event whose current message differs from the one
   * the group last read. Best-effort, like every notification: it logs and
   * swallows its own failures.
   */
  async onEventsChanged(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    try {
      await this.detectChanges(eventIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`WhatsApp update detection failed: ${message}`);
    }
  }

  private async detectChanges(eventIds: string[]): Promise<void> {
    const events = await this.prisma.event.findMany({
      where: { id: { in: eventIds }, startsAt: { gt: new Date() } },
      select: {
        id: true,
        teamId: true,
        type: true,
        startsAt: true,
        timeConfirmed: true,
        location: true,
        opponentName: true,
      },
    });
    if (events.length === 0) return;
    const shares = await this.prisma.eventShare.findMany({
      where: { eventId: { in: events.map((e) => e.id) }, type: { in: MESSAGE_TYPES } },
    });

    for (const teamId of new Set(events.map((e) => e.teamId))) {
      const teamEvents = events.filter((e) => e.teamId === teamId);
      const [team, url, plans] = await Promise.all([
        this.prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { name: true } }),
        this.guestLinks.urlForTeam(teamId),
        this.meetingPoints.resolvePlans(teamId, teamEvents),
      ]);
      const raised: Array<{ shareId: string; eventId: string; startsAt: Date; subject: string }> =
        [];

      for (const event of teamEvents) {
        const rows = shares.filter((s) => s.eventId === event.id);
        // What the group last read. Nothing sent means nothing to correct: a
        // still-scheduled reminder renders the new details when it is shared.
        const reference = newestSent(rows);
        if (!reference) continue;
        const update = rows.find((r) => r.type === EventShareType.UPDATE) ?? null;
        const vars = buildTemplateVars(event, team.name, plans.get(event.id) ?? null, url);
        const changed = contentKey(vars) !== reference.sentContentKey;

        if (!changed) {
          // An edit reverted: the group already has this, so a pending update
          // asks for something that no longer exists.
          if (update?.state === EventShareState.PENDING) await this.voidUpdate(update.id);
          continue;
        }
        if (update?.state === EventShareState.PENDING) continue; // its message renders fresh

        const shareId = await this.raiseUpdate(event, update?.id ?? null);
        if (shareId) {
          raised.push({
            shareId,
            eventId: event.id,
            startsAt: event.startsAt,
            subject: describeShareSubject(event),
          });
        }
      }

      await this.scheduler.notifyChangePrompts(teamId, 'UPDATE', raised);
      await this.scheduler.queueFollowUps(raised);
    }
  }

  // Creates the UPDATE prompt, or resets one that was already shared or dropped:
  // a second edit after a shared update is a new message to send. What the group
  // last read (sentAt, sentContentKey, sentVars) stays, as the next comparison's
  // baseline. Null when a concurrent writer got there first.
  private async raiseUpdate(
    event: { id: string; teamId: string },
    existingId: string | null,
  ): Promise<string | null> {
    const now = new Date();
    if (existingId === null) {
      try {
        const created = await this.prisma.eventShare.create({
          data: {
            eventId: event.id,
            teamId: event.teamId,
            type: EventShareType.UPDATE,
            state: EventShareState.PENDING,
            firstNotifiedAt: now,
          },
          select: { id: true },
        });
        return created.id;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return null;
        }
        throw error;
      }
    }
    const { count } = await this.prisma.eventShare.updateMany({
      where: { id: existingId, state: { not: EventShareState.PENDING } },
      data: {
        state: EventShareState.PENDING,
        firstNotifiedAt: now,
        nudgedAt: null,
        sentByUserId: null,
        platform: null,
      },
    });
    return count > 0 ? existingId : null;
  }

  private async voidUpdate(shareId: string): Promise<void> {
    const { count } = await this.prisma.eventShare.updateMany({
      where: { id: shareId, state: EventShareState.PENDING },
      data: { state: EventShareState.VOID },
    });
    if (count > 0) await this.scheduler.discard([shareId]);
  }

  /**
   * Inside `deleteEvent`'s transaction, before the rows go: a CANCELLATION share
   * for each event the group was told about, holding a snapshot of what it said,
   * and no reminder or update left behind (with `SetNull` they would survive
   * the delete as orphans). Cancelling an event deletes it, so the CANCELLATION
   * must outlive it.
   */
  async prepareCancellations(
    tx: Prisma.TransactionClient,
    teamId: string,
    eventIds: string[],
  ): Promise<PreparedCancellations> {
    const rows = await tx.eventShare.findMany({
      where: { eventId: { in: eventIds }, type: { in: MESSAGE_TYPES } },
      select: { id: true, eventId: true, state: true },
    });
    const announcedIds = [
      ...new Set(
        rows
          .filter((r) => r.state === EventShareState.SENT && r.eventId !== null)
          .map((r) => r.eventId as string),
      ),
    ];

    const created: CancellationPrompt[] = [];
    if (announcedIds.length > 0) {
      const events = await tx.event.findMany({
        where: { id: { in: announcedIds }, startsAt: { gt: new Date() } },
        select: {
          id: true,
          teamId: true,
          type: true,
          startsAt: true,
          timeConfirmed: true,
          location: true,
          opponentName: true,
        },
      });
      const [team, plans] = await Promise.all([
        tx.team.findUniqueOrThrow({ where: { id: teamId }, select: { name: true } }),
        this.meetingPoints.resolvePlans(teamId, events),
      ]);
      for (const event of events) {
        const vars = buildTemplateVars(event, team.name, plans.get(event.id) ?? null, null);
        const row = await tx.eventShare.create({
          data: {
            eventId: event.id,
            teamId,
            type: EventShareType.CANCELLATION,
            state: EventShareState.PENDING,
            eventSnapshot: toSnapshot(vars) as Prisma.InputJsonValue,
            expiresAt: event.startsAt,
            firstNotifiedAt: new Date(),
          },
          select: { id: true },
        });
        created.push({
          shareId: row.id,
          startsAt: event.startsAt,
          subject: describeShareSubject(event),
        });
      }
    }
    await tx.eventShare.deleteMany({
      where: { eventId: { in: eventIds }, type: { in: MESSAGE_TYPES } },
    });
    return { created, discardedShareIds: rows.map((r) => r.id) };
  }

  /** After the delete's commit: the jobs, the bells, and the ask to share the cancellation. */
  async afterCancellations(teamId: string, prepared: PreparedCancellations): Promise<void> {
    try {
      await this.scheduler.discard(prepared.discardedShareIds);
      await this.scheduler.queueFollowUps(prepared.created);
      await this.scheduler.notifyChangePrompts(
        teamId,
        'CANCELLATION',
        prepared.created.map((c) => ({ ...c, eventId: null })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`WhatsApp cancellation follow-up failed: ${message}`);
    }
  }

  // Everything a share needs, read once. `vars` is null while the guest link is
  // off: there is nothing valid to send.
  private async loadShareContext(clubId: string, teamId: string, eventId: string) {
    await this.assertTeamInClub(clubId, teamId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, teamId },
      select: {
        id: true,
        teamId: true,
        type: true,
        startsAt: true,
        timeConfirmed: true,
        location: true,
        opponentName: true,
      },
    });
    if (!event) throw new NotFoundException('Événement introuvable');
    const [team, link, plans] = await Promise.all([
      this.prisma.team.findUniqueOrThrow({
        where: { id: teamId },
        select: {
          name: true,
          waReminderTemplate: true,
          waUpdateTemplate: true,
          waCancellationTemplate: true,
        },
      }),
      this.guestLinks.get(clubId, teamId),
      this.meetingPoints.resolvePlans(teamId, [event]),
    ]);
    const vars = link
      ? buildTemplateVars(event, team.name, plans.get(event.id) ?? null, link.url)
      : null;
    const templates: Record<EventShareType, string> = {
      REMINDER: team.waReminderTemplate ?? DEFAULT_TEMPLATES.REMINDER,
      UPDATE: team.waUpdateTemplate ?? DEFAULT_TEMPLATES.UPDATE,
      CANCELLATION: team.waCancellationTemplate ?? DEFAULT_TEMPLATES.CANCELLATION,
    };
    return { event, vars, templates };
  }

  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const link = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
      select: { teamId: true },
    });
    if (!link) throw new NotFoundException('Équipe introuvable');
  }
}

// The message the group last read: the most recently sent REMINDER or UPDATE
// that recorded what it said.
function newestSent<
  T extends { sentAt: Date | null; sentContentKey: string | null; sentVars: unknown },
>(rows: T[]): (T & { sentAt: Date; sentContentKey: string }) | null {
  const sent = rows.filter(
    (r): r is T & { sentAt: Date; sentContentKey: string } =>
      r.sentAt !== null && r.sentContentKey !== null,
  );
  sent.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  return sent[0] ?? null;
}

// A Json column read back: what confirm wrote is a WhatsAppTemplateVars, but a
// row written by hand may hold anything, and an empty diff beats a crash.
function asVars(value: unknown): Partial<WhatsAppTemplateVars> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<WhatsAppTemplateVars>)
    : {};
}

function toStatus(
  row: {
    type: EventShareType;
    state: EventShareState;
    dueAt: Date | null;
    sentAt: Date | null;
    platform: EventSharePlatform | null;
    sentBy: { id: string; firstName: string | null; lastName: string | null } | null;
  },
  callerId: string,
): EventShareStatus {
  return {
    type: row.type,
    state: row.state,
    dueAt: row.dueAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    sentBy: toRsvpRespondent(row.sentBy, callerId),
    platform: row.platform,
  };
}
