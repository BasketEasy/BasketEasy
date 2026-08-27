import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventRsvpStatus, EventType, EventVenue, Prisma } from '@prisma/client';
import type {
  EventConvocationRosterEntry,
  EventLogisticsAssignee,
  EventLogisticsField,
  EventRecurrenceRequest,
  EventRsvpRosterEntry,
  EventUpdateScope,
  TeamEvent,
} from '@basketeasy/types/events';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { resolvePagination } from '../common/pagination';
import { ListEventsDto } from './dto/list-events.dto';

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
// Caps a single recurring create at ~2 years of weekly occurrences, so a
// distant `until` date can't be used to write an unbounded number of rows.
const MAX_RECURRING_OCCURRENCES = 104;

type EventRow = {
  id: string;
  teamId: string;
  type: EventType;
  startsAt: Date;
  location: string;
  notes: string | null;
  opponentName: string | null;
  venue: EventVenue | null;
  jerseysTeamPlayerId: string | null;
  ballsTeamPlayerId: string | null;
  recurrenceId: string | null;
  externalId: string | null;
  timeConfirmed: boolean;
  createdAt: Date;
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamManagerGuard: TeamManagerGuard,
  ) {}

  async listEvents(
    clubId: string,
    teamId: string,
    query: ListEventsDto,
    userId: string,
  ): Promise<PaginatedResult<TeamEvent>> {
    await this.assertTeamInClub(clubId, teamId);
    const { skip, take, page, pageSize } = resolvePagination(query.page, query.pageSize);
    const where: Prisma.EventWhereInput = {
      teamId,
      ...(query.from || query.to
        ? {
            startsAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { location: { contains: query.search, mode: 'insensitive' } },
              { notes: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.EventOrderByWithRelationInput = { startsAt: query.sortOrder ?? 'asc' };

    const [events, total] = await Promise.all([
      this.prisma.event.findMany({ where, orderBy, skip, take }),
      this.prisma.event.count({ where }),
    ]);

    const eventIds = events.map((e) => e.id);
    const { rsvpStatuses, convokedEventIds } = await this.resolveMyEventState(
      teamId,
      userId,
      eventIds,
    );
    const logisticsAssignees = await this.resolveLogisticsAssignees(events);
    return {
      items: events.map((e) =>
        this.toTeamEvent(
          e,
          rsvpStatuses.get(e.id) ?? null,
          convokedEventIds.has(e.id),
          logisticsAssignees,
        ),
      ),
      total,
      page,
      pageSize,
    };
  }

  // Single-event fetch backing the match detail page — reuses
  // assertEventInTeam's existing defense-in-depth check rather than a new
  // lookup, same pattern every other single-event route in this service
  // already follows.
  async getEvent(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<TeamEvent> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const { rsvpStatuses, convokedEventIds } = await this.resolveMyEventState(teamId, userId, [
      eventId,
    ]);
    const logisticsAssignees = await this.resolveLogisticsAssignees([event]);
    return this.toTeamEvent(
      event,
      rsvpStatuses.get(eventId) ?? null,
      convokedEventIds.has(eventId),
      logisticsAssignees,
    );
  }

  async createEvent(
    clubId: string,
    teamId: string,
    data: {
      type: EventType;
      startsAt: string;
      location: string;
      notes?: string;
      opponentName?: string;
      venue?: EventVenue;
      recurrence?: EventRecurrenceRequest;
    },
    userId: string,
  ): Promise<TeamEvent[]> {
    await this.assertTeamInClub(clubId, teamId);
    if (data.type === EventType.MATCH && !data.opponentName) {
      throw new BadRequestException("Le nom de l'adversaire est requis pour un match");
    }
    if (data.type === EventType.MATCH && !data.venue) {
      throw new BadRequestException('Le domicile/extérieur est requis pour un match');
    }

    const occurrences = this.buildOccurrences(data.startsAt, data.recurrence);
    // One recurrenceId is shared by every row in this batch — only when the
    // caller actually asked for recurrence — so a plain single event stays
    // un-grouped, same as before this feature existed.
    const recurrenceId = data.recurrence ? randomUUID() : null;
    const opponentName = data.type === EventType.MATCH ? (data.opponentName ?? null) : null;
    const venue = data.type === EventType.MATCH ? (data.venue ?? null) : null;

    const events = await this.prisma.$transaction(
      occurrences.map((startsAt) =>
        this.prisma.event.create({
          data: {
            teamId,
            type: data.type,
            startsAt,
            location: data.location,
            notes: data.notes ?? null,
            opponentName,
            venue,
            recurrenceId,
          },
        }),
      ),
    );
    const eventIds = events.map((e) => e.id);
    const { rsvpStatuses, convokedEventIds } = await this.resolveMyEventState(
      teamId,
      userId,
      eventIds,
    );
    // A freshly created event never has a jersey/ball assignee yet (those
    // columns aren't part of create data), so there's nothing to resolve —
    // an empty map short-circuits every lookup in toTeamEvent to null.
    return events.map((e) =>
      this.toTeamEvent(e, rsvpStatuses.get(e.id) ?? null, convokedEventIds.has(e.id), new Map()),
    );
  }

  // A recurring create is materialized as one independent Event row per
  // week, rather than a stored rule expanded at read time — occurrences
  // share a recurrenceId (see createEvent) so they can still be bulk
  // edited/deleted as a group via updateEvent/deleteEvent's scope param.
  private buildOccurrences(startsAt: string, recurrence?: EventRecurrenceRequest): Date[] {
    const start = new Date(startsAt);
    if (!recurrence) {
      return [start];
    }

    const until = new Date(recurrence.until);
    if (until < start) {
      throw new BadRequestException(
        'La date de fin de récurrence doit être postérieure à la date de début',
      );
    }

    const occurrences: Date[] = [];
    for (
      let current = start;
      current <= until && occurrences.length < MAX_RECURRING_OCCURRENCES;
      current = new Date(current.getTime() + WEEK_IN_MS)
    ) {
      occurrences.push(current);
    }
    return occurrences;
  }

  async updateEvent(
    clubId: string,
    teamId: string,
    eventId: string,
    data: {
      type?: EventType;
      startsAt?: string;
      location?: string;
      notes?: string;
      opponentName?: string;
      venue?: EventVenue;
      scope?: EventUpdateScope;
    },
    userId: string,
  ): Promise<TeamEvent[]> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const scope = data.scope ?? 'THIS';

    if (scope !== 'THIS' && !event.recurrenceId) {
      throw new BadRequestException("Cet événement ne fait pas partie d'une série récurrente");
    }
    if (scope !== 'THIS' && data.startsAt !== undefined) {
      throw new BadRequestException('La date ne peut être modifiée que pour cet événement seul');
    }

    const resultingType = data.type ?? event.type;
    const resultingOpponent =
      data.opponentName !== undefined ? data.opponentName : event.opponentName;
    if (resultingType === EventType.MATCH && !resultingOpponent) {
      throw new BadRequestException("Le nom de l'adversaire est requis pour un match");
    }
    const resultingVenue = data.venue !== undefined ? data.venue : event.venue;
    if (resultingType === EventType.MATCH && !resultingVenue) {
      throw new BadRequestException('Le domicile/extérieur est requis pour un match');
    }

    const ids = scope === 'THIS' ? [eventId] : await this.resolveScopeIds(teamId, event, scope);

    const updateData: Prisma.EventUpdateInput = {
      ...(data.startsAt !== undefined ? { startsAt: new Date(data.startsAt) } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      // Switching to TRAINING always clears the opponent, even if one was
      // also passed in the same request — there's nothing sensible to keep
      // it for once the event isn't a match. Skipped when it's already
      // null, so a plain training-event edit doesn't touch the column.
      ...(resultingType === EventType.TRAINING && event.opponentName !== null
        ? { opponentName: null }
        : resultingType === EventType.MATCH && data.opponentName !== undefined
          ? { opponentName: data.opponentName }
          : {}),
      // Same rule as opponentName above, applied to venue.
      ...(resultingType === EventType.TRAINING && event.venue !== null
        ? { venue: null }
        : resultingType === EventType.MATCH && data.venue !== undefined
          ? { venue: data.venue }
          : {}),
    };

    const updated = await this.prisma.$transaction(
      ids.map((id) => this.prisma.event.update({ where: { id }, data: updateData })),
    );
    const updatedIds = updated.map((e) => e.id);
    const { rsvpStatuses, convokedEventIds } = await this.resolveMyEventState(
      teamId,
      userId,
      updatedIds,
    );
    const logisticsAssignees = await this.resolveLogisticsAssignees(updated);
    return updated.map((e) =>
      this.toTeamEvent(
        e,
        rsvpStatuses.get(e.id) ?? null,
        convokedEventIds.has(e.id),
        logisticsAssignees,
      ),
    );
  }

  async deleteEvent(
    clubId: string,
    teamId: string,
    eventId: string,
    scope: EventUpdateScope = 'THIS',
  ): Promise<void> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);

    if (scope !== 'THIS' && !event.recurrenceId) {
      throw new BadRequestException("Cet événement ne fait pas partie d'une série récurrente");
    }

    const ids = scope === 'THIS' ? [eventId] : await this.resolveScopeIds(teamId, event, scope);
    await this.prisma.event.deleteMany({ where: { id: { in: ids } } });
  }

  // Bulk-changes only hour/minute across a series, leaving each occurrence's
  // own date untouched — the narrower counterpart to updateEvent's full
  // startsAt replace (which stays THIS-only). hour/minute are UTC by
  // contract with the frontend; see UpdateEventTimeOfDayRequest's JSDoc in
  // @basketeasy/types/events for the full rationale.
  async updateEventTimeOfDay(
    clubId: string,
    teamId: string,
    eventId: string,
    data: {
      scope: Extract<EventUpdateScope, 'THIS_AND_FUTURE' | 'ALL'>;
      hour: number;
      minute: number;
    },
    userId: string,
  ): Promise<TeamEvent[]> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    if (!event.recurrenceId) {
      throw new BadRequestException("Cet événement ne fait pas partie d'une série récurrente");
    }

    const ids = await this.resolveScopeIds(teamId, event, data.scope);
    const rows = await this.prisma.event.findMany({ where: { id: { in: ids } } });

    const updated = await this.prisma.$transaction(
      rows.map((row) => {
        const startsAt = new Date(row.startsAt);
        startsAt.setUTCHours(data.hour, data.minute, 0, 0);
        return this.prisma.event.update({ where: { id: row.id }, data: { startsAt } });
      }),
    );
    const updatedIds = updated.map((e) => e.id);
    const { rsvpStatuses, convokedEventIds } = await this.resolveMyEventState(
      teamId,
      userId,
      updatedIds,
    );
    const logisticsAssignees = await this.resolveLogisticsAssignees(updated);
    return updated.map((e) =>
      this.toTeamEvent(
        e,
        rsvpStatuses.get(e.id) ?? null,
        convokedEventIds.has(e.id),
        logisticsAssignees,
      ),
    );
  }

  // Self-service only: the caller can only ever set/clear their own
  // TeamPlayer's status, resolved from player.userId — never an arbitrary
  // teamPlayerId from the request. Mirrors assertEventInTeam's re-verify
  // pattern rather than trusting the route params alone.
  //
  // The resulting myRsvpStatus is already known from the write itself (it's
  // exactly `status`), and the event row doesn't change from the write —
  // so this only needs one extra read (the caller's convocation flag)
  // rather than re-validating the event and re-resolving the caller's
  // TeamPlayer a second time through a shared helper, which used to turn a
  // single RSVP write into ~9 DB round trips.
  async setMyRsvp(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    status: EventRsvpStatus,
  ): Promise<TeamEvent> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const teamPlayer = await this.findMyTeamPlayer(teamId, userId);
    if (!teamPlayer) {
      throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
    }
    await this.prisma.eventRsvp.upsert({
      where: { eventId_teamPlayerId: { eventId, teamPlayerId: teamPlayer.id } },
      create: { eventId, teamPlayerId: teamPlayer.id, status, respondedAt: new Date() },
      update: { status, respondedAt: new Date() },
    });
    const myConvocation = await this.isConvoked(eventId, teamPlayer.id);
    const logisticsAssignees = await this.resolveLogisticsAssignees([event]);
    return this.toTeamEvent(event, status, myConvocation, logisticsAssignees);
  }

  // Same round-trip-avoiding shape as setMyRsvp above — myRsvpStatus is
  // known to be null after a clear, no need to re-read it.
  async clearMyRsvp(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<TeamEvent> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const teamPlayer = await this.findMyTeamPlayer(teamId, userId);
    if (!teamPlayer) {
      throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
    }
    await this.prisma.eventRsvp.deleteMany({
      where: { eventId, teamPlayerId: teamPlayer.id },
    });
    const myConvocation = await this.isConvoked(eventId, teamPlayer.id);
    const logisticsAssignees = await this.resolveLogisticsAssignees([event]);
    return this.toTeamEvent(event, null, myConvocation, logisticsAssignees);
  }

  // Full roster (not just responders) so managers/teammates see who hasn't
  // answered yet, not only who has.
  async listEventRsvps(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<EventRsvpRosterEntry[]> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    const roster = await this.prisma.teamPlayer.findMany({
      where: { teamId },
      include: { player: true, rsvps: { where: { eventId } } },
      orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
    });
    return roster.map((tp) => ({
      teamPlayerId: tp.id,
      playerId: tp.playerId,
      firstName: tp.player.firstName,
      lastName: tp.player.lastName,
      role: tp.role,
      status: tp.rsvps[0]?.status ?? null,
      respondedAt: tp.rsvps[0]?.respondedAt.toISOString() ?? null,
      isMe: tp.player.userId === userId,
    }));
  }

  // Full replace: every id in teamPlayerIds ends up convoked, every other
  // roster member on this event ends up not convoked — a coach fills out
  // the whole call-up list in one submit rather than toggling players one
  // at a time. An empty array clears the list back to nobody. Independent
  // of EventRsvp — never reads or writes RSVP state.
  async setEventConvocations(
    clubId: string,
    teamId: string,
    eventId: string,
    teamPlayerIds: string[],
    userId: string,
  ): Promise<EventConvocationRosterEntry[]> {
    await this.assertEventInTeam(clubId, teamId, eventId);

    if (teamPlayerIds.length > 0) {
      const rosterCount = await this.prisma.teamPlayer.count({
        where: { id: { in: teamPlayerIds }, teamId },
      });
      if (rosterCount !== teamPlayerIds.length) {
        throw new BadRequestException(
          "Un ou plusieurs joueurs ne font pas partie de l'effectif de cette équipe",
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.eventConvocation.deleteMany({
        where: { eventId, teamPlayerId: { notIn: teamPlayerIds } },
      }),
      ...teamPlayerIds.map((teamPlayerId) =>
        this.prisma.eventConvocation.upsert({
          where: { eventId_teamPlayerId: { eventId, teamPlayerId } },
          create: { eventId, teamPlayerId },
          update: {},
        }),
      ),
    ]);

    // No re-assertEventInTeam here — already verified above in this same
    // call, unlike listEventConvocations's own public entry point.
    return this.fetchConvocationRoster(teamId, eventId, userId);
  }

  // Full roster (not just convoked players) so a manager sees who they
  // haven't picked yet — same shape as listEventRsvps.
  async listEventConvocations(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<EventConvocationRosterEntry[]> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    return this.fetchConvocationRoster(teamId, eventId, userId);
  }

  // Self-service: any rostered member may assign themself or clear their
  // own assignment. Assigning or clearing SOMEONE ELSE requires the same
  // manager check TeamManagerGuard already encodes (club ADMIN of a linked
  // club, or TeamAdmin of this team) — reused via the guard's own
  // isTeamManager method rather than duplicated here.
  async setEventLogistics(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    field: EventLogisticsField,
    teamPlayerId: string | null,
  ): Promise<TeamEvent> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    if (event.type !== EventType.MATCH) {
      throw new BadRequestException('La logistique ne concerne que les matchs');
    }
    const myTeamPlayer = await this.findMyTeamPlayer(teamId, userId);
    const currentValue = field === 'JERSEYS' ? event.jerseysTeamPlayerId : event.ballsTeamPlayerId;

    const isSelfAction = teamPlayerId
      ? teamPlayerId === myTeamPlayer?.id
      : currentValue === myTeamPlayer?.id;
    if (!isSelfAction && !(await this.teamManagerGuard.isTeamManager(clubId, teamId, userId))) {
      throw new ForbiddenException("Vous ne pouvez pas modifier l'affectation d'un·e autre membre");
    }
    if (teamPlayerId) {
      const onRoster = await this.prisma.teamPlayer.findFirst({
        where: { id: teamPlayerId, teamId },
      });
      if (!onRoster) {
        throw new BadRequestException("Ce membre n'est pas inscrit sur l'effectif de cette équipe");
      }
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data:
        field === 'JERSEYS'
          ? { jerseysTeamPlayerId: teamPlayerId }
          : { ballsTeamPlayerId: teamPlayerId },
    });
    const { rsvpStatuses, convokedEventIds } = await this.resolveMyEventState(teamId, userId, [
      eventId,
    ]);
    const logisticsAssignees = await this.resolveLogisticsAssignees([updated]);
    return this.toTeamEvent(
      updated,
      rsvpStatuses.get(eventId) ?? null,
      convokedEventIds.has(eventId),
      logisticsAssignees,
    );
  }

  private async fetchConvocationRoster(
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<EventConvocationRosterEntry[]> {
    const roster = await this.prisma.teamPlayer.findMany({
      where: { teamId },
      include: { player: true, convocations: { where: { eventId } } },
      orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
    });
    return roster.map((tp) => ({
      teamPlayerId: tp.id,
      playerId: tp.playerId,
      firstName: tp.player.firstName,
      lastName: tp.player.lastName,
      role: tp.role,
      convoked: tp.convocations.length > 0,
      convokedAt: tp.convocations[0]?.convokedAt.toISOString() ?? null,
      isMe: tp.player.userId === userId,
    }));
  }

  // Resolves the display name for every distinct non-null jersey/ball
  // assignee across a batch of events in one query, rather than one lookup
  // per event — same batching shape as resolveMyEventState above.
  private async resolveLogisticsAssignees(
    events: Pick<EventRow, 'jerseysTeamPlayerId' | 'ballsTeamPlayerId'>[],
  ): Promise<Map<string, EventLogisticsAssignee>> {
    const teamPlayerIds = new Set<string>();
    for (const event of events) {
      if (event.jerseysTeamPlayerId) {
        teamPlayerIds.add(event.jerseysTeamPlayerId);
      }
      if (event.ballsTeamPlayerId) {
        teamPlayerIds.add(event.ballsTeamPlayerId);
      }
    }
    if (teamPlayerIds.size === 0) {
      return new Map();
    }
    const teamPlayers = await this.prisma.teamPlayer.findMany({
      where: { id: { in: Array.from(teamPlayerIds) } },
      include: { player: true },
    });
    return new Map(
      teamPlayers.map((tp) => [
        tp.id,
        { teamPlayerId: tp.id, firstName: tp.player.firstName, lastName: tp.player.lastName },
      ]),
    );
  }

  private async findMyTeamPlayer(teamId: string, userId: string) {
    return this.prisma.teamPlayer.findFirst({ where: { teamId, player: { userId } } });
  }

  private async isConvoked(eventId: string, teamPlayerId: string): Promise<boolean> {
    const convocation = await this.prisma.eventConvocation.findUnique({
      where: { eventId_teamPlayerId: { eventId, teamPlayerId } },
    });
    return convocation !== null;
  }

  // Resolves the acting user's own RSVP status and convocation flag for a
  // bounded set of events on one team, in at most three queries total
  // (one findMyTeamPlayer shared by both, plus one findMany per concern)
  // regardless of how many event ids are passed — never one query per event
  // (see RSVP spec's Scope: no per-event aggregate embedded in TeamEvent).
  private async resolveMyEventState(
    teamId: string,
    userId: string,
    eventIds: string[],
  ): Promise<{ rsvpStatuses: Map<string, EventRsvpStatus>; convokedEventIds: Set<string> }> {
    if (eventIds.length === 0) {
      return { rsvpStatuses: new Map(), convokedEventIds: new Set() };
    }
    const teamPlayer = await this.findMyTeamPlayer(teamId, userId);
    if (!teamPlayer) {
      return { rsvpStatuses: new Map(), convokedEventIds: new Set() };
    }
    const [rsvps, convocations] = await Promise.all([
      this.prisma.eventRsvp.findMany({
        where: { teamPlayerId: teamPlayer.id, eventId: { in: eventIds } },
      }),
      this.prisma.eventConvocation.findMany({
        where: { teamPlayerId: teamPlayer.id, eventId: { in: eventIds } },
      }),
    ]);
    return {
      rsvpStatuses: new Map(rsvps.map((r) => [r.eventId, r.status])),
      convokedEventIds: new Set(convocations.map((c) => c.eventId)),
    };
  }

  // Resolves the set of event ids a THIS_AND_FUTURE/ALL scope applies to:
  // every row sharing the target event's recurrenceId, additionally bounded
  // to startsAt >= the target's own startsAt for THIS_AND_FUTURE.
  private async resolveScopeIds(
    teamId: string,
    event: { recurrenceId: string | null; startsAt: Date },
    scope: EventUpdateScope,
  ): Promise<string[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        teamId,
        recurrenceId: event.recurrenceId,
        ...(scope === 'THIS_AND_FUTURE' ? { startsAt: { gte: event.startsAt } } : {}),
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async assertTeamInClub(clubId: string, teamId: string): Promise<void> {
    const clubTeam = await this.prisma.clubTeam.findUnique({
      where: { clubId_teamId: { clubId, teamId } },
    });
    if (!clubTeam) {
      throw new NotFoundException('Team not found');
    }
  }

  // Re-verifies both that the team belongs to clubId and that the event
  // belongs to that team, so an admin of club A can't mutate an event that
  // lives on a team not linked to their club. Returns the row (rather than
  // just confirming it exists) since callers need its type/opponentName/
  // recurrenceId/startsAt to validate and resolve scope.
  private async assertEventInTeam(
    clubId: string,
    teamId: string,
    eventId: string,
  ): Promise<EventRow> {
    await this.assertTeamInClub(clubId, teamId);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.teamId !== teamId) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  private toTeamEvent(
    event: EventRow,
    myRsvpStatus: EventRsvpStatus | null,
    myConvocation: boolean,
    logisticsAssignees: Map<string, EventLogisticsAssignee>,
  ): TeamEvent {
    return {
      id: event.id,
      teamId: event.teamId,
      type: event.type,
      startsAt: event.startsAt.toISOString(),
      location: event.location,
      notes: event.notes,
      opponentName: event.opponentName,
      venue: event.venue,
      recurrenceId: event.recurrenceId,
      createdAt: event.createdAt.toISOString(),
      isImported: event.externalId !== null,
      timeConfirmed: event.timeConfirmed,
      myRsvpStatus,
      myConvocation,
      logistics:
        event.type === EventType.MATCH
          ? {
              jerseys: event.jerseysTeamPlayerId
                ? (logisticsAssignees.get(event.jerseysTeamPlayerId) ?? null)
                : null,
              balls: event.ballsTeamPlayerId
                ? (logisticsAssignees.get(event.ballsTeamPlayerId) ?? null)
                : null,
            }
          : null,
    };
  }
}
