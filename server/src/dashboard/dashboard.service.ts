import { Injectable } from '@nestjs/common';
import type {
  EventLogisticsAssignee,
  EventMatchPlayerStats,
  EventMatchResult,
  EventRsvpStatus,
  EventRsvpSummary,
  EventType,
  EventVenue,
} from '@basketeasy/types/events';
import type { EventMeetingPlan, EventTravelMode } from '@basketeasy/types/meeting-points';
import type {
  ActionItem,
  MyAgendaEvent,
  MyAgendaVote,
  MyDashboardSummary,
} from '@basketeasy/types/my-dashboard';
import { PrismaService } from '../prisma/prisma.service';
import { computeEventRsvpSummaries } from '../common/event-rsvp-summary';
import { asParsedScoresheetData } from '../common/parsed-scoresheet-data';
import { deriveMatchResult } from '../common/match-result';
import { assertCanActForPlayer } from '../common/acting-as';
import { RSVP_RESPONDENT_SELECT, toRsvpRespondent } from '../common/rsvp-respondent';
import { voteClosesAt, voteOpensAt } from '../common/vote-window';
import { MeetingPointsService } from '../meeting-points/meeting-points.service';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_AGENDA_WINDOW_DAYS = 7;
// Phase 9's four "à traiter" windows — each independent of the agenda
// from/to params the caller may have sent (those shape upcomingEvents, not
// this), so a player's 14-day window or the manager's plain 7-day default
// never accidentally widens or narrows what counts as "imminent" here.
const ACTION_ITEM_CONVOCATION_WINDOW_DAYS = 7;
const ACTION_ITEM_RSVP_WINDOW_DAYS = 2;
const ACTION_ITEM_PAST_SCORESHEET_WINDOW_DAYS = 14;
const ACTION_ITEM_PLAYERS_WITHOUT_ACCOUNT_LIMIT = 5;
// Across all four kinds combined — never an unpaginated list. Prioritized in
// the order the kinds are built: convocations, then pending RSVPs, then
// unconfirmed scoresheets, then accountless players.
const ACTION_ITEM_TOTAL_CAP = 8;

function formatWeekdayLabel(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(date);
}

type DashboardScope = {
  adminClubIds: string[];
  memberClubIds: Set<string>;
  adminGrants: { teamId: string }[];
  rosterEntries: { id: string; teamId: string }[];
  /**
   * The dashboard is read for a child (a guardian persona), not by the
   * player themself: votes stay the player's own (guardian design decision 9),
   * so such a reader never gets a vote to cast.
   */
  isGuardianPersona: boolean;
};

type VoteRow = {
  eventId: string;
  category: 'BEST' | 'WORST';
  voterTeamPlayerId: string;
  votedTeamPlayerId: string;
};

type ActionItemEventTeam = { name: string; clubTeams: { club: { id: string; name: string } }[] };
type ActionItemEvent = {
  id: string;
  teamId: string;
  type: EventType;
  startsAt: Date;
  opponentName: string | null;
  team: ActionItemEventTeam;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meetingPoints: MeetingPointsService,
  ) {}

  // Direct Prisma queries rather than reaching into TeamsService/EventsService
  // internals — CLAUDE.md's Events section notes the codebase's established
  // convention is for each module to re-verify/re-derive what it needs rather
  // than importing across modules.
  async getDashboard(
    userId: string,
    from?: string,
    to?: string,
    forPlayerId?: string,
  ): Promise<MyDashboardSummary> {
    const range = this.resolveRange(from, to);

    const { adminClubIds, memberClubIds, adminGrants, rosterEntries, isGuardianPersona } =
      forPlayerId
        ? await this.resolvePersonaScope(userId, forPlayerId)
        : await this.resolveOwnScope(userId);
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
              include: { respondedBy: RSVP_RESPONDENT_SELECT },
            }),
            this.prisma.eventConvocation.findMany({
              where: { teamPlayerId: { in: teamPlayerIds }, eventId: { in: eventIds } },
            }),
          ])
        : [[], []];
    const rsvpsByEventId = new Map(rsvps.map((r) => [r.eventId, r]));
    const convokedEventIds = new Set(convocations.map((c) => c.eventId));

    const [rsvpSummaries, logisticsAssignees, { resultsByEventId, myStatsByEventId }, plans] =
      await Promise.all([
        this.resolveEventRosterSummaries(teamIds, events),
        this.resolveLogisticsAssignees(events),
        this.resolveMatchResults(events, teamPlayerIds),
        // The same helper EventsService uses, so the RDV time can't differ
        // between the home and the match page.
        this.meetingPoints.resolvePlansAcrossTeams(events),
      ]);
    const votesByEventId = await this.resolveVotes({
      events,
      rosterEntries,
      rsvpsByEventId,
      convokedEventIds,
      rsvpSummaries,
      isGuardianPersona,
    });

    const actionItems = await this.resolveActionItems(
      adminGrants.map((g) => g.teamId),
      adminClubIds,
      memberClubIds,
      events,
      rsvpSummaries,
    );

    return {
      totalPlayers,
      upcomingEvents: events.map((event) =>
        this.toAgendaEvent(
          event,
          memberClubIds,
          rsvpsByEventId.get(event.id) ?? null,
          userId,
          convokedEventIds.has(event.id),
          this.rsvpSummaryOrZero(event.id, rsvpSummaries),
          logisticsAssignees,
          resultsByEventId.get(event.id) ?? null,
          myStatsByEventId.get(event.id) ?? null,
          votesByEventId.get(event.id) ?? null,
          plans.get(event.id) ?? null,
        ),
      ),
      actionItems,
    };
  }

  // Everything the caller's own dashboard is scoped by: the clubs they
  // administer or belong to, their TeamAdmin grants, and their roster slots.
  private async resolveOwnScope(userId: string): Promise<DashboardScope> {
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
    return {
      adminClubIds: adminMemberships.map((m) => m.clubId),
      memberClubIds: new Set(allMemberships.map((m) => m.clubId)),
      adminGrants,
      rosterEntries,
      isGuardianPersona: false,
    };
  }

  // The dashboard as a player the caller acts for (a child, or their own
  // player row): that player's roster slots only, answered as them. No
  // manager scope — a guardian link never carries manager rights, so no
  // action items and no club-wide player count. Each agenda row resolves to
  // the player's own club, which is always one of its team's linked clubs and
  // the one @AllowGuardians() accepts when the reader taps through.
  private async resolvePersonaScope(userId: string, playerId: string): Promise<DashboardScope> {
    await assertCanActForPlayer(this.prisma, userId, playerId);
    const player = await this.prisma.player.findUniqueOrThrow({
      where: { id: playerId },
      select: {
        clubId: true,
        userId: true,
        teamPlayers: { select: { id: true, teamId: true } },
      },
    });
    return {
      adminClubIds: [],
      memberClubIds: new Set([player.clubId]),
      adminGrants: [],
      rosterEntries: player.teamPlayers,
      isGuardianPersona: player.userId !== userId,
    };
  }

  // The manager's « À traiter » band (docs/personas.md).
  // Sibling to the three resolvers above, same early-return shape — but
  // gated on "does this caller manage anything" rather than teamIds.length,
  // since teamIds also includes teams the caller is merely rostered on and a
  // plain rostered player must never see this band. adminGrantTeamIds/
  // adminClubIds are exactly what getDashboard already resolved — no new
  // membership query.
  private async resolveActionItems(
    adminGrantTeamIds: string[],
    adminClubIds: string[],
    memberClubIds: Set<string>,
    events: ActionItemEvent[],
    rsvpSummaries: Map<string, EventRsvpSummary>,
  ): Promise<ActionItem[]> {
    if (adminGrantTeamIds.length === 0 && adminClubIds.length === 0) {
      return [];
    }

    const now = new Date();
    // "Admin/TeamAdmin teams" expressed once and reused by both the two
    // fresh queries below (as a Prisma filter) and the JS filter over the
    // already-fetched `events` batch for EVENT_PENDING_RSVPS — a team the
    // caller merely plays on, with no admin role anywhere, matches neither.
    const managedTeamFilter = {
      OR: [
        { teamId: { in: adminGrantTeamIds } },
        { team: { clubTeams: { some: { clubId: { in: adminClubIds } } } } },
      ],
    };
    const adminGrantTeamIdSet = new Set(adminGrantTeamIds);
    const adminClubIdSet = new Set(adminClubIds);
    const isManagedTeamEvent = (event: ActionItemEvent) =>
      adminGrantTeamIdSet.has(event.teamId) ||
      event.team.clubTeams.some((ct) => adminClubIdSet.has(ct.club.id));

    const eventTeamInclude = {
      team: {
        include: {
          clubTeams: {
            include: { club: true },
            orderBy: [{ isOwner: 'desc' as const }, { createdAt: 'asc' as const }],
          },
        },
      },
    };

    const [matchesWithoutConvocations, matchesWithoutConfirmedScoresheet, playersWithoutAccount] =
      await Promise.all([
        // Kind 1: upcoming MATCHes with zero convocations — filtered in
        // Prisma (`convocations: { none: {} }`), not fetched-then-diffed.
        this.prisma.event.findMany({
          where: {
            type: 'MATCH',
            startsAt: {
              gte: now,
              lte: new Date(now.getTime() + ACTION_ITEM_CONVOCATION_WINDOW_DAYS * DAY_IN_MS),
            },
            convocations: { none: {} },
            ...managedTeamFilter,
          },
          include: eventTeamInclude,
          orderBy: { startsAt: 'asc' },
        }),
        // Kind 3: already-played MATCHes with no CONFIRMED scoresheet.
        // `isNot` on an optional to-one relation matches both "no scoresheet
        // at all" and "a scoresheet that isn't CONFIRMED yet" — exactly the
        // union this item is for.
        this.prisma.event.findMany({
          where: {
            type: 'MATCH',
            startsAt: {
              gte: new Date(now.getTime() - ACTION_ITEM_PAST_SCORESHEET_WINDOW_DAYS * DAY_IN_MS),
              lte: now,
            },
            scoresheet: { isNot: { status: 'CONFIRMED' } },
            ...managedTeamFilter,
          },
          include: eventTeamInclude,
          orderBy: { startsAt: 'desc' },
        }),
        // Kind 4: genuinely unbounded by date, so it needs its own explicit
        // cap rather than a window.
        this.prisma.player.findMany({
          where: { clubId: { in: adminClubIds }, userId: null },
          take: ACTION_ITEM_PLAYERS_WITHOUT_ACCOUNT_LIMIT,
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            club: { select: { id: true, name: true } },
          },
        }),
      ]);

    // Kind 2: reuses the roster-wide rsvpSummaries already computed above
    // for this same `events` batch — no second, parallel aggregate query —
    // narrowed here to the tighter ±2-day "imminent" slice and to managed
    // teams only.
    const rsvpWindowEnd = new Date(now.getTime() + ACTION_ITEM_RSVP_WINDOW_DAYS * DAY_IN_MS);
    const eventsPendingRsvp = events.filter(
      (event) =>
        event.startsAt >= now &&
        event.startsAt <= rsvpWindowEnd &&
        isManagedTeamEvent(event) &&
        (rsvpSummaries.get(event.id)?.pending ?? 0) > 0,
    );

    const items: ActionItem[] = [
      ...matchesWithoutConvocations.map((event) =>
        this.toMatchWithoutConvocationsItem(event, memberClubIds),
      ),
      ...eventsPendingRsvp.map((event) =>
        this.toEventPendingRsvpsItem(event, memberClubIds, rsvpSummaries.get(event.id)),
      ),
      ...matchesWithoutConfirmedScoresheet.map((event) =>
        this.toMatchWithoutConfirmedScoresheetItem(event, memberClubIds),
      ),
      ...playersWithoutAccount.map((player) => this.toPlayerWithoutAccountItem(player)),
    ];
    return items.slice(0, ACTION_ITEM_TOTAL_CAP);
  }

  private pickEventClub(
    team: ActionItemEventTeam,
    memberClubIds: Set<string>,
  ): { id: string; name: string } {
    return (
      team.clubTeams.find((ct) => memberClubIds.has(ct.club.id))?.club ?? team.clubTeams[0].club
    );
  }

  private toMatchWithoutConvocationsItem(
    event: ActionItemEvent,
    memberClubIds: Set<string>,
  ): ActionItem {
    const club = this.pickEventClub(event.team, memberClubIds);
    return {
      kind: 'MATCH_WITHOUT_CONVOCATIONS',
      clubId: club.id,
      clubName: club.name,
      teamId: event.teamId,
      teamName: event.team.name,
      eventId: event.id,
      message: `Match contre ${event.opponentName ?? "l'adversaire"} ${formatWeekdayLabel(event.startsAt)} — personne n'a encore été convoqué.`,
    };
  }

  private toEventPendingRsvpsItem(
    event: ActionItemEvent,
    memberClubIds: Set<string>,
    summary: EventRsvpSummary | undefined,
  ): ActionItem {
    const club = this.pickEventClub(event.team, memberClubIds);
    const pending = summary?.pending ?? 0;
    const subject =
      event.type === 'MATCH'
        ? `Match contre ${event.opponentName ?? "l'adversaire"}`
        : 'Entraînement';
    return {
      kind: 'EVENT_PENDING_RSVPS',
      clubId: club.id,
      clubName: club.name,
      teamId: event.teamId,
      teamName: event.team.name,
      eventId: event.id,
      message: `${subject} ${formatWeekdayLabel(event.startsAt)} — ${pending} joueur${pending > 1 ? 's' : ''} n'${pending > 1 ? 'ont' : 'a'} pas encore répondu.`,
    };
  }

  private toMatchWithoutConfirmedScoresheetItem(
    event: ActionItemEvent,
    memberClubIds: Set<string>,
  ): ActionItem {
    const club = this.pickEventClub(event.team, memberClubIds);
    return {
      kind: 'MATCH_WITHOUT_CONFIRMED_SCORESHEET',
      clubId: club.id,
      clubName: club.name,
      teamId: event.teamId,
      teamName: event.team.name,
      eventId: event.id,
      message: `Match contre ${event.opponentName ?? "l'adversaire"} ${formatWeekdayLabel(event.startsAt)} — feuille de match non confirmée.`,
    };
  }

  private toPlayerWithoutAccountItem(player: {
    id: string;
    firstName: string;
    lastName: string;
    club: { id: string; name: string };
  }): ActionItem {
    return {
      kind: 'PLAYERS_WITHOUT_ACCOUNT',
      clubId: player.club.id,
      clubName: player.club.name,
      teamId: null,
      teamName: null,
      eventId: null,
      message: `${player.firstName} ${player.lastName} (${player.club.name}) n'a pas encore de compte Kluvo.`,
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

  // Whole-batch match-result projection, spanning however many teams the
  // agenda covers — cheaper here than EventsService's twin because
  // getDashboard already fetches teamPlayerIds (every TeamPlayer row the
  // caller holds, across every team) for the RSVP resolution above; this
  // reuses it rather than re-deriving a per-team TeamPlayer lookup. Two
  // queries total (one eventScoresheet.findMany scoped to CONFIRMED sheets,
  // one matchPlayerStat.findMany scoped to the caller's own roster rows),
  // regardless of how many events or teams are in the batch. A caller holds
  // at most one TeamPlayer row per team, and one event belongs to one team,
  // so at most one matching stat row can exist per event — no risk of
  // crediting one event with another team's row. See CLAUDE.md's
  // Scoresheets module: only CONFIRMED sheets ever populate a result, so a
  // player never sees an unconfirmed score.
  private async resolveMatchResults(
    events: { id: string; venue: EventVenue | null }[],
    teamPlayerIds: string[],
  ): Promise<{
    resultsByEventId: Map<string, EventMatchResult>;
    myStatsByEventId: Map<string, EventMatchPlayerStats>;
  }> {
    const eventIds = events.map((e) => e.id);
    if (eventIds.length === 0) {
      return { resultsByEventId: new Map(), myStatsByEventId: new Map() };
    }
    const venueByEventId = new Map(events.map((e) => [e.id, e.venue]));
    const [confirmedScoresheets, myStats] = await Promise.all([
      this.prisma.eventScoresheet.findMany({
        where: { eventId: { in: eventIds }, status: 'CONFIRMED' },
        include: { extraction: true },
      }),
      teamPlayerIds.length > 0
        ? this.prisma.matchPlayerStat.findMany({
            where: { eventId: { in: eventIds }, teamPlayerId: { in: teamPlayerIds } },
          })
        : Promise.resolve([]),
    ]);

    const resultsByEventId = new Map<string, EventMatchResult>();
    for (const scoresheet of confirmedScoresheets) {
      const parsedData = asParsedScoresheetData(scoresheet.extraction?.parsedData);
      const result = deriveMatchResult(venueByEventId.get(scoresheet.eventId) ?? null, parsedData);
      if (result) {
        resultsByEventId.set(scoresheet.eventId, result);
      }
    }

    const myStatsByEventId = new Map<string, EventMatchPlayerStats>();
    for (const stat of myStats) {
      myStatsByEventId.set(stat.eventId, { points: stat.points, fouls: stat.fouls });
    }

    return { resultsByEventId, myStatsByEventId };
  }

  // The peer vote on every played match in the batch, bounded: one
  // eventVote.findMany for all of them, plus one teamPlayer.findMany for the
  // winners' names, and only when some MVP is public. The eligible roster
  // size comes from rsvpSummaries (already one groupBy for the batch), the
  // persona's RSVP and convocation from the rows getDashboard already holds.
  //
  // A WORST row is read for its voter only — votesCast counts distinct voters
  // across both categories, matching EventVoteResults — and its nominee is
  // never looked at: « joueur en difficulté » stays on the match page. The
  // voter id is only compared with the persona's own roster slot, never
  // returned, so voting stays anonymous.
  private async resolveVotes({
    events,
    rosterEntries,
    rsvpsByEventId,
    convokedEventIds,
    rsvpSummaries,
    isGuardianPersona,
  }: {
    events: { id: string; teamId: string; type: EventType; startsAt: Date }[];
    rosterEntries: { id: string; teamId: string }[];
    rsvpsByEventId: Map<string, { status: EventRsvpStatus }>;
    convokedEventIds: Set<string>;
    rsvpSummaries: Map<string, EventRsvpSummary>;
    isGuardianPersona: boolean;
  }): Promise<Map<string, MyAgendaVote>> {
    const now = new Date();
    const played = events.filter((e) => e.type === 'MATCH' && e.startsAt <= now);
    if (played.length === 0) {
      return new Map();
    }
    const votes: VoteRow[] = await this.prisma.eventVote.findMany({
      where: { eventId: { in: played.map((e) => e.id) } },
      select: { eventId: true, category: true, voterTeamPlayerId: true, votedTeamPlayerId: true },
    });
    const teamPlayerIdByTeamId = new Map(rosterEntries.map((r) => [r.teamId, r.id]));
    const myTeamPlayerIds = new Set(rosterEntries.map((r) => r.id));

    const drafts = played.map((event) => {
      const eventVotes = votes.filter((v) => v.eventId === event.id);
      const best = eventVotes.filter((v) => v.category === 'BEST');
      const myTeamPlayerId = teamPlayerIdByTeamId.get(event.teamId) ?? null;
      const hasVoted =
        myTeamPlayerId !== null && best.some((v) => v.voterTeamPlayerId === myTeamPlayerId);
      const closesAt = voteClosesAt(event.startsAt);
      const isOpen = now >= voteOpensAt(event.startsAt) && now <= closesAt;
      const canVote =
        isOpen &&
        !isGuardianPersona &&
        myTeamPlayerId !== null &&
        rsvpsByEventId.get(event.id)?.status === 'GOING' &&
        convokedEventIds.has(event.id);
      const isPublic = hasVoted || now > closesAt;
      return {
        event,
        hasVoted,
        canVote,
        closesAt,
        votesCast: new Set(eventVotes.map((v) => v.voterTeamPlayerId)).size,
        winnerIds: isPublic ? topVoted(best) : null,
      };
    });

    const winnerIds = Array.from(new Set(drafts.flatMap((d) => d.winnerIds ?? [])));
    const winners =
      winnerIds.length > 0
        ? await this.prisma.teamPlayer.findMany({
            where: { id: { in: winnerIds } },
            select: { id: true, player: { select: { firstName: true, lastName: true } } },
          })
        : [];
    const nameById = new Map(winners.map((w) => [w.id, w.player]));

    return new Map(
      drafts.map((draft) => [
        draft.event.id,
        {
          canVote: draft.canVote,
          hasVoted: draft.hasVoted,
          closesAt: draft.closesAt.toISOString(),
          votesCast: draft.votesCast,
          totalVoters: rsvpSummaries.get(draft.event.id)?.rosterSize ?? 0,
          mvp:
            draft.winnerIds === null
              ? null
              : draft.winnerIds
                  .flatMap((id) => {
                    const player = nameById.get(id);
                    return player
                      ? [
                          {
                            firstName: player.firstName,
                            lastName: player.lastName,
                            isMe: myTeamPlayerIds.has(id),
                          },
                        ]
                      : [];
                  })
                  .sort(
                    (a, b) =>
                      a.lastName.localeCompare(b.lastName, 'fr') ||
                      a.firstName.localeCompare(b.firstName, 'fr'),
                  )
                  .map(({ firstName, lastName, isMe }) => ({
                    firstName,
                    lastInitial: lastName.charAt(0).toUpperCase(),
                    isMe,
                  })),
        },
      ]),
    );
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
      locationName: string | null;
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
    myRsvp: {
      status: EventRsvpStatus;
      travelMode: EventTravelMode;
      respondedAt: Date;
      respondedBy: { id: string; firstName: string | null; lastName: string | null } | null;
    } | null,
    callerId: string,
    myConvocation: boolean,
    rsvpSummary: EventRsvpSummary,
    logisticsAssignees: Map<string, EventLogisticsAssignee>,
    result: EventMatchResult | null,
    myMatchStats: EventMatchPlayerStats | null,
    vote: MyAgendaVote | null,
    meetingPlan: EventMeetingPlan | null,
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
      locationName: event.locationName,
      notes: event.notes,
      opponentName: event.opponentName,
      venue: event.venue,
      recurrenceId: event.recurrenceId,
      myRsvpStatus: myRsvp?.status ?? null,
      myRsvpRespondedBy: toRsvpRespondent(myRsvp?.respondedBy ?? null, callerId),
      myRsvpRespondedAt: myRsvp?.respondedAt.toISOString() ?? null,
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
      result,
      myMatchStats,
      vote,
      meetingPlan,
      // Same rule as TeamEvent.myTravelMode: only a GOING answer to a MATCH
      // has a way of getting there.
      myTravelMode:
        event.type === 'MATCH' && myRsvp?.status === 'GOING'
          ? (myRsvp.travelMode ?? 'MEETING_POINT')
          : null,
    };
  }
}

/** The BEST nominees with the most votes — several on a tie, none when nobody voted. */
function topVoted(best: VoteRow[]): string[] {
  const counts = new Map<string, number>();
  for (const vote of best) {
    counts.set(vote.votedTeamPlayerId, (counts.get(vote.votedTeamPlayerId) ?? 0) + 1);
  }
  const max = Math.max(0, ...counts.values());
  return max === 0
    ? []
    : Array.from(counts)
        .filter(([, n]) => n === max)
        .map(([id]) => id);
}
