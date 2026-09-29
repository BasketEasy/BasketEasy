import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventRsvpSource,
  EventRsvpStatus,
  EventTravelMode,
  EventType,
  NotificationType,
} from '@prisma/client';
import {
  GUEST_RSVP_CLOSED_CODE,
  GUEST_WINDOW_DAYS,
  type GuestAttendanceEntry,
  type GuestEvent,
  type GuestRosterMember,
  type GuestRsvpRequest,
  type GuestTeamPage,
} from '@basketeasy/types/guest-links';
import { PrismaService } from '../prisma/prisma.service';
import { MeetingPointsService } from '../meeting-points/meeting-points.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GuestRateLimiter } from './guest-rate-limiter';

const DAY_MS = 24 * 60 * 60 * 1000;
const INVITE_REQUEST_COOLDOWN_MS = 7 * DAY_MS;

/** What a visitor holding the team's link can read and do — see the design doc's threat model. */
@Injectable()
export class GuestRsvpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meetingPoints: MeetingPointsService,
    private readonly notifications: NotificationsService,
    private readonly limiter: GuestRateLimiter,
  ) {}

  async getPage(teamId: string): Promise<GuestTeamPage> {
    const [team, roster, events] = await Promise.all([
      this.prisma.team.findUniqueOrThrow({
        where: { id: teamId },
        select: {
          name: true,
          clubTeams: { where: { isOwner: true }, select: { club: { select: { name: true } } } },
        },
      }),
      this.loadRoster(teamId),
      this.loadEvents(teamId),
    ]);
    return {
      teamName: team.name,
      clubName: team.clubTeams[0]?.club.name ?? '',
      roster: roster.members,
      events,
    };
  }

  async setRsvp(
    teamId: string,
    token: string,
    ip: string | undefined,
    eventId: string,
    dto: GuestRsvpRequest,
  ): Promise<GuestEvent> {
    this.limiter.consume(token, ip);
    const event = await this.findAnswerableEvent(teamId, eventId);
    await this.assertOnRoster(teamId, dto.teamPlayerId);

    if (dto.travelMode !== undefined) {
      if (dto.status !== EventRsvpStatus.GOING || event.type !== EventType.MATCH) {
        throw new BadRequestException(
          'Le mode de déplacement ne concerne que les matchs auxquels on participe',
        );
      }
    }

    const respondedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const written = await tx.eventRsvp.upsert({
        where: { eventId_teamPlayerId: { eventId, teamPlayerId: dto.teamPlayerId } },
        create: {
          eventId,
          teamPlayerId: dto.teamPlayerId,
          status: dto.status,
          respondedAt,
          respondedByUserId: null,
          source: EventRsvpSource.GUEST_LINK,
          ...(dto.travelMode ? { travelMode: dto.travelMode } : {}),
        },
        update: {
          status: dto.status,
          respondedAt,
          respondedByUserId: null,
          source: EventRsvpSource.GUEST_LINK,
          // The app's rule: leaving GOING drops the choice, re-answering
          // GOING keeps it unless a new one is sent.
          ...(dto.status !== EventRsvpStatus.GOING
            ? { travelMode: EventTravelMode.MEETING_POINT }
            : dto.travelMode
              ? { travelMode: dto.travelMode }
              : {}),
        },
      });
      await tx.eventRsvpChange.create({
        data: {
          eventId,
          teamPlayerId: dto.teamPlayerId,
          status: dto.status,
          travelMode: dto.status === EventRsvpStatus.GOING ? written.travelMode : null,
          source: EventRsvpSource.GUEST_LINK,
          respondedByUserId: null,
        },
      });
    });
    return this.loadOneEvent(teamId, eventId);
  }

  async clearRsvp(
    teamId: string,
    token: string,
    ip: string | undefined,
    eventId: string,
    teamPlayerId: string,
  ): Promise<GuestEvent> {
    this.limiter.consume(token, ip);
    await this.findAnswerableEvent(teamId, eventId);
    await this.assertOnRoster(teamId, teamPlayerId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.eventRsvp.deleteMany({ where: { eventId, teamPlayerId } });
      if (count > 0) {
        await tx.eventRsvpChange.create({
          data: {
            eventId,
            teamPlayerId,
            status: null,
            travelMode: null,
            source: EventRsvpSource.GUEST_LINK,
            respondedByUserId: null,
          },
        });
      }
    });
    return this.loadOneEvent(teamId, eventId);
  }

  // Always resolves: the caller answers 204 whatever happened here, so the
  // shared link can't be used to learn which teammates already have accounts.
  async requestInvite(
    teamId: string,
    token: string,
    ip: string | undefined,
    teamPlayerId: string,
  ): Promise<void> {
    this.limiter.consume(token, ip);
    const teamPlayer = await this.prisma.teamPlayer.findFirst({
      where: { id: teamPlayerId, teamId },
      select: {
        player: {
          select: {
            id: true,
            clubId: true,
            firstName: true,
            lastName: true,
            userId: true,
            invite: { select: { acceptedAt: true, expiresAt: true } },
          },
        },
      },
    });
    if (!teamPlayer) return;
    const { player } = teamPlayer;
    if (player.userId) return;
    if (player.invite && !player.invite.acceptedAt && player.invite.expiresAt > new Date()) return;

    // Only an ADMIN of the player's own club can issue their PlayerInvite
    // (the route is club-scoped to Player.clubId), so they are the audience:
    // telling someone who can't act on it would just be noise. On a CTC team
    // the player's club is not necessarily the owner club.
    const admins = await this.prisma.clubMembership.findMany({
      where: { clubId: player.clubId, role: 'ADMIN' },
      select: { userId: true },
    });
    const recipients = admins.map((a) => a.userId);
    if (recipients.length === 0) return;

    const deepLink = `/clubs/${player.clubId}/members?tab=players&invite=${player.id}`;
    const recent = await this.prisma.notification.findFirst({
      where: {
        type: NotificationType.GUEST_INVITE_REQUESTED,
        userId: { in: recipients },
        deepLink,
        createdAt: { gt: new Date(Date.now() - INVITE_REQUEST_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    if (recent) return;

    const initial = player.lastName ? ` ${player.lastName.charAt(0).toUpperCase()}.` : '';
    await this.notifications.notify(
      recipients.map((userId) => ({
        userId,
        type: NotificationType.GUEST_INVITE_REQUESTED,
        title: `${player.firstName}${initial} demande un lien d'invitation Kluvo`,
        body: 'Ce joueur répond via le lien de l’équipe et souhaite créer son compte.',
        deepLink,
      })),
    );
  }

  private async loadRoster(teamId: string) {
    const rows = await this.prisma.teamPlayer.findMany({
      where: { teamId },
      select: {
        id: true,
        role: true,
        player: { select: { firstName: true, lastName: true } },
      },
    });
    const members: GuestRosterMember[] = rows
      .map((tp) => ({
        teamPlayerId: tp.id,
        firstName: tp.player.firstName,
        lastInitial: tp.player.lastName ? tp.player.lastName.charAt(0).toUpperCase() : null,
        role: tp.role,
      }))
      // Players first, coaches after; then alphabetical, as the picker reads.
      .sort(
        (a, b) =>
          Number(a.role === 'COACH') - Number(b.role === 'COACH') ||
          a.firstName.localeCompare(b.firstName, 'fr') ||
          (a.lastInitial ?? '').localeCompare(b.lastInitial ?? '', 'fr'),
      );
    return { members };
  }

  private window(now = new Date()) {
    return { gt: now, lte: new Date(now.getTime() + GUEST_WINDOW_DAYS * DAY_MS) };
  }

  // 404 for an event that isn't the team's; 409 for one outside the window.
  private async findAnswerableEvent(teamId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, teamId },
      select: { id: true, type: true, startsAt: true },
    });
    if (!event) throw new NotFoundException();
    const { gt, lte } = this.window();
    if (event.startsAt <= gt || event.startsAt > lte) {
      throw new ConflictException({
        message: 'Les réponses à cet événement sont closes',
        code: GUEST_RSVP_CLOSED_CODE,
      });
    }
    return event;
  }

  private async assertOnRoster(teamId: string, teamPlayerId: string): Promise<void> {
    const count = await this.prisma.teamPlayer.count({ where: { id: teamPlayerId, teamId } });
    if (count === 0) {
      throw new BadRequestException("Ce joueur ne fait pas partie de l'effectif de cette équipe");
    }
  }

  private async loadOneEvent(teamId: string, eventId: string): Promise<GuestEvent> {
    const [event] = await this.loadEvents(teamId, eventId);
    // The write above validated the window a moment ago; if kickoff passed
    // in between, the answer stands and the closed event has nothing to show.
    if (!event) throw new NotFoundException();
    return event;
  }

  // Events in the window plus the roster's answers, convocations and plans:
  // five queries however many events there are.
  private async loadEvents(teamId: string, onlyEventId?: string): Promise<GuestEvent[]> {
    const events = await this.prisma.event.findMany({
      where: { teamId, startsAt: this.window(), ...(onlyEventId ? { id: onlyEventId } : {}) },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        teamId: true,
        type: true,
        startsAt: true,
        timeConfirmed: true,
        location: true,
        opponentName: true,
        venue: true,
        notes: true,
      },
    });
    if (events.length === 0) return [];
    const eventIds = events.map((e) => e.id);
    const [roster, rsvps, convocations, plans] = await Promise.all([
      this.prisma.teamPlayer.findMany({ where: { teamId }, select: { id: true } }),
      this.prisma.eventRsvp.findMany({
        where: { eventId: { in: eventIds } },
        select: { eventId: true, teamPlayerId: true, status: true, travelMode: true, source: true },
      }),
      this.prisma.eventConvocation.findMany({
        where: { eventId: { in: eventIds } },
        select: { eventId: true, teamPlayerId: true },
      }),
      this.meetingPoints.resolvePlans(teamId, events),
    ]);
    const rsvpByKey = new Map(rsvps.map((r) => [`${r.eventId}|${r.teamPlayerId}`, r]));
    const convoked = new Set(convocations.map((c) => `${c.eventId}|${c.teamPlayerId}`));

    return events.map((event) => {
      const attendance: GuestAttendanceEntry[] = roster.map((tp) => {
        const key = `${event.id}|${tp.id}`;
        const rsvp = rsvpByKey.get(key);
        return {
          teamPlayerId: tp.id,
          status: rsvp?.status ?? null,
          travelMode:
            event.type === EventType.MATCH && rsvp?.status === EventRsvpStatus.GOING
              ? rsvp.travelMode
              : null,
          convoked: convoked.has(key),
          viaLink: rsvp?.source === EventRsvpSource.GUEST_LINK,
        };
      });
      return {
        id: event.id,
        type: event.type,
        startsAt: event.startsAt.toISOString(),
        timeConfirmed: event.timeConfirmed,
        location: event.location,
        opponentName: event.opponentName,
        venue: event.venue,
        notes: event.notes,
        meetingPlan: plans.get(event.id) ?? null,
        attendance,
      };
    });
  }
}
