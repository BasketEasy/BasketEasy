import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { EventRsvpStatus, EventTravelMode, EventType, Prisma } from '@prisma/client';
import type {
  ClubMeetingSettings,
  EventMeetingPlan,
  MeetingPoint,
  TeamMeetingSettings,
  UpdateEventMeetingRequest,
} from '@basketeasy/types/meeting-points';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { meetingChangedNotification } from '../events/event-notification-copy';
import { MEETING_TRAVEL_QUEUE } from '../queue/queue.module';
import { GeocodingService } from './geocoding.service';
import {
  isTravelStale,
  meetingAnnouncementKey,
  resolveMeetingPlan,
  resolveMeetingPoint,
  travelRouteKey,
  type MeetingPlanClub,
  type MeetingPlanEvent,
  type MeetingPlanTeam,
} from './meeting-plan';
import { ROUTING_CLIENT, type RoutingClient } from './routing-client';

// A changed meeting is only pushed to players for a match this close — a
// club-wide default change must not send one notification per future match.
// Further-off matches update quietly and read correctly when opened.
export const MEETING_CHANGE_NOTIFY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface MeetingTravelJobData {
  eventId: string;
}

/** The event columns this service reads — a subset of every Event row. */
export type MeetingEventRow = MeetingPlanEvent & { id: string; teamId: string };

const MEETING_COLUMNS = {
  meetingPointName: true,
  meetingPointAddress: true,
  arrivalBufferMinutes: true,
} as const;

interface TeamContext {
  team: MeetingPlanTeam;
  club: (MeetingPlanClub & { name: string }) | null;
}

function toMeetingPoint(columns: {
  meetingPointName: string | null;
  meetingPointAddress: string | null;
}): MeetingPoint | null {
  return columns.meetingPointName && columns.meetingPointAddress
    ? { name: columns.meetingPointName, address: columns.meetingPointAddress }
    : null;
}

function meetingPointColumns(meetingPoint: MeetingPoint | null) {
  return {
    meetingPointName: meetingPoint?.name.trim() ?? null,
    meetingPointAddress: meetingPoint?.address.trim() ?? null,
  };
}

/**
 * The match meeting point: club and team defaults, the per-match override,
 * the driving time behind the meeting time, and the plan every TeamEvent
 * carries. See docs/superpowers/specs/2026-09-27-match-meeting-point-design.md.
 *
 * Queries PrismaService directly rather than injecting TeamsService/
 * EventsService — same cross-module convention as Events, Dashboard and Team
 * stats. Route-level ownership checks (team in club, event in team) stay with
 * the caller that owns the route, as they do everywhere else.
 */
@Injectable()
export class MeetingPointsService {
  private readonly logger = new Logger(MeetingPointsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    @Inject(ROUTING_CLIENT) private readonly routing: RoutingClient,
    @InjectQueue(MEETING_TRAVEL_QUEUE) private readonly queue: Queue<MeetingTravelJobData>,
    private readonly notifications: NotificationsService,
  ) {}

  async getClubSettings(clubId: string): Promise<ClubMeetingSettings> {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: MEETING_COLUMNS,
    });
    if (!club) throw new NotFoundException('Club not found');
    return {
      meetingPoint: toMeetingPoint(club),
      arrivalBufferMinutes: club.arrivalBufferMinutes,
    };
  }

  async updateClubSettings(
    clubId: string,
    data: { meetingPoint: MeetingPoint | null; arrivalBufferMinutes: number },
  ): Promise<ClubMeetingSettings> {
    await this.getClubSettings(clubId);
    await this.prisma.club.update({
      where: { id: clubId },
      data: {
        ...meetingPointColumns(data.meetingPoint),
        arrivalBufferMinutes: data.arrivalBufferMinutes,
      },
    });
    await this.refreshUpcoming(await this.upcomingMatchIdsForClub(clubId));
    return this.getClubSettings(clubId);
  }

  async getTeamSettings(clubId: string, teamId: string): Promise<TeamMeetingSettings> {
    await this.assertTeamInClub(clubId, teamId);
    const { team, club } = await this.loadTeamContext(teamId);
    return {
      meetingPoint: toMeetingPoint(team),
      arrivalBufferMinutes: team.arrivalBufferMinutes,
      clubDefaults: {
        clubName: club?.name ?? '',
        meetingPoint: club ? toMeetingPoint(club) : null,
        arrivalBufferMinutes: club?.arrivalBufferMinutes ?? 0,
      },
    };
  }

  async updateTeamSettings(
    clubId: string,
    teamId: string,
    data: { meetingPoint: MeetingPoint | null; arrivalBufferMinutes: number | null },
  ): Promise<TeamMeetingSettings> {
    await this.assertTeamInClub(clubId, teamId);
    await this.prisma.team.update({
      where: { id: teamId },
      data: {
        ...meetingPointColumns(data.meetingPoint),
        arrivalBufferMinutes: data.arrivalBufferMinutes,
      },
    });
    await this.refreshUpcoming(await this.upcomingMatchIdsForTeam(teamId));
    return this.getTeamSettings(clubId, teamId);
  }

  /**
   * One query for the whole batch — the team's and its owner club's settings
   * are shared by every event on the team. Queues a recompute for any MATCH
   * whose stored travel time belongs to another route.
   */
  async resolvePlans(
    teamId: string,
    events: MeetingEventRow[],
  ): Promise<Map<string, EventMeetingPlan | null>> {
    const plans = new Map<string, EventMeetingPlan | null>();
    if (!events.some((e) => e.type === EventType.MATCH)) {
      for (const event of events) plans.set(event.id, null);
      return plans;
    }
    const { team, club } = await this.loadTeamContext(teamId);
    const staleIds: string[] = [];
    for (const event of events) {
      plans.set(event.id, resolveMeetingPlan(event, team, club));
      if (isTravelStale(event, team, club)) staleIds.push(event.id);
    }
    if (staleIds.length > 0) {
      void this.enqueueRecompute(staleIds);
    }
    return plans;
  }

  /**
   * A team manager's per-match adjustments. Each field is applied only when
   * present; the event has already been verified to belong to the route's
   * team by the caller (EventsService.assertEventInTeam).
   */
  async setEventMeeting(event: MeetingEventRow, data: UpdateEventMeetingRequest): Promise<void> {
    if (event.type !== EventType.MATCH) {
      throw new BadRequestException('Le point de rendez-vous ne concerne que les matchs');
    }
    const { team, club } = await this.loadTeamContext(event.teamId);

    const nextPlaceColumns =
      data.meetingPoint !== undefined
        ? meetingPointColumns(data.meetingPoint)
        : {
            meetingPointName: event.meetingPointName,
            meetingPointAddress: event.meetingPointAddress,
          };
    const resolved = resolveMeetingPoint(nextPlaceColumns, team, club);
    const currentKey = resolved
      ? travelRouteKey(resolved.meetingPoint.address, event.location)
      : null;

    const update: Prisma.EventUpdateInput = { ...nextPlaceColumns };
    let nextRouteKey = event.travelRouteKey;

    if (data.travelMinutes !== undefined) {
      if (data.travelMinutes === null) {
        update.travelMinutes = null;
        update.travelMinutesManual = false;
        update.travelRouteKey = null;
        nextRouteKey = null;
      } else {
        if (!resolved) throw this.noMeetingPointError();
        update.travelMinutes = data.travelMinutes;
        update.travelMinutesManual = true;
        update.travelRouteKey = currentKey;
        nextRouteKey = currentKey;
      }
    }

    if (data.meetsAt !== undefined) {
      if (data.meetsAt === null) {
        update.meetsAtOverride = null;
      } else {
        if (!resolved) throw this.noMeetingPointError();
        const meetsAt = new Date(data.meetsAt);
        if (meetsAt > event.startsAt) {
          throw new BadRequestException('Le rendez-vous ne peut pas être après le début du match');
        }
        update.meetsAtOverride = meetsAt;
      }
    }

    // No place left at any level: a time override would be a time with
    // nowhere to meet.
    if (!resolved) update.meetsAtOverride = null;

    await this.prisma.event.update({ where: { id: event.id }, data: update });

    if (resolved && nextRouteKey !== currentKey) {
      await this.enqueueRecompute([event.id]);
    }
    await this.announceMeetingChanges([event.id]);
  }

  /**
   * Computes and stores the driving time from the event's resolved meeting
   * point to its location. Writes the route key even when the answer is
   * "unknown", so the read path sees "computed for this route" rather than
   * "stale" and doesn't re-queue forever for an address that can't be found.
   *
   * `force` is the manager's « Recalculer »: recomputes even an up-to-date
   * route, replaces manual minutes, and asks the provider again about a
   * cached "not found".
   */
  async recomputeTravel(
    eventId: string,
    { force = false }: { force?: boolean } = {},
  ): Promise<void> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.type !== EventType.MATCH) return;
    const { team, club } = await this.loadTeamContext(event.teamId);
    const resolved = resolveMeetingPoint(event, team, club);
    if (!resolved) return;

    const key = travelRouteKey(resolved.meetingPoint.address, event.location);
    if (!force && event.travelRouteKey === key) return;

    const options = { bypassNegativeCache: force };
    const [from, to] = await Promise.all([
      this.geocoding.geocode(resolved.meetingPoint.address, options),
      this.geocoding.geocode(event.location, options),
    ]);
    const minutes = from && to ? await this.routing.drivingMinutes(from, to) : null;

    await this.prisma.event.update({
      where: { id: eventId },
      data: { travelMinutes: minutes, travelMinutesManual: false, travelRouteKey: key },
    });
    await this.announceMeetingChanges([eventId]);
  }

  /** The synchronous « Recalculer » behind POST …/meeting/refresh. */
  async refreshTravel(event: MeetingEventRow): Promise<void> {
    if (event.type !== EventType.MATCH) {
      throw new BadRequestException('Le point de rendez-vous ne concerne que les matchs');
    }
    try {
      await this.recomputeTravel(event.id, { force: true });
    } catch (err: unknown) {
      this.logger.warn(`Travel refresh failed for event ${event.id}: ${String(err)}`);
      throw new ServiceUnavailableException(
        "Le calcul d'itinéraire est indisponible. Saisissez la durée à la main.",
      );
    }
  }

  /**
   * Fire-and-forget, like every other enqueue in the app: REDIS_URL isn't
   * boot-validated, and an unreachable queue must degrade travel times, never
   * an event save. Anything missed here is caught again on read, where a
   * stale route key re-queues itself.
   */
  async enqueueRecompute(eventIds: string[]): Promise<void> {
    try {
      await this.queue.addBulk(
        eventIds.map((eventId) => ({
          name: 'recompute',
          data: { eventId },
          opts: {
            jobId: `meeting-travel:${eventId}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 30_000 },
            removeOnComplete: true,
            removeOnFail: true,
          },
        })),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to enqueue travel recompute: ${message}`);
    }
  }

  /**
   * Tells players coming to the meeting point that it moved. Runs after every
   * write that can change a resolved meeting (a manager's override, a
   * recompute, a default or buffer change, a new kick-off) and compares
   * against `meetingAnnouncedKey`, the last meeting anyone could have seen:
   *
   * - an unknown time never notifies — the next known one will;
   * - the first known meeting is recorded silently — the convocation covers it;
   * - only matches within MEETING_CHANGE_NOTIFY_WINDOW_MS notify;
   * - only GOING players with travelMode MEETING_POINT and an account hear it.
   *
   * Never throws: a missed notification must not fail a manager's save or a
   * recompute job.
   */
  async announceMeetingChanges(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    try {
      await this.announce(eventIds);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to announce meeting changes: ${message}`);
    }
  }

  private async announce(eventIds: string[]): Promise<void> {
    const events = await this.prisma.event.findMany({
      where: { id: { in: eventIds }, type: EventType.MATCH },
    });
    const contexts = new Map<string, TeamContext>();
    for (const teamId of new Set(events.map((e) => e.teamId))) {
      contexts.set(teamId, await this.loadTeamContext(teamId));
    }

    const now = Date.now();
    const changed: { event: (typeof events)[number]; meetsAt: Date; placeName: string }[] = [];
    for (const event of events) {
      const { team, club } = contexts.get(event.teamId)!;
      const plan = resolveMeetingPlan(event, team, club);
      if (!plan?.meetingPoint || !plan.meetsAt) continue;
      const key = meetingAnnouncementKey(plan.meetingPoint, plan.meetsAt);
      if (key === event.meetingAnnouncedKey) continue;

      // Conditional on the key we read, so two recomputes racing on the
      // same event can't both announce the same change.
      const { count } = await this.prisma.event.updateMany({
        where: { id: event.id, meetingAnnouncedKey: event.meetingAnnouncedKey },
        data: { meetingAnnouncedKey: key },
      });
      if (count === 0 || event.meetingAnnouncedKey === null) continue;

      const startsAt = event.startsAt.getTime();
      if (startsAt <= now || startsAt > now + MEETING_CHANGE_NOTIFY_WINDOW_MS) continue;
      changed.push({
        event,
        meetsAt: new Date(plan.meetsAt),
        placeName: plan.meetingPoint.name,
      });
    }
    if (changed.length === 0) return;

    const changedIds = changed.map((c) => c.event.id);
    const teamIds = [...new Set(changed.map((c) => c.event.teamId))];
    const [rsvps, teams] = await Promise.all([
      this.prisma.eventRsvp.findMany({
        where: {
          eventId: { in: changedIds },
          status: EventRsvpStatus.GOING,
          travelMode: EventTravelMode.MEETING_POINT,
        },
        select: { eventId: true, teamPlayer: { select: { player: { select: { userId: true } } } } },
      }),
      this.prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, name: true, clubTeams: { select: { clubId: true, isOwner: true } } },
      }),
    ]);
    // Player.userId is nullable — a rostered player who never claimed an
    // account has nobody to notify.
    const recipients = rsvps.flatMap((r) =>
      r.teamPlayer.player.userId
        ? [{ eventId: r.eventId, userId: r.teamPlayer.player.userId }]
        : [],
    );
    if (recipients.length === 0) return;

    const teamById = new Map(teams.map((t) => [t.id, t]));
    const memberships = await this.prisma.clubMembership.findMany({
      where: {
        userId: { in: [...new Set(recipients.map((r) => r.userId))] },
        clubId: { in: [...new Set(teams.flatMap((t) => t.clubTeams.map((ct) => ct.clubId)))] },
      },
      select: { userId: true, clubId: true },
    });
    const changedById = new Map(changed.map((c) => [c.event.id, c]));

    await this.notifications.notify(
      recipients.map(({ eventId, userId }) => {
        const { event, meetsAt, placeName } = changedById.get(eventId)!;
        const team = teamById.get(event.teamId);
        const copy = meetingChangedNotification(team?.name ?? 'votre équipe', event, {
          meetsAt,
          placeName,
        });
        // The recipient's own club among the team's linked clubs, falling
        // back to the owner — same rule as ScoresheetOcrProcessor, so a CTC
        // reader never taps through to a 403.
        const linkedClubIds = team?.clubTeams.map((ct) => ct.clubId) ?? [];
        const clubId =
          memberships.find((m) => m.userId === userId && linkedClubIds.includes(m.clubId))
            ?.clubId ??
          team?.clubTeams.find((ct) => ct.isOwner)?.clubId ??
          linkedClubIds[0];
        return {
          userId,
          type: 'EVENT_MEETING_CHANGED' as const,
          title: copy.title,
          body: copy.body,
          deepLink: `/clubs/${clubId}/teams/${event.teamId}/events/${event.id}`,
        };
      }),
    );
  }

  /**
   * After a default or buffer change: a route change needs a recompute (which
   * announces once it lands), a buffer change moves the meeting time with no
   * route change at all — so both are done.
   */
  private async refreshUpcoming(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    await this.enqueueRecompute(eventIds);
    await this.announceMeetingChanges(eventIds);
  }

  private async upcomingMatchIdsForTeam(teamId: string): Promise<string[]> {
    const events = await this.prisma.event.findMany({
      where: { teamId, type: EventType.MATCH, startsAt: { gt: new Date() } },
      select: { id: true },
    });
    return events.map((e) => e.id);
  }

  // Only teams the club owns — a partner club's default never applies.
  private async upcomingMatchIdsForClub(clubId: string): Promise<string[]> {
    const events = await this.prisma.event.findMany({
      where: {
        type: EventType.MATCH,
        startsAt: { gt: new Date() },
        team: { clubTeams: { some: { clubId, isOwner: true } } },
      },
      select: { id: true },
    });
    return events.map((e) => e.id);
  }

  // A CTC team inherits from its owner club only (ClubTeam.isOwner) — a
  // partner club's default never applies.
  private async loadTeamContext(teamId: string): Promise<TeamContext> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        ...MEETING_COLUMNS,
        clubTeams: {
          where: { isOwner: true },
          take: 1,
          select: { club: { select: { name: true, ...MEETING_COLUMNS } } },
        },
      },
    });
    if (!team) throw new NotFoundException('Team not found');
    return {
      team: {
        meetingPointName: team.meetingPointName,
        meetingPointAddress: team.meetingPointAddress,
        arrivalBufferMinutes: team.arrivalBufferMinutes,
      },
      club: team.clubTeams[0]?.club ?? null,
    };
  }

  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) throw new NotFoundException('Team not found');
  }

  private noMeetingPointError(): BadRequestException {
    return new BadRequestException(
      "Aucun point de rendez-vous n'est défini pour ce match (ni club, ni équipe)",
    );
  }
}
