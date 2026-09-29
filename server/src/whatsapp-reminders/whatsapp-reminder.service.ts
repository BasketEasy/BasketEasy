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
} from '@basketeasy/types/whatsapp-reminder';
import { PrismaService } from '../prisma/prisma.service';
import { toRsvpRespondent, RSVP_RESPONDENT_SELECT } from '../common/rsvp-respondent';
import { GuestLinksService } from '../guest-links/guest-links.service';
import { MeetingPointsService } from '../meeting-points/meeting-points.service';
import { buildTemplateVars } from './whatsapp-template-vars';

@Injectable()
export class WhatsAppReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guestLinks: GuestLinksService,
    private readonly meetingPoints: MeetingPointsService,
  ) {}

  async getTeamSettings(clubId: string, teamId: string): Promise<TeamWhatsAppSettings> {
    await this.assertTeamInClub(clubId, teamId);
    const team = await this.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { waReminderTemplate: true },
    });
    return { reminderTemplate: team.waReminderTemplate };
  }

  async updateTeamSettings(
    clubId: string,
    teamId: string,
    dto: UpdateTeamWhatsAppSettingsRequest,
  ): Promise<TeamWhatsAppSettings> {
    await this.assertTeamInClub(clubId, teamId);
    const template = dto.reminderTemplate?.trim() ? dto.reminderTemplate : null;
    let stored: string | null = template;
    if (template !== null) {
      const result = validateTemplate(template);
      if (!result.ok) {
        throw new BadRequestException({
          message: WHATSAPP_TEMPLATE_ERROR_MESSAGES[result.code],
          code: result.code,
          variable: result.variable,
        });
      }
      if (template === DEFAULT_REMINDER_TEMPLATE) stored = null;
    }
    await this.prisma.team.update({ where: { id: teamId }, data: { waReminderTemplate: stored } });
    return { reminderTemplate: stored };
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
        : { type, state: 'NOT_SENT', sentAt: null, sentBy: null, platform: null };
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

    // First writer wins: the (eventId, type) unique settles a race, and the
    // loser is a success, not an error: both admins really did send it.
    const sentAt = new Date();
    try {
      await this.prisma.eventShare.create({
        data: {
          eventId,
          type,
          state: EventShareState.SENT,
          sentAt,
          sentByUserId: userId,
          platform,
          sentContentKey: contentKey(vars),
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
    }
    const row = await this.prisma.eventShare.findUniqueOrThrow({
      where: { eventId_type: { eventId, type } },
      include: { sentBy: RSVP_RESPONDENT_SELECT },
    });
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
    sentAt: Date | null;
    platform: EventSharePlatform | null;
    sentBy: { id: string; firstName: string | null; lastName: string | null } | null;
  },
  callerId: string,
): EventShareStatus {
  return {
    type: row.type,
    state: row.state,
    sentAt: row.sentAt?.toISOString() ?? null,
    sentBy: toRsvpRespondent(row.sentBy, callerId),
    platform: row.platform,
  };
}
