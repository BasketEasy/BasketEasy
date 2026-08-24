import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventRsvpStatus, EventType, Prisma } from '@prisma/client';
import type {
  EventRecurrenceRequest,
  EventRsvpRosterEntry,
  EventUpdateScope,
  TeamEvent,
} from '@basketeasy/types/events';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { PrismaService } from '../prisma/prisma.service';
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
  recurrenceId: string | null;
  createdAt: Date;
};

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const myStatuses = await this.resolveMyRsvpStatuses(
      teamId,
      userId,
      events.map((e) => e.id),
    );
    return {
      items: events.map((e) => this.toTeamEvent(e, myStatuses.get(e.id) ?? null)),
      total,
      page,
      pageSize,
    };
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
      recurrence?: EventRecurrenceRequest;
    },
    userId: string,
  ): Promise<TeamEvent[]> {
    await this.assertTeamInClub(clubId, teamId);
    if (data.type === EventType.MATCH && !data.opponentName) {
      throw new BadRequestException("Le nom de l'adversaire est requis pour un match");
    }

    const occurrences = this.buildOccurrences(data.startsAt, data.recurrence);
    // One recurrenceId is shared by every row in this batch — only when the
    // caller actually asked for recurrence — so a plain single event stays
    // un-grouped, same as before this feature existed.
    const recurrenceId = data.recurrence ? randomUUID() : null;
    const opponentName = data.type === EventType.MATCH ? (data.opponentName ?? null) : null;

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
            recurrenceId,
          },
        }),
      ),
    );
    const myStatuses = await this.resolveMyRsvpStatuses(
      teamId,
      userId,
      events.map((e) => e.id),
    );
    return events.map((e) => this.toTeamEvent(e, myStatuses.get(e.id) ?? null));
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
    };

    const updated = await this.prisma.$transaction(
      ids.map((id) => this.prisma.event.update({ where: { id }, data: updateData })),
    );
    const myStatuses = await this.resolveMyRsvpStatuses(
      teamId,
      userId,
      updated.map((e) => e.id),
    );
    return updated.map((e) => this.toTeamEvent(e, myStatuses.get(e.id) ?? null));
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
    const myStatuses = await this.resolveMyRsvpStatuses(
      teamId,
      userId,
      updated.map((e) => e.id),
    );
    return updated.map((e) => this.toTeamEvent(e, myStatuses.get(e.id) ?? null));
  }

  // Self-service only: the caller can only ever set/clear their own
  // TeamPlayer's status, resolved from player.userId — never an arbitrary
  // teamPlayerId from the request. Mirrors assertEventInTeam's re-verify
  // pattern rather than trusting the route params alone.
  async setMyRsvp(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
    status: EventRsvpStatus,
  ): Promise<TeamEvent> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    const teamPlayer = await this.findMyTeamPlayer(teamId, userId);
    if (!teamPlayer) {
      throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
    }
    await this.prisma.eventRsvp.upsert({
      where: { eventId_teamPlayerId: { eventId, teamPlayerId: teamPlayer.id } },
      create: { eventId, teamPlayerId: teamPlayer.id, status, respondedAt: new Date() },
      update: { status, respondedAt: new Date() },
    });
    return this.getEventForUser(clubId, teamId, eventId, userId);
  }

  async clearMyRsvp(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<TeamEvent> {
    await this.assertEventInTeam(clubId, teamId, eventId);
    const teamPlayer = await this.findMyTeamPlayer(teamId, userId);
    if (!teamPlayer) {
      throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
    }
    await this.prisma.eventRsvp.deleteMany({
      where: { eventId, teamPlayerId: teamPlayer.id },
    });
    return this.getEventForUser(clubId, teamId, eventId, userId);
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

  private async findMyTeamPlayer(teamId: string, userId: string) {
    return this.prisma.teamPlayer.findFirst({ where: { teamId, player: { userId } } });
  }

  private async getEventForUser(
    clubId: string,
    teamId: string,
    eventId: string,
    userId: string,
  ): Promise<TeamEvent> {
    const event = await this.assertEventInTeam(clubId, teamId, eventId);
    const myStatuses = await this.resolveMyRsvpStatuses(teamId, userId, [eventId]);
    return this.toTeamEvent(event, myStatuses.get(eventId) ?? null);
  }

  // Resolves the acting user's own RSVP status for a bounded set of events
  // on one team, in at most two queries regardless of how many event ids
  // are passed — never one query per event (see spec's Scope: no per-event
  // aggregate embedded in TeamEvent).
  private async resolveMyRsvpStatuses(
    teamId: string,
    userId: string,
    eventIds: string[],
  ): Promise<Map<string, EventRsvpStatus>> {
    if (eventIds.length === 0) {
      return new Map();
    }
    const teamPlayer = await this.findMyTeamPlayer(teamId, userId);
    if (!teamPlayer) {
      return new Map();
    }
    const rsvps = await this.prisma.eventRsvp.findMany({
      where: { teamPlayerId: teamPlayer.id, eventId: { in: eventIds } },
    });
    return new Map(rsvps.map((r) => [r.eventId, r.status]));
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

  private toTeamEvent(event: EventRow, myRsvpStatus: EventRsvpStatus | null): TeamEvent {
    return {
      id: event.id,
      teamId: event.teamId,
      type: event.type,
      startsAt: event.startsAt.toISOString(),
      location: event.location,
      notes: event.notes,
      opponentName: event.opponentName,
      recurrenceId: event.recurrenceId,
      createdAt: event.createdAt.toISOString(),
      myRsvpStatus,
    };
  }
}
