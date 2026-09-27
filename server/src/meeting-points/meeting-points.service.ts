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
import { EventType, Prisma } from '@prisma/client';
import type {
  ClubMeetingSettings,
  EventMeetingPlan,
  MeetingPoint,
  TeamMeetingSettings,
  UpdateEventMeetingRequest,
} from '@basketeasy/types/meeting-points';
import { PrismaService } from '../prisma/prisma.service';
import { MEETING_TRAVEL_QUEUE } from '../queue/queue.module';
import { GeocodingService } from './geocoding.service';
import {
  isTravelStale,
  resolveMeetingPlan,
  resolveMeetingPoint,
  travelRouteKey,
  type MeetingPlanClub,
  type MeetingPlanEvent,
  type MeetingPlanTeam,
} from './meeting-plan';
import { ROUTING_CLIENT, type RoutingClient } from './routing-client';

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
    await this.enqueueForClub(clubId);
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
    await this.enqueueForTeam(teamId);
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

  /** Upcoming matches of one team — after a team default or buffer change. */
  async enqueueForTeam(teamId: string): Promise<void> {
    const events = await this.prisma.event.findMany({
      where: { teamId, type: EventType.MATCH, startsAt: { gt: new Date() } },
      select: { id: true },
    });
    if (events.length > 0) await this.enqueueRecompute(events.map((e) => e.id));
  }

  /** Upcoming matches of every team the club owns — after a club default change. */
  async enqueueForClub(clubId: string): Promise<void> {
    const events = await this.prisma.event.findMany({
      where: {
        type: EventType.MATCH,
        startsAt: { gt: new Date() },
        team: { clubTeams: { some: { clubId, isOwner: true } } },
      },
      select: { id: true },
    });
    if (events.length > 0) await this.enqueueRecompute(events.map((e) => e.id));
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
