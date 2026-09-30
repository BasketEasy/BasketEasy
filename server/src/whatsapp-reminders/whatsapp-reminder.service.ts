import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventShareState, EventShareType, Prisma, type EventSharePlatform } from '@prisma/client';
import {
  DEFAULT_REMINDER_TEMPLATE,
  GUEST_LINK_DISABLED_CODE,
  WA_SHARE_CLOSED_CODE,
  WHATSAPP_TEMPLATE_ERROR_MESSAGES,
  contentKey,
  renderTemplate,
  validateTemplate,
  type EventShareStatus,
  type EventWhatsAppShare,
  type TeamWhatsAppSettings,
  type UpdateTeamWhatsAppSettingsRequest,
  type UpdateTeamWhatsAppSettingsResponse,
} from '@basketeasy/types/whatsapp-reminder';
import { PrismaService } from '../prisma/prisma.service';
import { toRsvpRespondent, RSVP_RESPONDENT_SELECT } from '../common/rsvp-respondent';
import { GuestLinksService } from '../guest-links/guest-links.service';
import { MeetingPointsService } from '../meeting-points/meeting-points.service';
import { WhatsAppReminderScheduler } from './whatsapp-reminder.scheduler';
import { buildTemplateVars } from './whatsapp-template-vars';

@Injectable()
export class WhatsAppReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guestLinks: GuestLinksService,
    private readonly meetingPoints: MeetingPointsService,
    private readonly scheduler: WhatsAppReminderScheduler,
  ) {}

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

    if (dto.reminderTemplate !== undefined) {
      const template = dto.reminderTemplate?.trim() ? dto.reminderTemplate : null;
      if (template !== null) {
        const result = validateTemplate(template);
        if (!result.ok) {
          throw new BadRequestException({
            message: WHATSAPP_TEMPLATE_ERROR_MESSAGES[result.code],
            code: result.code,
            variable: result.variable,
          });
        }
      }
      data.waReminderTemplate = template === DEFAULT_REMINDER_TEMPLATE ? null : template;
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

  // Read-only: an absent row is `NOT_SENT`, never created here.
  async getEventShare(
    clubId: string,
    teamId: string,
    eventId: string,
    callerId: string,
  ): Promise<EventWhatsAppShare> {
    const { event, vars, template } = await this.loadShareContext(clubId, teamId, eventId);
    const rows = await this.prisma.eventShare.findMany({
      where: { eventId: event.id },
      include: { sentBy: RSVP_RESPONDENT_SELECT },
    });
    const shares = Object.values(EventShareType).map((type) => {
      const row = rows.find((r) => r.type === type);
      const status: EventShareStatus = row
        ? toStatus(row, callerId)
        : { type, state: 'NOT_SENT', dueAt: null, sentAt: null, sentBy: null, platform: null };
      return { ...status, message: vars ? renderTemplate(template, vars) : null };
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
    const sentAt = new Date();
    const sent = {
      state: EventShareState.SENT,
      sentAt,
      sentByUserId: userId,
      platform,
      sentContentKey: contentKey(vars),
    };
    let won = false;
    try {
      await this.prisma.eventShare.create({ data: { eventId, type, ...sent } });
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
        select: { name: true, waReminderTemplate: true },
      }),
      this.guestLinks.get(clubId, teamId),
      this.meetingPoints.resolvePlans(teamId, [event]),
    ]);
    const vars = link
      ? buildTemplateVars(event, team.name, plans.get(event.id) ?? null, link.url)
      : null;
    return { event, vars, template: team.waReminderTemplate ?? DEFAULT_REMINDER_TEMPLATE };
  }

  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const link = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
      select: { teamId: true },
    });
    if (!link) throw new NotFoundException('Équipe introuvable');
  }
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
