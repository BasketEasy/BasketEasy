import { Injectable } from '@nestjs/common';
import type {
  EventLogisticsAssignee,
  EventRsvpStatus,
  EventRsvpSummary,
  EventType,
  EventVenue,
} from '@basketeasy/types/events';
import type { MyAgendaEvent, MyDashboardSummary } from '@basketeasy/types/my-dashboard';
import { PrismaService } from '../prisma/prisma.service';
import { computeEventRsvpSummaries } from '../common/event-rsvp-summary';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_AGENDA_WINDOW_DAYS = 7;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // Direct Prisma queries rather than reaching into TeamsService/EventsService
  // internals — CLAUDE.md's Events section notes the codebase's established
  // convention is for each module to re-verify/re-derive what it needs rather
  // than importing across modules.
  async getDashboard(userId: string, from?: string, to?: string): Promise<MyDashboardSummary> {
    const range = this.resolveRange(from, to);

    const [adminMemberships, allMemberships, adminGrants, rosterEntries] = await Promise.all([
      this.prisma.clubMembership.findMany({
        where: { userId, role: 'ADMIN' },
        select: { clubId: true },
      }),
      this.prisma.clubMembership.findMany({ where: { userId }, select: { clubId: true } }),
      this.prisma.teamAdmin.findMany({ where: { userId }, select: { teamId: true } }),
      this.prisma.teamPlayer.findMany({
        where: { player: { userId } },
        select: { id: true, teamId: true },
      }),
    ]);

    const adminClubIds = adminMemberships.map((m) => m.clubId);
    const memberClubIds = new Set(allMemberships.map((m) => m.clubId));
    const teamIds = Array.from(
      new Set([...adminGrants.map((g) => g.teamId), ...rosterEntries.map((r) => r.teamId)]),
    );
    // Any of the caller's own TeamPlayer rows is enough to resolve their
    // RSVP/convocation state for an event on that row's team.
    const teamPlayerIds = rosterEntries.map((r) => r.id);

    const [totalPlayers, events] = await Promise.all([
      adminClubIds.length > 0
        ? this.prisma.player.count({ where: { clubId: { in: adminClubIds } } })
        : Promise.resolve(0),
      teamIds.length > 0
        ? this.prisma.event.findMany({
            where: { teamId: { in: teamIds }, startsAt: { gte: range.from, lte: range.to } },
            include: {
              team: {
                include: {
                  clubTeams: {
                    include: { club: true },
                    orderBy: [{ isOwner: 'desc' as const }, { createdAt: 'asc' as const }],
                  },
                },
              },
            },
            orderBy: { startsAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const eventIds = events.map((e) => e.id);
    const [rsvps, convocations] =
      teamPlayerIds.length > 0 && eventIds.length > 0
        ? await Promise.all([
            this.prisma.eventRsvp.findMany({
              where: { teamPlayerId: { in: teamPlayerIds }, eventId: { in: eventIds } },
            }),
            this.prisma.eventConvocation.findMany({
              where: { teamPlayerId: { in: teamPlayerIds }, eventId: { in: eventIds } },
            }),
          ])
        : [[], []];
    const rsvpStatuses = new Map(rsvps.map((r) => [r.eventId, r.status as EventRsvpStatus]));
    const convokedEventIds = new Set(convocations.map((c) => c.eventId));

    const [rsvpSummaries, logisticsAssignees] = await Promise.all([
      this.resolveEventRosterSummaries(teamIds, events),
      this.resolveLogisticsAssignees(events),
    ]);

    return {
      totalPlayers,
      upcomingEvents: events.map((event) =>
        this.toAgendaEvent(
          event,
          memberClubIds,
          rsvpStatuses.get(event.id) ?? null,
          convokedEventIds.has(event.id),
          this.rsvpSummaryOrZero(event.id, rsvpSummaries),
          logisticsAssignees,
        ),
      ),
    };
  }

  // Whole-roster RSVP/convocation aggregate for a batch of events that can
  // span *several* teams (unlike EventsService's equivalent, which always
  // has one team in hand): one teamPlayer.groupBy for every team's roster
  // size at once, plus one findMany per concern, unscoped by teamPlayerId
  // (the caller's own RSVP/convocation state above already needed that
  // scoping; this wants everyone's). Three queries total, regardless of how
  // many events or teams are in the batch — same bounded shape as
  // EventsService.resolveEventRosterSummaries, adapted for a multi-team
  // agenda instead of one team's event list. See computeEventRsvpSummaries
  // for the shared per-event math (ported from
  // app/src/clubs/useEventRoster.ts's countEventRoster).
  private async resolveEventRosterSummaries(
    teamIds: string[],
    events: { id: string; teamId: string }[],
  ): Promise<Map<string, EventRsvpSummary>> {
    const eventIds = events.map((e) => e.id);
    if (eventIds.length === 0) {
      return new Map();
    }
    const [rosterCounts, rsvps, convocations] = await Promise.all([
      this.prisma.teamPlayer.groupBy({
        by: ['teamId'],
        where: { teamId: { in: teamIds } },
        _count: { _all: true },
      }),
      this.prisma.eventRsvp.findMany({
        where: { eventId: { in: eventIds } },
        select: { eventId: true, teamPlayerId: true, status: true },
      }),
      this.prisma.eventConvocation.findMany({
        where: { eventId: { in: eventIds } },
        select: { eventId: true, teamPlayerId: true },
      }),
    ]);
    const rosterSizeByTeamId = new Map(rosterCounts.map((r) => [r.teamId, r._count._all]));
    const rosterSizeByEventId = new Map(
      events.map((e) => [e.id, rosterSizeByTeamId.get(e.teamId) ?? 0]),
    );
    return computeEventRsvpSummaries(eventIds, rosterSizeByEventId, rsvps, convocations);
  }

  // Same fallback reasoning as EventsService's twin: every id passed to
  // resolveEventRosterSummaries gets an entry (its own eventIds.length === 0
  // short-circuit aside), so this only spares call sites a non-null
  // assertion for a case that can't happen.
  private rsvpSummaryOrZero(
    eventId: string,
    summaries: Map<string, EventRsvpSummary>,
  ): EventRsvpSummary {
    return (
      summaries.get(eventId) ?? {
        rosterSize: 0,
        convoked: 0,
        answering: 0,
        going: 0,
        maybe: 0,
        notGoing: 0,
        pending: 0,
        isConvocationScoped: false,
      }
    );
  }

  // Identical to EventsService.resolveLogisticsAssignees — teamPlayer ids
  // are globally unique, so this needs no team-scoping and duplicates
  // cleanly across modules rather than importing across them, matching this
  // codebase's established re-derive-rather-than-import convention (see
  // CLAUDE.md's Events module section).
  private async resolveLogisticsAssignees(
    events: { jerseysTeamPlayerId: string | null; ballsTeamPlayerId: string | null }[],
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

  private resolveRange(from?: string, to?: string): { from: Date; to: Date } {
    const fromDate = from ? new Date(from) : new Date();
    const toDate = to
      ? new Date(to)
      : new Date(fromDate.getTime() + DEFAULT_AGENDA_WINDOW_DAYS * DAY_IN_MS);
    return { from: fromDate, to: toDate };
  }

  private toAgendaEvent(
    event: {
      id: string;
      teamId: string;
      type: EventType;
      startsAt: Date;
      location: string;
      notes: string | null;
      opponentName: string | null;
      venue: EventVenue | null;
      recurrenceId: string | null;
      externalId: string | null;
      timeConfirmed: boolean;
      jerseysTeamPlayerId: string | null;
      ballsTeamPlayerId: string | null;
      team: { name: string; clubTeams: { club: { id: string; name: string } }[] };
    },
    memberClubIds: Set<string>,
    myRsvpStatus: EventRsvpStatus | null,
    myConvocation: boolean,
    rsvpSummary: EventRsvpSummary,
    logisticsAssignees: Map<string, EventLogisticsAssignee>,
  ): MyAgendaEvent {
    // Prefer the club the caller actually belongs to (see
    // TeamsService.toMyTeamSummary for the same navigation-safety reasoning),
    // falling back to the owner-first-sorted first club defensively.
    const club =
      event.team.clubTeams.find((ct) => memberClubIds.has(ct.club.id))?.club ??
      event.team.clubTeams[0].club;
    return {
      eventId: event.id,
      teamId: event.teamId,
      teamName: event.team.name,
      clubId: club.id,
      clubName: club.name,
      type: event.type,
      startsAt: event.startsAt.toISOString(),
      location: event.location,
      notes: event.notes,
      opponentName: event.opponentName,
      venue: event.venue,
      recurrenceId: event.recurrenceId,
      myRsvpStatus,
      myConvocation,
      rsvpSummary,
      // Same derivation EventsService uses, not a stored column — see
      // schema.prisma's comment on Event.externalId.
      isImported: event.externalId !== null,
      timeConfirmed: event.timeConfirmed,
      logistics: {
        jerseys: event.jerseysTeamPlayerId
          ? (logisticsAssignees.get(event.jerseysTeamPlayerId) ?? null)
          : null,
        balls: event.ballsTeamPlayerId
          ? (logisticsAssignees.get(event.ballsTeamPlayerId) ?? null)
          : null,
      },
    };
  }
}
