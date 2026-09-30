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
import { EventRsvpStatus, EventTravelMode, EventType, type EventMeeting } from '@prisma/client';
import { isUnknownEventLocation } from '@basketeasy/types/events';
import type {
  ClubMeetingSettings,
  EventMeetingPlan,
  MeetingPoint,
  TeamMeetingSettings,
  UpdateEventMeetingRequest,
} from '@basketeasy/types/meeting-points';
import { GUEST_WINDOW_DAYS } from '@basketeasy/types/guest-links';
import { PrismaService } from '../prisma/prisma.service';
import {
  groupByRecipient,
  recipientDeepLink,
  resolvePlayerAudience,
} from '../common/player-audience';
import { subjectLabel } from '../common/notification-subject';
import { NotificationsService } from '../notifications/notifications.service';
import { MEETING_TRAVEL_QUEUE } from '../queue/queue.module';
import { GeocodingService } from './geocoding.service';
import { MeetingChangeFeed } from './meeting-change-feed';
import { meetingChangedNotification, meetingFixedNotification } from './meeting-notification-copy';
import {
  isTravelStale,
  meetingAnnouncementKey,
  normaliseAddress,
  resolveDefaultMeetingPoint,
  resolveEventMeetingPoint,
  resolveMeetingPlan,
  travelRouteKey,
  type MeetingPlanClub,
  type MeetingPlanEvent,
  type MeetingPlanState,
  type MeetingPlanTeam,
} from './meeting-plan';
import { ROUTING_CLIENT, type RoutingClient } from './routing-client';

// A changed meeting is only pushed to players for a match this close — a
// club-wide default change must not send one notification per future match.
// Further-off matches update quietly and read correctly when opened.
export const MEETING_CHANGE_NOTIFY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// What the change feed covers: the WhatsApp reminders reach as far as the guest page does.
export const MEETING_CHANGE_FEED_WINDOW_MS = GUEST_WINDOW_DAYS * 24 * 60 * 60 * 1000;

// Two job kinds share the rate-limited `meeting-travel` queue: a route
// recompute for one match, and the announcement sweep a settings change that
// moved no route (a buffer, a place name) still owes the players.
export const RECOMPUTE_JOB = 'recompute';
export const ANNOUNCE_JOB = 'announce';
export interface MeetingRecomputeJobData {
  eventId: string;
}
export type MeetingAnnounceJobData = { clubId: string } | { teamId: string };
export type MeetingTravelJobData = MeetingRecomputeJobData | MeetingAnnounceJobData;

/** The event columns this service reads — a subset of every Event row. */
export type MeetingEventRow = MeetingPlanEvent & { id: string; teamId: string };

/** The EventMeeting columns a write can change. */
type EventMeetingChanges = Partial<Omit<EventMeeting, 'eventId' | 'updatedAt'>>;

const MEETING_COLUMNS = {
  meetingPointName: true,
  meetingPointAddress: true,
  arrivalBufferMinutes: true,
} as const;

/**
 * A stale route found on read is queued at most this often per event and
 * per instance. The queue's jobId already dedupes, but every read would
 * still cost a Redis round trip — and pile up in ioredis's offline queue
 * while Redis is down.
 */
export const STALE_ENQUEUE_DEBOUNCE_MS = 5 * 60 * 1000;
const STALE_ENQUEUE_MAP_LIMIT = 10_000;

/**
 * « Recalculer » runs inside the request, so each provider call gets a
 * tighter budget than the queue's; and a second press within the cooldown
 * answers with the plan it already has rather than calling ORS again, so a
 * mashed button can't spend the rate limit the queue's limiter protects.
 */
export const REFRESH_TIMEOUT_MS = 5_000;
export const REFRESH_COOLDOWN_MS = 15_000;

interface TeamContext {
  teamName: string;
  team: MeetingPlanTeam;
  club: (MeetingPlanClub & { name: string }) | null;
  linkedClubs: { clubId: string; isOwner: boolean }[];
}

const TEAM_CONTEXT_SELECT = {
  id: true,
  name: true,
  ...MEETING_COLUMNS,
  clubTeams: {
    select: {
      clubId: true,
      isOwner: true,
      club: { select: { name: true, ...MEETING_COLUMNS } },
    },
  },
} as const;

type TeamContextRow = {
  name: string;
  meetingPointName: string | null;
  meetingPointAddress: string | null;
  arrivalBufferMinutes: number | null;
  clubTeams: {
    clubId: string;
    isOwner: boolean;
    club: MeetingPlanClub & { name: string };
  }[];
};

// A CTC team inherits from its owner club only (ClubTeam.isOwner) — a
// partner club's default never applies.
function toTeamContext(row: TeamContextRow): TeamContext {
  return {
    teamName: row.name,
    team: {
      meetingPointName: row.meetingPointName,
      meetingPointAddress: row.meetingPointAddress,
      arrivalBufferMinutes: row.arrivalBufferMinutes,
    },
    club: row.clubTeams.find((ct) => ct.isOwner)?.club ?? null,
    linkedClubs: row.clubTeams.map(({ clubId, isOwner }) => ({ clubId, isOwner })),
  };
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

function sameAddress(a: MeetingPoint | null | undefined, b: MeetingPoint | null | undefined) {
  return (a ? normaliseAddress(a.address) : null) === (b ? normaliseAddress(b.address) : null);
}

/**
 * The match meeting point: club and team defaults, the per-match override,
 * the driving time behind the meeting time, and the plan every TeamEvent
 * carries. See docs/superpowers/specs/2026-09-27-match-meeting-point-design.md.
 *
 * Queries PrismaService directly rather than injecting TeamsService/
 * EventsService — same cross-module convention as Events, Dashboard and Team
 * stats. The dependency runs one way: Events reads plans from here, nothing
 * here imports from Events.
 */
@Injectable()
export class MeetingPointsService {
  private readonly logger = new Logger(MeetingPointsService.name);
  private readonly staleEnqueuedAt = new Map<string, number>();
  private readonly refreshedAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    @Inject(ROUTING_CLIENT) private readonly routing: RoutingClient,
    @InjectQueue(MEETING_TRAVEL_QUEUE) private readonly queue: Queue<MeetingTravelJobData>,
    private readonly notifications: NotificationsService,
    private readonly changeFeed: MeetingChangeFeed,
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
    const previous = await this.getClubSettings(clubId);
    await this.prisma.club.update({
      where: { id: clubId },
      data: {
        ...meetingPointColumns(data.meetingPoint),
        arrivalBufferMinutes: data.arrivalBufferMinutes,
      },
    });
    // A moved address needs recomputes, which announce as they land. A buffer
    // or a name moves no route but still changes what players were told.
    if (!sameAddress(previous.meetingPoint, data.meetingPoint)) {
      await this.enqueueRecompute(await this.inheritingUpcomingMatchIds({ clubId }));
    } else if (
      previous.meetingPoint?.name !== data.meetingPoint?.name.trim() ||
      previous.arrivalBufferMinutes !== data.arrivalBufferMinutes
    ) {
      await this.enqueueAnnounce({ clubId });
    }
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
    const { team, club } = await this.loadTeamContext(teamId);
    const nextColumns = meetingPointColumns(data.meetingPoint);
    await this.prisma.team.update({
      where: { id: teamId },
      data: { ...nextColumns, arrivalBufferMinutes: data.arrivalBufferMinutes },
    });
    // Compare what the team's matches inherit, not the team row alone:
    // clearing a team place that equalled the club's changes no route.
    const before = resolveDefaultMeetingPoint(team, club)?.meetingPoint;
    const after = resolveDefaultMeetingPoint(nextColumns, club)?.meetingPoint;
    if (!sameAddress(before, after)) {
      await this.enqueueRecompute(await this.inheritingUpcomingMatchIds({ teamId }));
    } else if (
      before?.name !== after?.name ||
      team.arrivalBufferMinutes !== data.arrivalBufferMinutes
    ) {
      await this.enqueueAnnounce({ teamId });
    }
    return this.getTeamSettings(clubId, teamId);
  }

  /**
   * Two queries for the whole batch: the team's and owner club's settings
   * (shared by every event on the team) and the matches' EventMeeting rows.
   * Queues a recompute for any MATCH whose stored travel time belongs to
   * another route.
   */
  async resolvePlans(
    teamId: string,
    events: MeetingEventRow[],
  ): Promise<Map<string, EventMeetingPlan | null>> {
    const plans = new Map<string, EventMeetingPlan | null>(events.map((e) => [e.id, null]));
    const matches = events.filter((e) => e.type === EventType.MATCH);
    if (matches.length === 0) return plans;

    const [{ team, club }, states] = await Promise.all([
      this.loadTeamContext(teamId),
      this.prisma.eventMeeting.findMany({
        where: { eventId: { in: matches.map((e) => e.id) } },
      }),
    ]);
    const stateByEventId = new Map(states.map((s) => [s.eventId, s]));
    const staleIds: string[] = [];
    for (const event of matches) {
      const state = stateByEventId.get(event.id) ?? null;
      plans.set(event.id, resolveMeetingPlan(event, state, team, club));
      if (isTravelStale(event, state, team, club)) staleIds.push(event.id);
    }
    this.enqueueStale(staleIds);
    return plans;
  }

  /**
   * A team manager's per-match adjustments. Each field is applied only when
   * present. Answers with the resulting plan; the client refetches the
   * event for everything else.
   */
  async setEventMeeting(
    clubId: string,
    teamId: string,
    eventId: string,
    data: UpdateEventMeetingRequest,
  ): Promise<EventMeetingPlan> {
    const { event, state } = await this.loadMatch(clubId, teamId, eventId);
    const { team, club } = await this.loadTeamContext(teamId);

    const nextPlaceColumns =
      data.meetingPoint !== undefined
        ? meetingPointColumns(data.meetingPoint)
        : {
            meetingPointName: state?.meetingPointName ?? null,
            meetingPointAddress: state?.meetingPointAddress ?? null,
          };
    const resolved = resolveEventMeetingPoint(event, nextPlaceColumns, team, club);
    const currentKey = resolved
      ? travelRouteKey(resolved.meetingPoint.address, event.location)
      : null;

    const changes: EventMeetingChanges = { ...nextPlaceColumns };
    let nextRouteKey = state?.travelRouteKey ?? null;

    if (data.travelMinutes !== undefined) {
      if (data.travelMinutes === null) {
        changes.travelMinutes = null;
        changes.travelMinutesManual = false;
        changes.travelRouteKey = null;
        nextRouteKey = null;
      } else {
        if (!resolved) throw this.noMeetingPointError();
        changes.travelMinutes = data.travelMinutes;
        changes.travelMinutesManual = true;
        changes.travelRouteKey = currentKey;
        nextRouteKey = currentKey;
      }
    }

    if (data.meetsAt !== undefined) {
      if (data.meetsAt === null) {
        changes.meetsAtOverride = null;
      } else {
        if (!resolved) throw this.noMeetingPointError();
        const meetsAt = new Date(data.meetsAt);
        if (meetsAt > event.startsAt) {
          throw new BadRequestException('Le rendez-vous ne peut pas être après le début du match');
        }
        changes.meetsAtOverride = meetsAt;
      }
    }

    // No place left at any level: a time override would be a time with
    // nowhere to meet.
    if (!resolved) changes.meetsAtOverride = null;

    const next = await this.writeState(eventId, changes);

    if (resolved && nextRouteKey !== currentKey) {
      await this.enqueueRecompute([eventId]);
    }
    await this.announceMeetingChanges([eventId]);
    return this.planOrThrow(event, next, team, club);
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
    { force = false, timeoutMs }: { force?: boolean; timeoutMs?: number } = {},
  ): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        type: true,
        startsAt: true,
        location: true,
        venue: true,
        teamId: true,
        meeting: true,
      },
    });
    if (!event || event.type !== EventType.MATCH) return;
    // No venue published yet: nothing to route to. The next import that
    // finds one changes the route key, and the read path re-queues it.
    if (isUnknownEventLocation(event.location)) return;
    const { team, club } = await this.loadTeamContext(event.teamId);
    const resolved = resolveEventMeetingPoint(event, event.meeting, team, club);
    if (!resolved) return;

    const key = travelRouteKey(resolved.meetingPoint.address, event.location);
    if (!force && event.meeting?.travelRouteKey === key) return;

    const options = { bypassNegativeCache: force, timeoutMs };
    const [from, to] = await Promise.all([
      this.geocoding.geocode(resolved.meetingPoint.address, options),
      this.geocoding.geocode(event.location, options),
    ]);
    const minutes = from && to ? await this.routing.drivingMinutes(from, to, { timeoutMs }) : null;

    await this.writeState(eventId, {
      travelMinutes: minutes,
      travelMinutesManual: false,
      travelRouteKey: key,
    });
    await this.announceMeetingChanges([eventId]);
  }

  /** The synchronous « Recalculer » behind POST …/meeting/refresh. */
  async refreshTravel(clubId: string, teamId: string, eventId: string): Promise<EventMeetingPlan> {
    const { event } = await this.loadMatch(clubId, teamId, eventId);
    const now = Date.now();
    const last = this.refreshedAt.get(eventId);
    if (last === undefined || now - last >= REFRESH_COOLDOWN_MS) {
      this.refreshedAt.set(eventId, now);
      pruneOlderThan(this.refreshedAt, now - REFRESH_COOLDOWN_MS);
      try {
        await this.recomputeTravel(eventId, { force: true, timeoutMs: REFRESH_TIMEOUT_MS });
      } catch (err: unknown) {
        this.logger.warn(`Travel refresh failed for event ${eventId}: ${String(err)}`);
        throw new ServiceUnavailableException(
          "Le calcul d'itinéraire est indisponible. Saisissez la durée à la main.",
        );
      }
    }
    const [{ team, club }, state] = await Promise.all([
      this.loadTeamContext(teamId),
      this.prisma.eventMeeting.findUnique({ where: { eventId } }),
    ]);
    return this.planOrThrow(event, state, team, club);
  }

  /**
   * Fire-and-forget, like every other enqueue in the app: REDIS_URL isn't
   * boot-validated, and an unreachable queue must degrade travel times, never
   * an event save. Anything missed here is caught again on read, where a
   * stale route key re-queues itself.
   */
  async enqueueRecompute(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    try {
      await this.queue.addBulk(
        eventIds.map((eventId) => ({
          name: RECOMPUTE_JOB,
          data: { eventId },
          opts: {
            jobId: `meeting-travel-${eventId}`,
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

  private async enqueueAnnounce(scope: MeetingAnnounceJobData): Promise<void> {
    try {
      await this.queue.add(ANNOUNCE_JOB, scope, { removeOnComplete: true, removeOnFail: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to enqueue meeting announcement: ${message}`);
    }
  }

  /** The ANNOUNCE_JOB: every match of the scope inside the notification window. */
  async announceUpcoming(scope: MeetingAnnounceJobData): Promise<void> {
    const now = Date.now();
    // Published for the whole change-feed window, before the narrower player
    // notification window below: the WhatsApp group hears about a moved RDV
    // up to 14 days out, players only 7.
    const feedEvents = await this.prisma.event.findMany({
      where: {
        type: EventType.MATCH,
        startsAt: { gt: new Date(now), lte: new Date(now + MEETING_CHANGE_FEED_WINDOW_MS) },
        ...('teamId' in scope
          ? { teamId: scope.teamId }
          : { team: { clubTeams: { some: { clubId: scope.clubId, isOwner: true } } } }),
      },
      select: { id: true, startsAt: true },
    });
    this.changeFeed.publish(feedEvents.map((e) => e.id));
    const notifyBefore = now + MEETING_CHANGE_NOTIFY_WINDOW_MS;
    await this.announceQuietly(
      feedEvents.filter((e) => e.startsAt.getTime() <= notifyBefore).map((e) => e.id),
    );
  }

  /**
   * Tells players coming to the meeting point that it moved. Runs after every
   * write that can change a resolved meeting (a manager's override, a
   * recompute, a settings change, a new kick-off) and compares against
   * `meetingAnnouncedKey`, the last meeting anyone could have been told:
   *
   * - an unknown time never notifies — the next known one will, including
   *   the first: a player told « horaire à confirmer, vous serez prévenu·e »
   *   is owed the message once the hour is fixed (« RDV fixé »);
   * - only matches within MEETING_CHANGE_NOTIFY_WINDOW_MS are read at all.
   *   A further-off match keeps its old key until an announce runs inside
   *   the window, which then compares against what players last heard;
   * - only GOING players with travelMode MEETING_POINT and an account hear it.
   *
   * Bounded: three reads for the whole batch plus one conditional write per
   * changed match, run in parallel. Never throws: a missed notification must
   * not fail a manager's save or a recompute job.
   */
  async announceMeetingChanges(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    // Before the window filter below: listeners (the WhatsApp update prompts)
    // have their own, wider window.
    this.changeFeed.publish(eventIds);
    await this.announceQuietly(eventIds);
  }

  private async announceQuietly(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    try {
      await this.announce(eventIds);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to announce meeting changes: ${message}`);
    }
  }

  private async announce(eventIds: string[]): Promise<void> {
    const now = Date.now();
    const events = await this.prisma.event.findMany({
      where: {
        id: { in: eventIds },
        type: EventType.MATCH,
        startsAt: { gt: new Date(now), lte: new Date(now + MEETING_CHANGE_NOTIFY_WINDOW_MS) },
      },
      select: {
        id: true,
        teamId: true,
        type: true,
        startsAt: true,
        location: true,
        venue: true,
        opponentName: true,
        meeting: true,
      },
    });
    if (events.length === 0) return;
    const contexts = await this.loadTeamContexts([...new Set(events.map((e) => e.teamId))]);

    const changed = (
      await Promise.all(
        events.map(async (event) => {
          const context = contexts.get(event.teamId);
          if (!context) return null;
          const plan = resolveMeetingPlan(event, event.meeting, context.team, context.club);
          if (!plan?.meetingPoint || !plan.meetsAt) return null;
          const key = meetingAnnouncementKey(plan.meetingPoint, plan.meetsAt);
          const previous = event.meeting?.meetingAnnouncedKey ?? null;
          if (key === previous) return null;
          // Conditional on the key we read, so two writes racing on the same
          // match can't both announce the same change. A known meetsAt
          // always has an EventMeeting row behind it.
          const { count } = await this.prisma.eventMeeting.updateMany({
            where: { eventId: event.id, meetingAnnouncedKey: previous },
            data: { meetingAnnouncedKey: key },
          });
          if (count === 0) return null;
          return {
            event,
            context,
            meeting: { meetsAt: new Date(plan.meetsAt), placeName: plan.meetingPoint.name },
            isFirst: previous === null,
          };
        }),
      )
    ).filter((c) => c !== null);
    if (changed.length === 0) return;

    const rsvps = await this.prisma.eventRsvp.findMany({
      where: {
        eventId: { in: changed.map((c) => c.event.id) },
        status: EventRsvpStatus.GOING,
        travelMode: EventTravelMode.MEETING_POINT,
      },
      select: { eventId: true, teamPlayerId: true },
    });
    // Each slot's player (if they ever claimed an account) and every one of
    // their guardians, merged per event so one reader concerned twice by the
    // same match — a playing parent and their child, two siblings — is told
    // once. One audience read for every event.
    const audience = new Map(
      (
        await resolvePlayerAudience(this.prisma, [...new Set(rsvps.map((r) => r.teamPlayerId))])
      ).map((entry) => [entry.teamPlayerId, entry]),
    );
    const recipients = changed.flatMap(({ event }) =>
      groupByRecipient(
        rsvps
          .filter((r) => r.eventId === event.id)
          .flatMap((r) => audience.get(r.teamPlayerId) ?? []),
      ).map((recipient) => ({ eventId: event.id, recipient })),
    );
    if (recipients.length === 0) return;

    const memberships = await this.prisma.clubMembership.findMany({
      where: {
        userId: { in: [...new Set(recipients.map((r) => r.recipient.userId))] },
        clubId: {
          in: [...new Set(changed.flatMap((c) => c.context.linkedClubs.map((l) => l.clubId)))],
        },
      },
      select: { userId: true, clubId: true },
    });
    const changedById = new Map(changed.map((c) => [c.event.id, c]));

    await this.notifications.notify(
      recipients.map(({ eventId, recipient }) => {
        const { userId } = recipient;
        const { event, context, meeting, isFirst } = changedById.get(eventId)!;
        const copy = isFirst
          ? meetingFixedNotification(context.teamName, event, meeting, recipient)
          : meetingChangedNotification(context.teamName, event, meeting, recipient);
        // The recipient's own club among the team's linked clubs, falling
        // back to the owner — same rule as ScoresheetOcrProcessor, so a CTC
        // reader never taps through to a 403. A parent told only about a
        // child goes through the child's club instead (recipientDeepLink).
        const linked = context.linkedClubs;
        const clubId =
          memberships.find((m) => m.userId === userId && linked.some((l) => l.clubId === m.clubId))
            ?.clubId ??
          linked.find((l) => l.isOwner)?.clubId ??
          linked[0]?.clubId;
        const eventPath = (club: string | undefined) =>
          `/clubs/${club}/teams/${event.teamId}/events/${event.id}`;
        return {
          userId,
          type: isFirst ? ('EVENT_MEETING_FIXED' as const) : ('EVENT_MEETING_CHANGED' as const),
          title: copy.title,
          body: copy.body,
          subjectFirstName: subjectLabel(recipient),
          deepLink: recipientDeepLink(recipient, eventPath(clubId), eventPath),
        };
      }),
    );
  }

  private enqueueStale(eventIds: string[]): void {
    const now = Date.now();
    const due = eventIds.filter((id) => {
      const last = this.staleEnqueuedAt.get(id);
      return last === undefined || now - last >= STALE_ENQUEUE_DEBOUNCE_MS;
    });
    if (due.length === 0) return;
    if (this.staleEnqueuedAt.size > STALE_ENQUEUE_MAP_LIMIT) {
      pruneOlderThan(this.staleEnqueuedAt, now - STALE_ENQUEUE_DEBOUNCE_MS);
    }
    for (const id of due) this.staleEnqueuedAt.set(id, now);
    void this.enqueueRecompute(due);
  }

  /**
   * Upcoming matches whose route a default change can move: no place of
   * their own, and — for a club change — on an owned team with no team
   * place either. A match that overrides the place kept its route.
   */
  private async inheritingUpcomingMatchIds(
    scope: { teamId: string } | { clubId: string },
  ): Promise<string[]> {
    const events = await this.prisma.event.findMany({
      where: {
        type: EventType.MATCH,
        startsAt: { gt: new Date() },
        OR: [{ meeting: { is: null } }, { meeting: { is: { meetingPointName: null } } }],
        ...('teamId' in scope
          ? { teamId: scope.teamId }
          : {
              team: {
                meetingPointName: null,
                clubTeams: { some: { clubId: scope.clubId, isOwner: true } },
              },
            }),
      },
      select: { id: true },
    });
    return events.map((e) => e.id);
  }

  private writeState(eventId: string, changes: EventMeetingChanges): Promise<EventMeeting> {
    return this.prisma.eventMeeting.upsert({
      where: { eventId },
      create: { eventId, ...changes },
      update: changes,
    });
  }

  private planOrThrow(
    event: MeetingPlanEvent,
    state: MeetingPlanState | null,
    team: MeetingPlanTeam,
    club: MeetingPlanClub | null,
  ): EventMeetingPlan {
    const plan = resolveMeetingPlan(event, state, team, club);
    if (!plan) throw this.notAMatchError();
    return plan;
  }

  // Same defense-in-depth re-verification as EventsService.assertEventInTeam:
  // the team belongs to the route's club, the event to that team.
  private async loadMatch(
    clubId: string,
    teamId: string,
    eventId: string,
  ): Promise<{ event: MeetingPlanEvent; state: EventMeeting | null }> {
    await this.assertTeamInClub(clubId, teamId);
    const row = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        teamId: true,
        type: true,
        startsAt: true,
        location: true,
        venue: true,
        meeting: true,
      },
    });
    if (!row || row.teamId !== teamId) throw new NotFoundException('Event not found');
    if (row.type !== EventType.MATCH) throw this.notAMatchError();
    const { meeting, ...event } = row;
    return { event, state: meeting };
  }

  private async loadTeamContext(teamId: string): Promise<TeamContext> {
    const row = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: TEAM_CONTEXT_SELECT,
    });
    if (!row) throw new NotFoundException('Team not found');
    return toTeamContext(row);
  }

  /** One query for any number of teams — the batch paths (announce) use this. */
  private async loadTeamContexts(teamIds: string[]): Promise<Map<string, TeamContext>> {
    const rows = await this.prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: TEAM_CONTEXT_SELECT,
    });
    return new Map(rows.map((row) => [row.id, toTeamContext(row)]));
  }

  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) throw new NotFoundException('Team not found');
  }

  private notAMatchError(): BadRequestException {
    return new BadRequestException('Le point de rendez-vous ne concerne que les matchs');
  }

  private noMeetingPointError(): BadRequestException {
    return new BadRequestException(
      "Aucun point de rendez-vous n'est défini pour ce match (ni club, ni équipe)",
    );
  }
}

function pruneOlderThan(map: Map<string, number>, cutoff: number): void {
  for (const [key, at] of map) {
    if (at < cutoff) map.delete(key);
  }
}
