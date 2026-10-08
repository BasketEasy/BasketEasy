// Every Kluvo API route, answered from the demo world. Shapes are typed
// against @basketeasy/types, so a contract change breaks the build here
// instead of a screen during filming.

import type { User } from '@basketeasy/types/auth';
import type { Club } from '@basketeasy/types/clubs';
import type { ClubMember } from '@basketeasy/types/club-members';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import type { Team, TeamClubLink, TeamPlayer } from '@basketeasy/types/teams';
import type { TeamAdmin, TeamAdminCandidate } from '@basketeasy/types/team-admins';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import type { AppNotification, NotificationList } from '@basketeasy/types/notifications';
import type { MyPersonas, MyPlayerGuardians, PlayerGuardians } from '@basketeasy/types/guardians';
import type { PlayerInviteStatus } from '@basketeasy/types/player-invites';
import type {
  EventConvocationRosterEntry,
  EventLogisticsAssignee,
  EventRsvpRosterEntry,
  EventRsvpStatus,
  EventRsvpSummary,
  EventScoresheet,
  EventVoteCandidateResult,
  EventVoteResults,
  TeamEvent,
} from '@basketeasy/types/events';
import type {
  ActionItem,
  MyAgendaEvent,
  MyAgendaVote,
  MyDashboardSummary,
} from '@basketeasy/types/my-dashboard';
import {
  computeMeetsAt,
  type EventMeetingPlan,
  type EventTravelMode,
  type TeamMeetingSettings,
} from '@basketeasy/types/meeting-points';
import type {
  EventJerseyDutySummary,
  JerseyDutyDetail,
  JerseyDutyPerson,
  JerseyRotationOverview,
  JerseyRotationRow,
} from '@basketeasy/types/jersey-duty';
import type { MatchStats, TeamSeasonStats } from '@basketeasy/types/team-stats';
import type { PouleResults } from '@basketeasy/types/ffbb';
import type {
  GuestEvent,
  GuestTeamPage,
  EventRsvpChangeEntry,
} from '@basketeasy/types/guest-links';
import {
  DEFAULT_REMINDER_TEMPLATE,
  renderTemplate,
  type EventShareStatus,
  type EventWhatsAppShare,
  type TeamWhatsAppSettings,
} from '@basketeasy/types/whatsapp-reminder';
import type {
  ParsedScoresheetData,
  ScoresheetExtraction,
  ScoresheetScoringPlay,
} from '@basketeasy/types/scoresheet-extraction';
import {
  ARRIVAL_BUFFER,
  CLUB,
  CLUB_MEETING_POINT,
  COMPETITION_LABEL,
  GUEST_TOKEN,
  OPPONENTS,
  rand,
  token,
  uid,
  type DemoEvent,
  type DemoTeam,
  type PersonaKey,
  type RsvpBase,
  type StatLine,
  type World,
} from './world';
import type { DemoState } from './state';
import { DAY, HOUR, MINUTE, formatClock, formatShortDate, formatWeekday, iso } from './time';

export interface ApiResult {
  status: number;
  body: unknown;
}

interface Ctx {
  world: World;
  state: DemoState;
  persona: PersonaKey;
  now: number;
  save: () => void;
}

type Handler = (
  ctx: Ctx,
  params: Record<string, string>,
  query: URLSearchParams,
  body: unknown,
) => unknown;

const ok = (body: unknown): ApiResult => ({ status: 200, body });
const noContent: ApiResult = { status: 204, body: null };
const fail = (status: number, message: string, code?: string): ApiResult => ({
  status,
  body: { statusCode: status, message, ...(code ? { code } : {}) },
});

class HttpError extends Error {
  constructor(readonly result: ApiResult) {
    super(String((result.body as { message?: string })?.message));
  }
}

// --- Lookups ---------------------------------------------------------------

function me(ctx: Ctx) {
  const p = ctx.world.personas[ctx.persona];
  const user = ctx.world.users.find((u) => u.id === p.userId);
  if (!user) throw new HttpError(fail(500, 'persona user missing'));
  return { ...p, user };
}

function isClubAdmin(ctx: Ctx): boolean {
  return me(ctx).user.clubRole === 'ADMIN';
}

function teamById(ctx: Ctx, teamId: string): DemoTeam {
  const t = ctx.world.teams.find((x) => x.team.id === teamId);
  if (!t) throw new HttpError(fail(404, 'Team not found'));
  return t;
}

function teamView(ctx: Ctx, t: DemoTeam): Team {
  return { ...t.team, ...ctx.state.teamPatches[t.team.id] };
}

function rosterOf(ctx: Ctx, t: DemoTeam): TeamPlayer[] {
  return t.roster.map((tp) =>
    tp.id in ctx.state.exempt ? { ...tp, jerseyDutyExempt: ctx.state.exempt[tp.id] } : tp,
  );
}

function myTp(ctx: Ctx, t: DemoTeam): TeamPlayer | undefined {
  return t.roster.find((tp) => tp.playerId === me(ctx).playerId);
}

function manages(ctx: Ctx, t: DemoTeam): boolean {
  return isClubAdmin(ctx) || t.adminUserIds.includes(me(ctx).userId);
}

function myTeams(ctx: Ctx): DemoTeam[] {
  return ctx.world.teams.filter((t) => myTp(ctx, t) || t.adminUserIds.includes(me(ctx).userId));
}

function allEvents(ctx: Ctx): DemoEvent[] {
  const created: DemoEvent[] = ctx.state.created.map((c) => ({
    ...c,
    opponentId: null,
    isImported: false,
    timeConfirmed: true,
    journee: null,
    travelMinutes: null,
  }));
  return [...ctx.world.events, ...created]
    .filter((e) => !ctx.state.deleted.includes(e.id))
    .map((e) => (ctx.state.eventPatches[e.id] ? { ...e, ...ctx.state.eventPatches[e.id] } : e))
    .sort((a, b) => a.startsAt - b.startsAt);
}

function eventById(ctx: Ctx, eventId: string): DemoEvent {
  const e = allEvents(ctx).find((x) => x.id === eventId);
  if (!e) throw new HttpError(fail(404, 'Event not found'));
  return e;
}

function rsvpOf(ctx: Ctx, e: DemoEvent, tpId: string): RsvpBase {
  const o = ctx.state.rsvp[e.id]?.[tpId];
  if (o)
    return {
      status: o.status,
      respondedAt: o.respondedAt,
      travelMode: o.travelMode,
      viaLink: false,
    };
  return (
    ctx.world.rsvps.get(e.id)?.get(tpId) ?? {
      status: null,
      respondedAt: null,
      travelMode: null,
      viaLink: false,
    }
  );
}

function convokedOf(ctx: Ctx, e: DemoEvent): Map<string, number> {
  const o = ctx.state.convocations[e.id];
  if (o) {
    const base = ctx.world.convocations.get(e.id);
    return new Map(o.ids.map((id) => [id, base?.get(id) ?? o.at]));
  }
  return ctx.world.convocations.get(e.id) ?? new Map();
}

const lastInitial = (last: string) => `${last.charAt(0).toUpperCase()}.`;

function assignee(t: DemoTeam, tpId: string | null | undefined): EventLogisticsAssignee | null {
  const tp = tpId ? t.roster.find((r) => r.id === tpId) : undefined;
  return tp ? { teamPlayerId: tp.id, firstName: tp.firstName, lastName: tp.lastName } : null;
}

function isScoresheetConfirmed(ctx: Ctx, e: DemoEvent): boolean {
  if (!ctx.world.results.has(e.id)) return false;
  if (ctx.world.lastMatch && e.id === ctx.world.lastMatch.id) {
    return !!ctx.state.scoresheets[e.id]?.confirmedAt;
  }
  return true;
}

// --- Events ---------------------------------------------------------------

function rsvpSummary(ctx: Ctx, t: DemoTeam, e: DemoEvent): EventRsvpSummary {
  const conv = convokedOf(ctx, e);
  const scope = conv.size > 0 ? t.roster.filter((tp) => conv.has(tp.id)) : t.roster;
  let going = 0;
  let maybe = 0;
  let notGoing = 0;
  for (const tp of scope) {
    const s = rsvpOf(ctx, e, tp.id).status;
    if (s === 'GOING') going++;
    else if (s === 'MAYBE') maybe++;
    else if (s === 'NOT_GOING') notGoing++;
  }
  return {
    rosterSize: t.roster.length,
    convoked: conv.size,
    answering: scope.length,
    going,
    maybe,
    notGoing,
    pending: scope.length - going - maybe - notGoing,
    isConvocationScoped: conv.size > 0,
  };
}

function meetingPlan(ctx: Ctx, e: DemoEvent): EventMeetingPlan | null {
  if (e.type !== 'MATCH') return null;
  const buffer = ctx.state.clubMeeting?.arrivalBufferMinutes ?? ARRIVAL_BUFFER;
  const arrivalAt = iso(e.startsAt - buffer * MINUTE);
  const override = ctx.state.eventMeeting[e.id] ?? {};
  const clubPoint = ctx.state.clubMeeting ? ctx.state.clubMeeting.meetingPoint : CLUB_MEETING_POINT;
  const isHome = e.venue === 'HOME';
  const defaultPoint = isHome ? null : clubPoint;
  const point = override.meetingPoint !== undefined ? override.meetingPoint : defaultPoint;
  const travel =
    override.travelMinutes !== undefined && override.travelMinutes !== null
      ? override.travelMinutes
      : isHome
        ? null
        : e.travelMinutes;
  const meetsAt =
    override.meetsAt ??
    (point && travel !== null && e.timeConfirmed
      ? computeMeetsAt({
          startsAt: new Date(e.startsAt),
          arrivalBufferMinutes: buffer,
          travelMinutes: travel,
        }).toISOString()
      : null);
  return {
    arrivalAt,
    arrivalBufferMinutes: buffer,
    meetingPoint: point,
    meetingPointSource:
      override.meetingPoint !== undefined && override.meetingPoint
        ? 'EVENT'
        : point
          ? 'CLUB'
          : null,
    defaultMeetingPoint: defaultPoint,
    defaultMeetingPointSource: defaultPoint ? 'CLUB' : null,
    travelMinutes: point ? travel : null,
    travelMinutesSource:
      point && travel !== null ? (override.travelMinutes ? 'MANUAL' : 'COMPUTED') : null,
    meetsAt: point ? meetsAt : null,
    meetsAtSource: point && meetsAt ? (override.meetsAt ? 'OVERRIDE' : 'COMPUTED') : null,
  };
}

function previousMatch(ctx: Ctx, e: DemoEvent): DemoEvent | undefined {
  const list = ctx.world.matches;
  const i = list.findIndex((m) => m.id === e.id);
  return i > 0 ? list[i - 1] : undefined;
}

function jerseyState(ctx: Ctx, e: DemoEvent) {
  const past = ctx.world.jerseyHolders.get(e.id);
  if (past) return { holder: past, status: 'DONE' as const, acceptedBy: past };
  const s = ctx.state.jersey[e.id];
  if (s && s.holder) return { holder: s.holder, status: s.status, acceptedBy: s.acceptedBy };
  return { holder: null, status: 'UNASSIGNED' as const, acceptedBy: null };
}

function jerseyDutySummary(ctx: Ctx, t: DemoTeam, e: DemoEvent): EventJerseyDutySummary | null {
  if (!t.isShowcase || e.type !== 'MATCH' || !teamView(ctx, t).jerseyRotationEnabled) return null;
  const js = jerseyState(ctx, e);
  const prev = previousMatch(ctx, e);
  const broughtBy = prev ? (ctx.world.jerseyHolders.get(prev.id) ?? null) : null;
  const mine = myTp(ctx, t)?.id;
  return {
    holder: assignee(t, js.holder),
    status: js.status,
    broughtBy:
      e.startsAt < ctx.now || e.id === ctx.world.nextMatch.id ? assignee(t, broughtBy) : null,
    isMine: !!mine && js.holder === mine,
  };
}

function guestUrl(): string {
  return `${location.origin}/r/${GUEST_TOKEN}`;
}

function shareVars(ctx: Ctx, t: DemoTeam, e: DemoEvent) {
  const plan = meetingPlan(ctx, e);
  return {
    event_name: e.type === 'MATCH' ? `Match contre ${e.opponentName}` : 'Entraînement',
    opponent: e.opponentName,
    event_date: formatShortDate(e.startsAt),
    meeting_time: plan?.meetsAt ? formatClock(Date.parse(plan.meetsAt)) : null,
    meeting_place: plan?.meetingPoint?.name ?? null,
    event_time: e.timeConfirmed ? formatClock(e.startsAt) : 'horaire à confirmer',
    location: e.locationName ?? e.location,
    team_name: t.team.name,
    link: `${guestUrl()}?src=wa`,
  };
}

function shareStatus(ctx: Ctx, t: DemoTeam, e: DemoEvent): EventShareStatus | null {
  if (!t.isShowcase) return null;
  const dueAt = e.startsAt - 3 * DAY;
  const sent = ctx.state.shares[e.id];
  const daysAgo = (ctx.now - e.startsAt) / DAY;
  if (daysAgo > 30) return null;
  if (sent || e.startsAt < ctx.now) {
    const sentAt = sent?.sentAt ?? dueAt + 25 * MINUTE;
    return {
      type: 'REMINDER',
      state: 'SENT',
      dueAt: iso(dueAt),
      sentAt: iso(sentAt),
      sentBy: { firstName: 'Hélène', lastInitial: 'C.', isMe: ctx.persona === 'coach' },
      platform: sent?.platform ?? 'SHARE_SHEET',
    };
  }
  if ((e.startsAt - ctx.now) / DAY > 14) return null;
  return {
    type: 'REMINDER',
    state: ctx.now >= dueAt ? 'PENDING' : 'SCHEDULED',
    dueAt: iso(dueAt),
    sentAt: null,
    sentBy: null,
    platform: null,
  };
}

function teamEvent(ctx: Ctx, e: DemoEvent): TeamEvent {
  const t = teamById(ctx, e.teamId);
  const mine = myTp(ctx, t);
  const myRsvp = mine ? rsvpOf(ctx, e, mine.id) : null;
  const result = ctx.world.results.get(e.id);
  const line =
    mine && isScoresheetConfirmed(ctx, e)
      ? ctx.world.statLines.get(e.id)?.find((l) => l.teamPlayerId === mine.id)
      : undefined;
  const isManager = manages(ctx, t);
  return {
    id: e.id,
    teamId: e.teamId,
    type: e.type,
    startsAt: iso(e.startsAt),
    location: e.location,
    locationName: e.locationName,
    notes: e.notes,
    opponentName: e.opponentName,
    venue: e.venue,
    recurrenceId: e.recurrenceId,
    createdAt: iso(e.createdAt),
    myRsvpStatus: myRsvp?.status ?? null,
    myRsvpRespondedBy:
      myRsvp?.status && mine
        ? { firstName: mine.firstName, lastInitial: lastInitial(mine.lastName), isMe: true }
        : null,
    myRsvpRespondedAt: myRsvp?.status && myRsvp.respondedAt ? iso(myRsvp.respondedAt) : null,
    myConvocation: !!mine && convokedOf(ctx, e).has(mine.id),
    rsvpSummary: rsvpSummary(ctx, t, e),
    isImported: e.isImported,
    timeConfirmed: e.timeConfirmed,
    logistics: {
      // With the rotation on, the wash lives on jerseyDuty; the showcase is the only team with matches.
      jerseys: null,
      balls: e.type === 'MATCH' ? assignee(t, ctx.world.ballsHolders.get(e.id)) : null,
    },
    result: result
      ? {
          ourScore: result.ourScore,
          theirScore: result.theirScore,
          outcome:
            result.ourScore > result.theirScore
              ? 'WIN'
              : result.ourScore < result.theirScore
                ? 'LOSS'
                : 'DRAW',
        }
      : null,
    myMatchStats: line ? { points: line.points, fouls: line.fouls } : null,
    jerseyDuty: jerseyDutySummary(ctx, t, e),
    meetingPlan: meetingPlan(ctx, e),
    whatsAppShare: isManager ? shareStatus(ctx, t, e) : null,
    whatsAppSettings: isManager
      ? {
          override: null,
          offsetMinutes: null,
          effective: { enabled: true, offsetMinutes: 3 * 24 * 60 },
        }
      : null,
    myTravelMode:
      myRsvp?.status === 'GOING' && e.type === 'MATCH'
        ? (myRsvp.travelMode ?? 'MEETING_POINT')
        : null,
  };
}

function paginate<T>(items: T[], query: URLSearchParams, defaultSize = 25): PaginatedResult<T> {
  const page = Math.max(1, Number(query.get('page') ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(query.get('pageSize') ?? defaultSize)));
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
  };
}

function matchesSearch(query: URLSearchParams, ...fields: (string | null)[]): boolean {
  const q = query.get('search')?.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}

function sortBy<T>(
  items: T[],
  query: URLSearchParams,
  keys: Record<string, (x: T) => string>,
  fallback: string,
): T[] {
  const key = keys[query.get('sortBy') ?? fallback] ?? keys[fallback];
  const dir = query.get('sortOrder') === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => key(a).localeCompare(key(b), 'fr') * dir);
}

// --- Votes, stats, scoresheet ---------------------------------------------

function ballotOf(ctx: Ctx, e: DemoEvent): Map<string, string> {
  const ballot = new Map(ctx.world.votes.get(e.id) ?? []);
  const t = teamById(ctx, e.teamId);
  const mine = myTp(ctx, t);
  const myVote = ctx.state.votes[e.id]?.best;
  if (mine && myVote) ballot.set(mine.id, myVote);
  return ballot;
}

function voteClosesAt(e: DemoEvent): number {
  return e.startsAt + 5 * DAY;
}

function topVoted(ballot: Map<string, string>): string[] {
  const counts = new Map<string, number>();
  for (const v of ballot.values()) counts.set(v, (counts.get(v) ?? 0) + 1);
  const max = Math.max(0, ...counts.values());
  return max === 0 ? [] : [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id);
}

function voteResults(ctx: Ctx, e: DemoEvent): EventVoteResults {
  const t = teamById(ctx, e.teamId);
  const ballot = ballotOf(ctx, e);
  const mine = myTp(ctx, t);
  const hasVoted = !!mine && ballot.has(mine.id);
  const isPublic = hasVoted || ctx.now > voteClosesAt(e);
  const counts = new Map<string, number>();
  for (const v of ballot.values()) counts.set(v, (counts.get(v) ?? 0) + 1);
  const best: EventVoteCandidateResult[] = isPublic
    ? [...counts.entries()]
        .map(([id, voteCount]) => {
          const tp = t.roster.find((r) => r.id === id) as TeamPlayer;
          return { teamPlayerId: id, firstName: tp.firstName, lastName: tp.lastName, voteCount };
        })
        .sort((a, b) => b.voteCount - a.voteCount)
    : [];
  return {
    best,
    worst: [],
    totalVoters: t.roster.length,
    votesCast: ballot.size,
    myVote: {
      best: ctx.state.votes[e.id]?.best ?? null,
      worst: ctx.state.votes[e.id]?.worst ?? null,
    },
    myVoteHidden: false,
  };
}

function agendaVote(ctx: Ctx, e: DemoEvent): MyAgendaVote | null {
  if (e.type !== 'MATCH' || !ctx.world.results.has(e.id)) return null;
  const t = teamById(ctx, e.teamId);
  const mine = myTp(ctx, t);
  const ballot = ballotOf(ctx, e);
  const hasVoted = !!mine && ballot.has(mine.id);
  const closesAt = voteClosesAt(e);
  const isOpen = ctx.now >= e.startsAt + HOUR && ctx.now <= closesAt;
  const canVote =
    isOpen &&
    !!mine &&
    rsvpOf(ctx, e, mine.id).status === 'GOING' &&
    convokedOf(ctx, e).has(mine.id);
  const isPublic = hasVoted || ctx.now > closesAt;
  return {
    canVote,
    hasVoted,
    closesAt: iso(closesAt),
    votesCast: ballot.size,
    totalVoters: t.roster.length,
    mvp: isPublic
      ? topVoted(ballot).map((id) => {
          const tp = t.roster.find((r) => r.id === id) as TeamPlayer;
          return {
            firstName: tp.firstName,
            lastInitial: lastInitial(tp.lastName),
            isMe: tp.id === mine?.id,
          };
        })
      : null,
  };
}

function seasonBounds(ctx: Ctx) {
  const y = ctx.world.seasonYear;
  return { seasonStart: `${y}-09-01T00:00:00.000Z`, seasonEnd: `${y + 1}-08-31T23:59:59.999Z` };
}

function seasonStats(ctx: Ctx, t: DemoTeam): TeamSeasonStats {
  const mine = myTp(ctx, t);
  const confirmed = t.isShowcase
    ? ctx.world.matches.filter((m) => isScoresheetConfirmed(ctx, m))
    : [];
  const players = t.roster.map((tp) => {
    const lines = confirmed
      .map((m) => ctx.world.statLines.get(m.id)?.find((l) => l.teamPlayerId === tp.id))
      .filter((l): l is StatLine => !!l);
    const total = lines.reduce((s, l) => s + l.points, 0);
    const mvpAwards = confirmed.filter(
      (m) => ctx.now > voteClosesAt(m) && topVoted(ballotOf(ctx, m)).includes(tp.id),
    ).length;
    return {
      teamPlayerId: tp.id,
      firstName: tp.firstName,
      lastName: tp.lastName,
      role: tp.role,
      gamesPlayed: lines.length,
      pointsPerGame: lines.length ? Math.round((total / lines.length) * 10) / 10 : null,
      foulsPerGame: lines.length
        ? Math.round((lines.reduce((s, l) => s + l.fouls, 0) / lines.length) * 10) / 10
        : null,
      seasonHighPoints: lines.length ? Math.max(...lines.map((l) => l.points)) : null,
      seasonHighFouls: lines.length ? Math.max(...lines.map((l) => l.fouls)) : null,
      freeThrowPoints: lines.reduce((s, l) => s + l.freeThrowPoints, 0),
      twoPointPoints: lines.reduce((s, l) => s + l.twoPointPoints, 0),
      threePointPoints: lines.reduce((s, l) => s + l.threePointPoints, 0),
      totalPoints: total,
      mvpAwards,
      worstPlayerAwards: 0,
      isMe: tp.id === mine?.id,
    };
  });
  return {
    seasonYear: ctx.world.seasonYear,
    ...seasonBounds(ctx),
    matchesPlayed: confirmed.length,
    availableSeasons: [ctx.world.seasonYear],
    players,
  };
}

function matchStats(ctx: Ctx, e: DemoEvent): MatchStats {
  const t = teamById(ctx, e.teamId);
  if (!isScoresheetConfirmed(ctx, e)) return { hasStats: false, lines: [] };
  const mine = myTp(ctx, t);
  const lines = (ctx.world.statLines.get(e.id) ?? []).map((l) => {
    const tp = t.roster.find((r) => r.id === l.teamPlayerId) as TeamPlayer;
    return {
      teamPlayerId: l.teamPlayerId,
      firstName: tp.firstName,
      lastName: tp.lastName,
      jerseyNumber: l.jerseyNumber,
      points: l.points,
      fouls: l.fouls,
      freeThrowPoints: l.freeThrowPoints,
      twoPointPoints: l.twoPointPoints,
      threePointPoints: l.threePointPoints,
      isMe: l.teamPlayerId === mine?.id,
    };
  });
  return {
    hasStats: lines.length > 0,
    lines: lines.sort((a, b) => (b.points ?? 0) - (a.points ?? 0)),
  };
}

function scoresheet(ctx: Ctx, e: DemoEvent): EventScoresheet | null {
  if (!ctx.world.results.has(e.id)) return null;
  const coachTp = ctx.world.personas.coach.teamPlayerId;
  const isLast = ctx.world.lastMatch?.id === e.id;
  const upload = ctx.state.scoresheets[e.id];
  if (!isLast)
    return {
      status: 'CONFIRMED',
      uploadedByTeamPlayerId: coachTp,
      uploadedAt: iso(e.startsAt + 3 * HOUR),
    };
  if (!upload) return null;
  const elapsed = ctx.now - upload.uploadedAt;
  const status = upload.confirmedAt
    ? 'CONFIRMED'
    : elapsed < 3_000
      ? 'QUEUED'
      : elapsed < 9_000
        ? 'PROCESSING'
        : 'PARSED';
  return {
    status,
    uploadedByTeamPlayerId: myTp(ctx, ctx.world.showcase)?.id ?? coachTp,
    uploadedAt: iso(upload.uploadedAt),
  };
}

const OPP_SURNAMES = [
  'MARTIN',
  'DUBOIS',
  'LEROY',
  'GIRARD',
  'BONNIN',
  'POIRIER',
  'RENOU',
  'BRETON',
  'CHAUVIN',
  'LEBLANC',
  'GAUDIN',
  'ROCHER',
];

function parsedSheet(ctx: Ctx, e: DemoEvent): ParsedScoresheetData {
  const t = ctx.world.showcase;
  const result = ctx.world.results.get(e.id) as { ourScore: number; theirScore: number };
  const ourSide = e.venue === 'HOME' ? 'home' : 'away';
  const theirSide = ourSide === 'home' ? 'away' : 'home';
  const ours = ctx.world.statLines.get(e.id) ?? [];
  const oppCount = 10;
  const oppPoints = Array.from(
    { length: oppCount },
    (_, i) => 1 + rand(`op-${e.id}-${i}`) * (i < 3 ? 6 : 2),
  );
  const sum = oppPoints.reduce((a, b) => a + b, 0);
  const oppInt = oppPoints.map((p) => Math.floor((p / sum) * result.theirScore));
  let rest = result.theirScore - oppInt.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % oppCount, rest--) oppInt[i] += 1;

  const players = [
    ...ours.map((l) => {
      const tp = t.roster.find((r) => r.id === l.teamPlayerId) as TeamPlayer;
      return {
        team: ourSide,
        number: l.jerseyNumber,
        name: tp.lastName.toUpperCase(),
        points: l.points,
        fouls: l.fouls,
      } as const;
    }),
    ...oppInt.map(
      (pts, i) =>
        ({
          team: theirSide,
          number: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14][i],
          name: OPP_SURNAMES[(i + (e.journee ?? 0)) % OPP_SURNAMES.length],
          points: pts,
          fouls: Math.floor(rand(`of-${e.id}-${i}`) * 4.5),
        }) as const,
    ),
  ];

  // Baskets per side, in a deterministic shuffle, then interleaved.
  const baskets = (
    side: 'home' | 'away',
    list: { number: number; three: number; two: number; ft: number }[],
  ) => {
    const out: { team: 'home' | 'away'; jerseyNumber: number; points: number; key: number }[] = [];
    for (const p of list) {
      for (let i = 0; i < p.three / 3; i++)
        out.push({
          team: side,
          jerseyNumber: p.number,
          points: 3,
          key: rand(`b3-${e.id}-${side}-${p.number}-${i}`),
        });
      for (let i = 0; i < p.two / 2; i++)
        out.push({
          team: side,
          jerseyNumber: p.number,
          points: 2,
          key: rand(`b2-${e.id}-${side}-${p.number}-${i}`),
        });
      for (let i = 0; i < p.ft; i++)
        out.push({
          team: side,
          jerseyNumber: p.number,
          points: 1,
          key: rand(`b1-${e.id}-${side}-${p.number}-${i}`),
        });
    }
    return out.sort((a, b) => a.key - b.key);
  };
  const ourBaskets = baskets(
    ourSide,
    ours.map((l) => ({
      number: l.jerseyNumber,
      three: l.threePointPoints,
      two: l.twoPointPoints,
      ft: l.freeThrowPoints,
    })),
  );
  const theirBaskets = baskets(
    theirSide,
    oppInt.map((pts, i) => {
      const three = Math.floor(pts / 9) * 3;
      const ft = (pts - three) % 2;
      return { number: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14][i], three, two: pts - three - ft, ft };
    }),
  );
  const plays: ScoresheetScoringPlay[] = [];
  const running = { home: 0, away: 0 };
  const quarters = [
    { home: 0, away: 0 },
    { home: 0, away: 0 },
    { home: 0, away: 0 },
    { home: 0, away: 0 },
  ];
  let i = 0;
  let j = 0;
  const total = ourBaskets.length + theirBaskets.length;
  while (i < ourBaskets.length || j < theirBaskets.length) {
    const takeOurs =
      j >= theirBaskets.length ||
      (i < ourBaskets.length && i / ourBaskets.length <= j / theirBaskets.length);
    const b = takeOurs ? ourBaskets[i++] : theirBaskets[j++];
    running[b.team] += b.points;
    const q = Math.min(3, Math.floor(((i + j - 1) / total) * 4));
    quarters[q][b.team] += b.points;
    plays.push({
      team: b.team,
      jerseyNumber: b.jerseyNumber,
      points: b.points,
      runningScore: running[b.team],
    });
  }
  return {
    homeScore: running.home,
    awayScore: running.away,
    quarterScores: quarters,
    players,
    scoringPlays: plays,
  };
}

function extraction(ctx: Ctx, e: DemoEvent): ScoresheetExtraction | null {
  const sheet = scoresheet(ctx, e);
  if (!sheet || ['UPLOADED', 'QUEUED', 'PROCESSING'].includes(sheet.status)) return null;
  const t = ctx.world.showcase;
  const confirmed = sheet.status === 'CONFIRMED';
  const coach = ctx.world.personas.coach.userId;
  return {
    status: sheet.status,
    parsedData: parsedSheet(ctx, e),
    confidence: 0.94,
    failureReason: null,
    reviewedByUserId: confirmed ? coach : null,
    reviewedAt: confirmed
      ? iso(ctx.state.scoresheets[e.id]?.confirmedAt ?? e.startsAt + 4 * HOUR)
      : null,
    suggestedRosterMapping: (ctx.world.statLines.get(e.id) ?? []).map((l) => {
      const tp = t.roster.find((r) => r.id === l.teamPlayerId) as TeamPlayer;
      return {
        jerseyNumber: l.jerseyNumber,
        teamPlayerId: tp.id,
        sheetName: tp.lastName.toUpperCase(),
      };
    }),
  };
}

// --- Jersey duty ------------------------------------------------------------

function turnsOf(ctx: Ctx, tpId: string): { turns: number; last: number | null } {
  let turns = 0;
  let last: number | null = null;
  for (const m of ctx.world.matches) {
    const holder =
      ctx.world.jerseyHolders.get(m.id) ??
      (ctx.state.jersey[m.id]?.status === 'ACCEPTED' ? ctx.state.jersey[m.id].holder : null);
    if (holder === tpId && m.startsAt < ctx.now) {
      turns++;
      last = m.startsAt;
    }
  }
  return { turns, last };
}

function person(ctx: Ctx, tp: TeamPlayer): JerseyDutyPerson {
  const { turns, last } = turnsOf(ctx, tp.id);
  return {
    teamPlayerId: tp.id,
    firstName: tp.firstName,
    lastName: tp.lastName,
    turnsThisSeason: turns,
    lastTurnAt: last ? iso(last) : null,
    gender: 'WOMEN',
    reachable: true,
  };
}

function rotationOrder(ctx: Ctx): TeamPlayer[] {
  const roster = rosterOf(ctx, ctx.world.showcase).filter((tp) => !tp.jerseyDutyExempt);
  // Among players level on turns, the player persona goes first: the demo's
  // « c'est ton tour » moment is hers.
  const lea = ctx.world.personas.joueuse.teamPlayerId;
  return roster.sort((a, b) => {
    const ta = turnsOf(ctx, a.id);
    const tb = turnsOf(ctx, b.id);
    return (
      ta.turns - tb.turns ||
      (ta.last ?? 0) - (tb.last ?? 0) ||
      Number(b.id === lea) - Number(a.id === lea) ||
      a.lastName.localeCompare(b.lastName)
    );
  });
}

function suggestionFor(ctx: Ctx, e: DemoEvent): TeamPlayer | undefined {
  const declined = ctx.state.jersey[e.id]?.declinedBy ?? [];
  return rotationOrder(ctx).find((tp) => !declined.includes(tp.id));
}

function jerseyDetail(ctx: Ctx, e: DemoEvent): JerseyDutyDetail {
  const t = ctx.world.showcase;
  const mine = myTp(ctx, t);
  const js = jerseyState(ctx, e);
  const isManager = manages(ctx, t);
  const isNext = e.id === ctx.world.nextMatch.id;
  const isPast = e.startsAt < ctx.now;
  const holderTp = js.holder ? t.roster.find((r) => r.id === js.holder) : undefined;
  const suggested = !js.holder && isNext ? suggestionFor(ctx, e) : undefined;
  const prev = previousMatch(ctx, e);
  const nextAfter = ctx.world.matches.find((m) => m.startsAt > e.startsAt);
  const conv = convokedOf(ctx, e);
  const goingCount = [...conv.keys()].filter((id) => rsvpOf(ctx, e, id).status === 'GOING').length;
  const isMineHolder = !!mine && js.holder === mine.id;
  const isMineSuggested = !!mine && suggested?.id === mine.id;
  const acceptedTp = js.acceptedBy ? t.roster.find((r) => r.id === js.acceptedBy) : undefined;
  return {
    eventId: e.id,
    teamGender: 'WOMEN',
    locked: isPast,
    status: js.status,
    holder: holderTp ? person(ctx, holderTp) : null,
    acceptedBy:
      acceptedTp && js.status !== 'ASSIGNED'
        ? {
            firstName: acceptedTp.firstName,
            lastInitial: lastInitial(acceptedTp.lastName),
            isMe: acceptedTp.id === mine?.id,
          }
        : null,
    broughtBy:
      prev && (isPast || isNext) ? assignee(t, ctx.world.jerseyHolders.get(prev.id)) : null,
    suggestion:
      isPast || js.holder
        ? null
        : suggested
          ? { kind: 'SUGGESTED', candidate: person(ctx, suggested), isFewest: true }
          : prev && !isNext
            ? { kind: 'AFTER_PREVIOUS', previousMatchStartsAt: iso(prev.startsAt) }
            : { kind: 'EMPTY_POOL' },
    pool: {
      convokedGoingCount: goingCount,
      exemptedCount: rosterOf(ctx, t).filter((r) => r.jerseyDutyExempt).length,
    },
    swapCandidates: isMineHolder
      ? rotationOrder(ctx)
          .filter((tp) => tp.id !== mine?.id)
          .map((tp) => {
            const { turns, last } = turnsOf(ctx, tp.id);
            return {
              teamPlayerId: tp.id,
              firstName: tp.firstName,
              lastName: tp.lastName,
              turnsThisSeason: turns,
              lastTurnAt: last ? iso(last) : null,
            };
          })
      : [],
    pendingSwap: null,
    nextMatchStartsAt: nextAfter ? iso(nextAfter.startsAt) : null,
    rights: {
      canAccept: !isPast && (isMineSuggested || (isMineHolder && js.status === 'ASSIGNED')),
      canDecline: !isPast && (isMineSuggested || isMineHolder),
      canSwap: !isPast && isMineHolder,
      canCancelSwap: false,
      canRespondToSwap: false,
      canManage: isManager && !isPast && ctx.persona === 'coach',
    },
  };
}

function rotationOverview(ctx: Ctx, t: DemoTeam): JerseyRotationOverview {
  const mine = myTp(ctx, t);
  const next = ctx.world.nextMatch;
  const js = jerseyState(ctx, next);
  const order = rotationOrder(ctx);
  const suggested = js.holder ? undefined : suggestionFor(ctx, next);
  const exempted = rosterOf(ctx, t).filter((tp) => tp.jerseyDutyExempt);
  const rows: JerseyRotationRow[] = [...order, ...exempted].map((tp) => {
    const { turns, last } = turnsOf(ctx, tp.id);
    return {
      teamPlayerId: tp.id,
      playerId: tp.playerId,
      firstName: tp.firstName,
      lastName: tp.lastName,
      turnsThisSeason: turns,
      lastTurnAt: last ? iso(last) : null,
      exempt: tp.jerseyDutyExempt,
      isMe: tp.id === mine?.id,
    };
  });
  return {
    seasonYear: ctx.world.seasonYear,
    teamGender: t.team.gender,
    enabled: teamView(ctx, t).jerseyRotationEnabled,
    canManage: manages(ctx, t) && ctx.persona === 'coach',
    nextMatch: t.isShowcase
      ? {
          eventId: next.id,
          startsAt: iso(next.startsAt),
          holder: assignee(t, js.holder),
          suggestion: suggested ? assignee(t, suggested.id) : null,
        }
      : null,
    rows: t.isShowcase ? rows : [],
  };
}

// --- Dashboard ----------------------------------------------------------

function agendaEvent(ctx: Ctx, e: DemoEvent): MyAgendaEvent {
  const te = teamEvent(ctx, e);
  const t = teamById(ctx, e.teamId);
  return {
    eventId: te.id,
    teamId: te.teamId,
    teamName: t.team.name,
    clubId: CLUB.id,
    clubName: CLUB.name,
    type: te.type,
    startsAt: te.startsAt,
    location: te.location,
    locationName: te.locationName,
    notes: te.notes,
    opponentName: te.opponentName,
    venue: te.venue,
    recurrenceId: te.recurrenceId,
    myRsvpStatus: te.myRsvpStatus,
    myRsvpRespondedBy: te.myRsvpRespondedBy,
    myRsvpRespondedAt: te.myRsvpRespondedAt,
    myConvocation: te.myConvocation,
    rsvpSummary: te.rsvpSummary,
    isImported: te.isImported,
    timeConfirmed: te.timeConfirmed,
    logistics: te.logistics,
    result: te.result,
    myMatchStats: te.myMatchStats,
    vote: agendaVote(ctx, e),
    meetingPlan: te.meetingPlan,
    myTravelMode: te.myTravelMode,
  };
}

function actionItems(ctx: Ctx, events: DemoEvent[]): ActionItem[] {
  if (ctx.persona !== 'coach') return [];
  const items: ActionItem[] = [];
  const base = { clubId: CLUB.id, clubName: CLUB.name };
  const mine = events.filter(
    (e) =>
      manages(ctx, teamById(ctx, e.teamId)) && myTeams(ctx).some((t) => t.team.id === e.teamId),
  );
  for (const e of mine) {
    if (
      e.type === 'MATCH' &&
      e.startsAt > ctx.now &&
      e.startsAt < ctx.now + 7 * DAY &&
      convokedOf(ctx, e).size === 0
    ) {
      items.push({
        ...base,
        kind: 'MATCH_WITHOUT_CONVOCATIONS',
        teamId: e.teamId,
        teamName: teamById(ctx, e.teamId).team.name,
        eventId: e.id,
        message: `Match contre ${e.opponentName} ${formatWeekday(e.startsAt)} — personne n'a encore été convoqué.`,
      });
    }
  }
  for (const e of mine) {
    if (e.startsAt < ctx.now || e.startsAt > ctx.now + 2 * DAY) continue;
    const s = rsvpSummary(ctx, teamById(ctx, e.teamId), e);
    if (s.pending === 0) continue;
    const subject = e.type === 'MATCH' ? `Match contre ${e.opponentName}` : 'Entraînement';
    items.push({
      ...base,
      kind: 'EVENT_PENDING_RSVPS',
      teamId: e.teamId,
      teamName: teamById(ctx, e.teamId).team.name,
      eventId: e.id,
      message: `${subject} ${formatWeekday(e.startsAt)} — ${s.pending} joueur${s.pending > 1 ? 's' : ''} n'${s.pending > 1 ? 'ont' : 'a'} pas encore répondu.`,
    });
  }
  for (const m of ctx.world.matches) {
    if (
      !ctx.world.results.has(m.id) ||
      isScoresheetConfirmed(ctx, m) ||
      ctx.now - m.startsAt > 14 * DAY
    )
      continue;
    items.push({
      ...base,
      kind: 'MATCH_WITHOUT_CONFIRMED_SCORESHEET',
      teamId: m.teamId,
      teamName: ctx.world.showcase.team.name,
      eventId: m.id,
      message: `Match contre ${m.opponentName} ${formatWeekday(m.startsAt)} — feuille de match non confirmée.`,
    });
  }
  // The server lists up to five; two keep the demo's « À traiter » readable.
  for (const p of ctx.world.players.filter((x) => !x.userId).slice(0, 2)) {
    items.push({
      ...base,
      kind: 'PLAYERS_WITHOUT_ACCOUNT',
      teamId: null,
      teamName: null,
      eventId: null,
      message: `${p.firstName} ${p.lastName} (${CLUB.name}) n'a pas encore de compte Kluvo.`,
    });
  }
  return items.slice(0, 8);
}

function dashboard(ctx: Ctx, query: URLSearchParams): MyDashboardSummary {
  const from = query.get('from') ? Date.parse(query.get('from') as string) : ctx.now;
  const to = query.get('to') ? Date.parse(query.get('to') as string) : ctx.now + 7 * DAY;
  const teamIds = new Set(myTeams(ctx).map((t) => t.team.id));
  const all = allEvents(ctx).filter((e) => teamIds.has(e.teamId));
  const inWindow = all.filter((e) => e.startsAt >= from && e.startsAt <= to);
  return {
    upcomingEvents: inWindow.map((e) => agendaEvent(ctx, e)),
    totalPlayers: isClubAdmin(ctx) ? ctx.world.players.length : 0,
    actionItems: actionItems(ctx, all),
  };
}

// --- Notifications ------------------------------------------------------

function notifications(ctx: Ctx): AppNotification[] {
  const t = ctx.world.showcase;
  const next = ctx.world.nextMatch;
  const last = ctx.world.lastMatch;
  const link = (e: DemoEvent, q = '') => `/clubs/${CLUB.id}/teams/${t.team.id}/events/${e.id}${q}`;
  const moment = (e: DemoEvent) => `${formatShortDate(e.startsAt)} à ${formatClock(e.startsAt)}`;
  const plan = meetingPlan(ctx, next);
  const list: (Omit<AppNotification, 'readAt'> & { read: boolean })[] = [];
  if (ctx.persona === 'coach') {
    list.push({
      id: uid('n-share'),
      type: 'WHATSAPP_SHARE_REQUESTED',
      title: `Rappel à partager : match contre ${next.opponentName}`,
      body: 'Le message est prêt, il ne reste qu’à l’envoyer dans le groupe WhatsApp de l’équipe.',
      deepLink: link(next, '?partage=REMINDER'),
      subjectFirstName: null,
      createdAt: iso(Math.min(ctx.now - 40 * MINUTE, next.startsAt - 3 * DAY)),
      read: false,
    });
    const zoe = t.roster.find((r) => r.lastName === 'Petit');
    if (zoe) {
      list.push({
        id: uid('n-guest'),
        type: 'GUEST_INVITE_REQUESTED',
        title: `${zoe.firstName} ${lastInitial(zoe.lastName)} demande un lien d'invitation Kluvo`,
        body: 'Ce joueur répond via le lien de l’équipe et souhaite créer son compte.',
        deepLink: `/clubs/${CLUB.id}/members?tab=players&invite=${zoe.playerId}`,
        subjectFirstName: null,
        createdAt: iso(ctx.now - 5 * HOUR),
        read: false,
      });
    }
    if (last) {
      const prev = previousMatch(ctx, last);
      if (prev) {
        list.push({
          id: uid(`n-sheet-${prev.id}`),
          type: 'SCORESHEET_READY',
          title: 'Feuille de match analysée',
          body: `La feuille du match contre ${prev.opponentName} est prête à être vérifiée.`,
          deepLink: link(prev),
          subjectFirstName: null,
          createdAt: iso(prev.startsAt + 3 * HOUR + 2 * MINUTE),
          read: true,
        });
      }
    }
  } else {
    list.push({
      id: uid('n-conv'),
      type: 'EVENT_CONVOCATION',
      title: `Vous êtes convoquée — ${t.team.name}`,
      body: `Vous êtes convoquée pour le match contre ${next.opponentName} du ${moment(next)} à ${next.locationName ?? next.location}.${plan?.meetsAt && plan.meetingPoint ? ` RDV à ${formatClock(Date.parse(plan.meetsAt))}, ${plan.meetingPoint.name}.` : ''} Merci d’indiquer votre présence.`,
      deepLink: link(next),
      subjectFirstName: null,
      createdAt: iso(ctx.now - 2 * DAY - 3 * HOUR),
      read: false,
    });
    if (plan?.meetsAt && plan.meetingPoint) {
      list.push({
        id: uid('n-rdv'),
        type: 'EVENT_MEETING_FIXED',
        title: `RDV fixé — ${t.team.name}`,
        body: `Rendez-vous pour le match contre ${next.opponentName} du ${moment(next)} : ${formatClock(Date.parse(plan.meetsAt))}, ${plan.meetingPoint.name}.`,
        deepLink: link(next),
        subjectFirstName: null,
        createdAt: iso(ctx.now - 26 * HOUR),
        read: false,
      });
    }
    if (last) {
      list.push({
        id: uid(`n-conv-${last.id}`),
        type: 'EVENT_CONVOCATION',
        title: `Vous êtes convoquée — ${t.team.name}`,
        body: `Vous êtes convoquée pour le match contre ${last.opponentName} du ${moment(last)}.`,
        deepLink: link(last),
        subjectFirstName: null,
        createdAt: iso(last.startsAt - 6 * DAY),
        read: true,
      });
    }
  }
  return list
    .map(({ read, ...n }) => ({
      ...n,
      readAt:
        read ||
        ctx.state.readNotifications.includes(n.id) ||
        (ctx.state.allReadAt ?? 0) > Date.parse(n.createdAt)
          ? iso(Math.max(Date.parse(n.createdAt) + HOUR, ctx.state.allReadAt ?? 0))
          : null,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// --- Poule ----------------------------------------------------------------

function pouleResults(ctx: Ctx): PouleResults {
  const names = new Map<string, string>([
    ['us', CLUB.name],
    ...OPPONENTS.map((o) => [o.id, o.name] as [string, string]),
  ]);
  const played = ctx.world.pouleMatches.filter((m) => m.homeScore !== null && m.awayScore !== null);
  const rows = new Map<string, { played: number; won: number; lost: number; diff: number }>();
  for (const id of names.keys()) rows.set(id, { played: 0, won: 0, lost: 0, diff: 0 });
  for (const m of played) {
    const h = rows.get(m.homeId)!;
    const a = rows.get(m.awayId)!;
    const hs = m.homeScore as number;
    const as = m.awayScore as number;
    h.played++;
    a.played++;
    h.diff += hs - as;
    a.diff += as - hs;
    if (hs > as) {
      h.won++;
      a.lost++;
    } else {
      a.won++;
      h.lost++;
    }
  }
  const standings = [...rows.entries()]
    .map(([id, r]) => ({ id, ...r, points: r.won * 2 + r.lost }))
    .sort(
      (x, y) =>
        y.points - x.points || Number(y.id === 'us') - Number(x.id === 'us') || y.diff - x.diff,
    )
    .map((r) => ({
      teamLabel: names.get(r.id) as string,
      played: r.played,
      won: r.won,
      lost: r.lost,
      points: r.points,
      isOurTeam: r.id === 'us',
    }));
  const byJournee = new Map<number, typeof played>();
  for (const m of played) byJournee.set(m.journee, [...(byJournee.get(m.journee) ?? []), m]);
  return {
    competitionLabel: COMPETITION_LABEL,
    standings,
    matchdays: [...byJournee.entries()]
      .sort(([a], [b]) => b - a)
      .map(([j, list]) => ({
        matchdayLabel: `Journée ${j}`,
        results: list.map((m) => ({
          homeLabel: names.get(m.homeId) as string,
          awayLabel: names.get(m.awayId) as string,
          homeScore: m.homeScore as number,
          awayScore: m.awayScore as number,
          involvesOurTeam: m.homeId === 'us' || m.awayId === 'us',
        })),
      })),
  };
}

// --- Guest page -------------------------------------------------------------

function guestEvent(ctx: Ctx, e: DemoEvent): GuestEvent {
  const t = teamById(ctx, e.teamId);
  const conv = convokedOf(ctx, e);
  return {
    id: e.id,
    type: e.type,
    startsAt: iso(e.startsAt),
    timeConfirmed: e.timeConfirmed,
    location: e.location,
    locationName: e.locationName,
    opponentName: e.opponentName,
    venue: e.venue,
    notes: e.notes,
    meetingPlan: meetingPlan(ctx, e),
    attendance: t.roster.map((tp) => {
      const r = rsvpOf(ctx, e, tp.id);
      return {
        teamPlayerId: tp.id,
        status: r.status,
        travelMode: r.travelMode,
        convoked: conv.has(tp.id),
        viaLink: r.viaLink,
      };
    }),
  };
}

function guestPage(ctx: Ctx): GuestTeamPage {
  const t = ctx.world.showcase;
  return {
    teamName: t.team.name,
    clubName: CLUB.name,
    roster: t.roster.map((tp) => ({
      teamPlayerId: tp.id,
      firstName: tp.firstName,
      lastInitial: lastInitial(tp.lastName),
      role: tp.role,
    })),
    events: allEvents(ctx)
      .filter(
        (e) => e.teamId === t.team.id && e.startsAt > ctx.now && e.startsAt < ctx.now + 14 * DAY,
      )
      .map((e) => guestEvent(ctx, e)),
  };
}

// --- Writes ---------------------------------------------------------------

function setRsvp(
  ctx: Ctx,
  e: DemoEvent,
  tpId: string,
  status: EventRsvpStatus | null,
  travelMode?: EventTravelMode | null,
) {
  const current = rsvpOf(ctx, e, tpId);
  const nextStatus = status;
  const mode =
    nextStatus === 'GOING'
      ? (travelMode ?? current.travelMode ?? (e.type === 'MATCH' ? 'MEETING_POINT' : null))
      : null;
  ctx.state.rsvp[e.id] = {
    ...ctx.state.rsvp[e.id],
    [tpId]: { status: nextStatus, travelMode: mode, respondedAt: ctx.now },
  };
  ctx.save();
}

function createEvents(ctx: Ctx, teamId: string, body: Record<string, unknown>): TeamEvent[] {
  const startsAt = Date.parse(String(body.startsAt));
  const recurrence = body.recurrence as { until?: string } | undefined;
  const until = recurrence?.until ? Date.parse(recurrence.until) : startsAt;
  const recurrenceId = recurrence ? uid(`created-series-${ctx.now}`) : null;
  const out: TeamEvent[] = [];
  for (let at = startsAt, n = 0; at <= until + DAY && n < 104; at += 7 * DAY, n++) {
    const created = {
      id: uid(`created-${ctx.now}-${n}`),
      teamId,
      type: (body.type as 'TRAINING' | 'MATCH') ?? 'TRAINING',
      startsAt: at,
      location: String(body.location ?? ''),
      locationName: (body.locationName as string | null) ?? null,
      opponentName: (body.opponentName as string | null) ?? null,
      venue: body.type === 'MATCH' ? ((body.venue as 'HOME' | 'AWAY') ?? 'HOME') : null,
      notes: (body.notes as string | null) ?? null,
      recurrenceId,
      createdAt: ctx.now,
    };
    ctx.state.created.push(created);
    if (!recurrence) break;
  }
  ctx.save();
  for (const c of ctx.state.created.filter((x) => x.createdAt === ctx.now))
    out.push(teamEvent(ctx, eventById(ctx, c.id)));
  return out;
}

// --- Routes -----------------------------------------------------------------

const T = '/clubs/:clubId/teams/:teamId';
const E = `${T}/events/:eventId`;

const ev = (ctx: Ctx, p: Record<string, string>) => eventById(ctx, p.eventId);
const tm = (ctx: Ctx, p: Record<string, string>) => teamById(ctx, p.teamId);

function userView(ctx: Ctx): User {
  const u = me(ctx).user;
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: null,
    emailVerified: true,
    emailNotificationsEnabled: true,
    memberships: u.clubRole ? [{ clubId: CLUB.id, role: u.clubRole }] : [],
  };
}

const club: Club = {
  id: CLUB.id,
  name: CLUB.name,
  ffbbClubCode: CLUB.ffbbClubCode,
  createdAt: CLUB.createdAt,
};

function teamMeeting(ctx: Ctx): TeamMeetingSettings {
  const clubSettings = ctx.state.clubMeeting ?? {
    meetingPoint: CLUB_MEETING_POINT,
    arrivalBufferMinutes: ARRIVAL_BUFFER,
  };
  return {
    meetingPoint: null,
    arrivalBufferMinutes: null,
    clubDefaults: { ...clubSettings, clubName: CLUB.name },
  };
}

const whatsappSettings: TeamWhatsAppSettings = {
  reminderTemplate: null,
  updateTemplate: null,
  cancellationTemplate: null,
  reminderEnabled: true,
  defaultOffsetMinutes: 3 * 24 * 60,
  hasReachableManager: true,
};

function rsvpRoster(ctx: Ctx, e: DemoEvent): EventRsvpRosterEntry[] {
  const t = teamById(ctx, e.teamId);
  const mine = myTp(ctx, t);
  return t.roster.map((tp) => {
    const r = rsvpOf(ctx, e, tp.id);
    return {
      teamPlayerId: tp.id,
      playerId: tp.playerId,
      firstName: tp.firstName,
      lastName: tp.lastName,
      role: tp.role,
      status: r.status,
      respondedAt: r.status && r.respondedAt ? iso(r.respondedAt) : null,
      respondedBy: null,
      respondedByGuardian: false,
      viaLink: r.status ? r.viaLink : false,
      travelMode: r.status === 'GOING' ? r.travelMode : null,
      isMe: tp.id === mine?.id,
    };
  });
}

function convocationRoster(ctx: Ctx, e: DemoEvent): EventConvocationRosterEntry[] {
  const t = teamById(ctx, e.teamId);
  const conv = convokedOf(ctx, e);
  const mine = myTp(ctx, t);
  return t.roster.map((tp) => ({
    teamPlayerId: tp.id,
    playerId: tp.playerId,
    firstName: tp.firstName,
    lastName: tp.lastName,
    role: tp.role,
    convoked: conv.has(tp.id),
    convokedAt: conv.has(tp.id) ? iso(conv.get(tp.id) as number) : null,
    isMe: tp.id === mine?.id,
  }));
}

function shareView(ctx: Ctx, e: DemoEvent): EventWhatsAppShare {
  const t = teamById(ctx, e.teamId);
  const status = shareStatus(ctx, t, e);
  return {
    guestLinkActive: ctx.state.guestLinkEnabled,
    shares: status
      ? [
          {
            ...status,
            message: renderTemplate(DEFAULT_REMINDER_TEMPLATE, shareVars(ctx, t, e)),
            changes: [],
          },
        ]
      : [],
  };
}

const routes: [string, string, Handler][] = [
  // Auth
  [
    'POST',
    '/auth/refresh',
    (ctx) => {
      if (ctx.state.loggedOut) throw new HttpError(fail(401, 'Missing refresh token'));
      return { accessToken: `demo.${ctx.persona}` };
    },
  ],
  [
    'POST',
    '/auth/login',
    (ctx, _p, _q, body) => {
      const email = String((body as { email?: string })?.email ?? '').toLowerCase();
      ctx.state.persona = email.includes('lea') || email.includes('léa') ? 'joueuse' : 'coach';
      ctx.state.loggedOut = false;
      ctx.persona = ctx.state.persona;
      ctx.save();
      return { accessToken: `demo.${ctx.persona}`, user: userView(ctx) };
    },
  ],
  [
    'POST',
    '/auth/register',
    () => {
      throw new HttpError(fail(409, 'Inscription désactivée dans la démo.'));
    },
  ],
  [
    'POST',
    '/auth/logout',
    (ctx) => {
      ctx.state.loggedOut = true;
      ctx.save();
      return null;
    },
  ],
  ['GET', '/auth/me', (ctx) => userView(ctx)],
  ['PATCH', '/auth/me', (ctx) => userView(ctx)],

  // Clubs, members, players
  ['GET', '/clubs', () => [club]],
  ['GET', '/clubs/:clubId', () => club],
  [
    'GET',
    '/clubs/:clubId/members',
    (ctx, _p, q) => {
      const members: ClubMember[] = ctx.world.users
        .filter((u) => u.clubRole && (!q.get('role') || u.clubRole === q.get('role')))
        .filter((u) => matchesSearch(q, u.firstName, u.lastName, u.email))
        .map((u) => ({
          userId: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          role: u.clubRole as 'ADMIN' | 'MEMBER',
          joinedAt: u.joinedAt,
        }));
      return paginate(
        sortBy(
          members,
          q,
          {
            name: (m) => `${m.lastName} ${m.firstName}`,
            email: (m) => m.email,
            joinedAt: (m) => m.joinedAt,
          },
          'name',
        ),
        q,
      );
    },
  ],
  [
    'GET',
    '/clubs/:clubId/players',
    (ctx, _p, q) => {
      const list = ctx.world.players
        .filter((p) => matchesSearch(q, p.firstName, p.lastName, `${p.firstName} ${p.lastName}`))
        .map(({ teamName: _teamName, ...p }) => p);
      return paginate(
        sortBy(
          list,
          q,
          { name: (p) => `${p.lastName} ${p.firstName}`, createdAt: (p) => p.createdAt },
          'name',
        ),
        q,
      );
    },
  ],
  // The demo club already holds the CSV's players: an import on camera
  // reports them as up to date rather than creating duplicates.
  [
    'POST',
    '/clubs/:clubId/players/import',
    (_ctx, _p, _q, body) => ({
      created: 0,
      updated: ((body as { rows?: unknown[] })?.rows ?? []).length,
      conflicts: 0,
    }),
  ],
  [
    'GET',
    '/clubs/:clubId/players/:playerId/invite',
    (ctx, p): PlayerInviteStatus => {
      const player = ctx.world.players.find((x) => x.id === p.playerId);
      if (player?.userId) return { status: 'ACCEPTED', expiresAt: null };
      return { status: 'NONE', expiresAt: null };
    },
  ],
  [
    'POST',
    '/clubs/:clubId/players/:playerId/invite',
    (ctx, p) => ({
      token: token(`invite-${p.playerId}`),
      url: `${location.origin}/invite/${token(`invite-${p.playerId}`)}`,
      expiresAt: iso(ctx.now + 7 * DAY),
    }),
  ],
  [
    'GET',
    '/clubs/:clubId/players/:playerId/guardians',
    (ctx, p): PlayerGuardians => ({
      guardians: ctx.world.guardians.get(p.playerId) ?? [],
      pendingInvites: [],
    }),
  ],
  [
    'GET',
    '/clubs/:clubId/meeting-settings',
    (ctx) =>
      ctx.state.clubMeeting ?? {
        meetingPoint: CLUB_MEETING_POINT,
        arrivalBufferMinutes: ARRIVAL_BUFFER,
      },
  ],
  [
    'PATCH',
    '/clubs/:clubId/meeting-settings',
    (ctx, _p, _q, body) => {
      ctx.state.clubMeeting = body as DemoState['clubMeeting'];
      ctx.save();
      return ctx.state.clubMeeting;
    },
  ],

  // Teams
  [
    'GET',
    '/clubs/:clubId/teams',
    (ctx, _p, q) => {
      const list = ctx.world.teams
        .map((t) => teamView(ctx, t))
        .filter(
          (t) =>
            (!q.get('category') || t.category === q.get('category')) &&
            (!q.get('gender') || t.gender === q.get('gender')),
        )
        .filter((t) => matchesSearch(q, t.name));
      return paginate(
        q.get('sortBy')
          ? sortBy(
              list,
              q,
              { name: (t) => t.name, category: (t) => t.category, createdAt: (t) => t.createdAt },
              'name',
            )
          : list,
        q,
      );
    },
  ],
  ['GET', T, (ctx, p) => teamView(ctx, tm(ctx, p))],
  [
    'PATCH',
    T,
    (ctx, p, _q, body) => {
      ctx.state.teamPatches[p.teamId] = { ...ctx.state.teamPatches[p.teamId], ...(body as object) };
      ctx.save();
      return teamView(ctx, tm(ctx, p));
    },
  ],
  [
    'GET',
    `${T}/clubs`,
    (_ctx, _p, q): PaginatedResult<TeamClubLink> =>
      paginate(
        [
          {
            clubId: CLUB.id,
            clubName: CLUB.name,
            isOwner: true,
            linkedAt: '2025-08-26T08:10:00.000Z',
          },
        ],
        q,
      ),
  ],
  [
    'GET',
    `${T}/players`,
    (ctx, p, q) => {
      const roster = rosterOf(ctx, tm(ctx, p)).filter((tp) =>
        matchesSearch(q, tp.firstName, tp.lastName),
      );
      return paginate(
        q.get('sortBy')
          ? sortBy(
              roster,
              q,
              { name: (tp) => `${tp.lastName} ${tp.firstName}`, createdAt: (tp) => tp.createdAt },
              'name',
            )
          : roster,
        q,
      );
    },
  ],
  [
    'PATCH',
    `${T}/players/:playerId`,
    (ctx, p, _q, body) => {
      const tp = rosterOf(ctx, tm(ctx, p)).find(
        (x) => x.id === p.playerId || x.playerId === p.playerId,
      );
      if (!tp) throw new HttpError(fail(404, 'Roster entry not found'));
      const patch = body as { jerseyDutyExempt?: boolean };
      if (patch.jerseyDutyExempt !== undefined) ctx.state.exempt[tp.id] = patch.jerseyDutyExempt;
      ctx.save();
      return rosterOf(ctx, tm(ctx, p)).find((x) => x.id === tp.id);
    },
  ],
  [
    'GET',
    `${T}/admins`,
    (ctx, p): TeamAdmin[] =>
      tm(ctx, p).adminUserIds.map((id) => {
        const u = ctx.world.users.find((x) => x.id === id);
        return {
          userId: id,
          email: u?.email ?? '',
          teamId: p.teamId,
          createdAt: '2025-08-26T08:12:00.000Z',
        };
      }),
  ],
  [
    'GET',
    `${T}/admins/eligible`,
    (ctx, p): TeamAdminCandidate[] =>
      ctx.world.users
        .filter((u) => u.clubRole && !tm(ctx, p).adminUserIds.includes(u.id))
        .map((u) => ({
          userId: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
        })),
  ],
  [
    'GET',
    `${T}/ffbb-links`,
    (ctx, p) =>
      tm(ctx, p).isShowcase
        ? [{ id: uid('ffbb-link'), ffbbEngagementLabel: COMPETITION_LABEL }]
        : [],
  ],
  [
    'POST',
    `${T}/ffbb-import`,
    (ctx) => ({
      created: 0,
      updated: 0,
      unchanged: ctx.world.matches.length,
      missingVenue: [],
      missingVenueTotal: 0,
    }),
  ],
  [
    'GET',
    `${T}/ffbb-poule-results`,
    (ctx, p) => {
      if (!tm(ctx, p).isShowcase) throw new HttpError(fail(404, 'No FFBB link on this team'));
      return pouleResults(ctx);
    },
  ],
  ['GET', `${T}/meeting-settings`, (ctx) => teamMeeting(ctx)],
  ['PATCH', `${T}/meeting-settings`, (ctx) => teamMeeting(ctx)],
  ['GET', `${T}/stats`, (ctx, p) => seasonStats(ctx, tm(ctx, p))],
  ['GET', `${T}/stats/matches/:eventId`, (ctx, p) => matchStats(ctx, ev(ctx, p))],
  ['GET', `${T}/jersey-rotation`, (ctx, p) => rotationOverview(ctx, tm(ctx, p))],
  [
    'GET',
    `${T}/guest-link`,
    (ctx, p) => (tm(ctx, p).isShowcase && ctx.state.guestLinkEnabled ? { url: guestUrl() } : null),
  ],
  [
    'POST',
    `${T}/guest-link`,
    (ctx) => {
      ctx.state.guestLinkEnabled = true;
      ctx.save();
      return null;
    },
  ],
  ['POST', `${T}/guest-link/regenerate`, () => ({ url: guestUrl() })],
  [
    'DELETE',
    `${T}/guest-link`,
    (ctx) => {
      ctx.state.guestLinkEnabled = false;
      ctx.save();
      return null;
    },
  ],
  ['GET', `${T}/whatsapp-settings`, () => whatsappSettings],
  [
    'PATCH',
    `${T}/whatsapp-settings`,
    (ctx) => ({ ...whatsappSettings, guestLinkEnabled: ctx.state.guestLinkEnabled }),
  ],
  ['GET', `${T}/whatsapp-shares/pending-cancellations`, () => []],

  // Events
  [
    'GET',
    `${T}/events`,
    (ctx, p, q) => {
      const from = q.get('from') ? Date.parse(q.get('from') as string) : -Infinity;
      const to = q.get('to') ? Date.parse(q.get('to') as string) : Infinity;
      let list = allEvents(ctx).filter(
        (e) => e.teamId === p.teamId && e.startsAt >= from && e.startsAt <= to,
      );
      if (q.get('search'))
        list = list.filter((e) =>
          matchesSearch(
            q,
            e.opponentName,
            e.location,
            e.locationName,
            e.type === 'TRAINING' ? 'Entraînement' : 'Match',
          ),
        );
      if (q.get('sortOrder') === 'desc') list = [...list].reverse();
      const page = paginate(list, q);
      return { ...page, items: page.items.map((e) => teamEvent(ctx, e)) };
    },
  ],
  [
    'POST',
    `${T}/events`,
    (ctx, p, _q, body) => createEvents(ctx, p.teamId, body as Record<string, unknown>),
  ],
  ['GET', E, (ctx, p) => teamEvent(ctx, ev(ctx, p))],
  [
    'PATCH',
    E,
    (ctx, p, _q, body) => {
      const patch = { ...(body as Record<string, unknown>) };
      delete patch.scope;
      if (typeof patch.startsAt === 'string') patch.startsAt = Date.parse(patch.startsAt);
      ctx.state.eventPatches[p.eventId] = {
        ...ctx.state.eventPatches[p.eventId],
        ...(patch as object),
      };
      ctx.save();
      return [teamEvent(ctx, ev(ctx, p))];
    },
  ],
  ['PATCH', `${E}/time`, (ctx, p) => [teamEvent(ctx, ev(ctx, p))]],
  [
    'DELETE',
    E,
    (ctx, p) => {
      ctx.state.deleted.push(p.eventId);
      ctx.save();
      return null;
    },
  ],
  ['GET', `${E}/rsvps`, (ctx, p) => rsvpRoster(ctx, ev(ctx, p))],
  [
    'GET',
    `${E}/rsvps/:teamPlayerId/history`,
    (ctx, p): EventRsvpChangeEntry[] => {
      const e = ev(ctx, p);
      const r = rsvpOf(ctx, e, p.teamPlayerId);
      const tp = teamById(ctx, e.teamId).roster.find((x) => x.id === p.teamPlayerId);
      if (!r.status || !r.respondedAt || !tp) return [];
      return [
        {
          status: r.status,
          travelMode: r.travelMode,
          source: r.viaLink ? 'GUEST_LINK' : 'APP',
          via: r.viaLink ? 'WHATSAPP' : null,
          respondedBy: r.viaLink
            ? null
            : { firstName: tp.firstName, lastInitial: lastInitial(tp.lastName), isMe: false },
          createdAt: iso(r.respondedAt),
        },
      ];
    },
  ],
  [
    'PATCH',
    `${E}/rsvp`,
    (ctx, p, _q, body) => {
      const e = ev(ctx, p);
      const mine = myTp(ctx, teamById(ctx, e.teamId));
      if (!mine) throw new HttpError(fail(403, 'Not on this roster'));
      setRsvp(ctx, e, mine.id, (body as { status: EventRsvpStatus }).status);
      return teamEvent(ctx, e);
    },
  ],
  [
    'DELETE',
    `${E}/rsvp`,
    (ctx, p) => {
      const e = ev(ctx, p);
      const mine = myTp(ctx, teamById(ctx, e.teamId));
      if (mine) setRsvp(ctx, e, mine.id, null);
      return teamEvent(ctx, e);
    },
  ],
  [
    'PATCH',
    `${E}/travel-mode`,
    (ctx, p, _q, body) => {
      const e = ev(ctx, p);
      const mine = myTp(ctx, teamById(ctx, e.teamId));
      if (!mine) throw new HttpError(fail(403, 'Not on this roster'));
      setRsvp(
        ctx,
        e,
        mine.id,
        rsvpOf(ctx, e, mine.id).status,
        (body as { travelMode: EventTravelMode }).travelMode,
      );
      return teamEvent(ctx, e);
    },
  ],
  ['GET', `${E}/convocations`, (ctx, p) => convocationRoster(ctx, ev(ctx, p))],
  [
    'PATCH',
    `${E}/convocations`,
    (ctx, p, _q, body) => {
      ctx.state.convocations[p.eventId] = {
        ids: (body as { teamPlayerIds: string[] }).teamPlayerIds,
        at: ctx.now,
      };
      ctx.save();
      return convocationRoster(ctx, ev(ctx, p));
    },
  ],
  ['PATCH', `${E}/logistics`, (ctx, p) => teamEvent(ctx, ev(ctx, p))],
  [
    'PATCH',
    `${E}/meeting`,
    (ctx, p, _q, body) => {
      ctx.state.eventMeeting[p.eventId] = {
        ...ctx.state.eventMeeting[p.eventId],
        ...(body as object),
      };
      ctx.save();
      return meetingPlan(ctx, ev(ctx, p));
    },
  ],
  ['POST', `${E}/meeting/refresh`, (ctx, p) => meetingPlan(ctx, ev(ctx, p))],
  ['GET', `${E}/votes`, (ctx, p) => voteResults(ctx, ev(ctx, p))],
  [
    'PATCH',
    `${E}/votes`,
    (ctx, p, _q, body) => {
      const { category, teamPlayerId } = body as {
        category: 'BEST' | 'WORST';
        teamPlayerId: string;
      };
      ctx.state.votes[p.eventId] = {
        ...ctx.state.votes[p.eventId],
        [category === 'BEST' ? 'best' : 'worst']: teamPlayerId,
      };
      ctx.save();
      return voteResults(ctx, ev(ctx, p));
    },
  ],
  ['GET', `${E}/scoresheet`, (ctx, p) => scoresheet(ctx, ev(ctx, p))],
  [
    'POST',
    `${E}/scoresheet/upload-url`,
    (_ctx, p) => ({
      uploadUrl: `https://kluvo-demo.invalid/upload/${p.eventId}`,
      storageKey: `scoresheets/${p.eventId}.jpg`,
    }),
  ],
  [
    'PATCH',
    `${E}/scoresheet`,
    (ctx, p) => {
      ctx.state.scoresheets[p.eventId] = { uploadedAt: ctx.now, confirmedAt: null };
      ctx.save();
      return scoresheet(ctx, ev(ctx, p));
    },
  ],
  [
    'POST',
    `${E}/scoresheet-extraction/retry`,
    (ctx, p) => {
      ctx.state.scoresheets[p.eventId] = { uploadedAt: ctx.now, confirmedAt: null };
      ctx.save();
      return scoresheet(ctx, ev(ctx, p));
    },
  ],
  ['GET', `${E}/scoresheet-extraction`, (ctx, p) => extraction(ctx, ev(ctx, p))],
  [
    'PATCH',
    `${E}/scoresheet-extraction/confirm`,
    (ctx, p) => {
      const s = ctx.state.scoresheets[p.eventId] ?? {
        uploadedAt: ctx.now - 60_000,
        confirmedAt: null,
      };
      ctx.state.scoresheets[p.eventId] = { ...s, confirmedAt: ctx.now };
      ctx.save();
      return extraction(ctx, ev(ctx, p));
    },
  ],
  ['GET', `${E}/whatsapp-share`, (ctx, p) => shareView(ctx, ev(ctx, p))],
  [
    'POST',
    `${E}/whatsapp-share/:type/confirm`,
    (ctx, p, _q, body) => {
      ctx.state.shares[p.eventId] = {
        sentAt: ctx.now,
        platform: (body as { platform?: 'SHARE_SHEET' })?.platform ?? 'SHARE_SHEET',
        by: ctx.persona,
      };
      ctx.save();
      return shareStatus(ctx, tm(ctx, p), ev(ctx, p));
    },
  ],

  // Jersey duty
  ['GET', `${E}/jersey-duty`, (ctx, p) => jerseyDetail(ctx, ev(ctx, p))],
  [
    'PUT',
    `${E}/jersey-duty`,
    (ctx, p, _q, body) => {
      const holder = (body as { teamPlayerId: string | null }).teamPlayerId;
      if (holder)
        ctx.state.jersey[p.eventId] = {
          holder,
          status: 'ASSIGNED',
          acceptedBy: null,
          declinedBy: ctx.state.jersey[p.eventId]?.declinedBy ?? [],
        };
      else delete ctx.state.jersey[p.eventId];
      ctx.save();
      return jerseyDetail(ctx, ev(ctx, p));
    },
  ],
  [
    'POST',
    `${E}/jersey-duty/accept`,
    (ctx, p) => {
      const mine = myTp(ctx, ctx.world.showcase);
      if (mine)
        ctx.state.jersey[p.eventId] = {
          holder: mine.id,
          status: 'ACCEPTED',
          acceptedBy: mine.id,
          declinedBy: ctx.state.jersey[p.eventId]?.declinedBy ?? [],
        };
      ctx.save();
      return jerseyDetail(ctx, ev(ctx, p));
    },
  ],
  [
    'POST',
    `${E}/jersey-duty/decline`,
    (ctx, p) => {
      const mine = myTp(ctx, ctx.world.showcase);
      const prev = ctx.state.jersey[p.eventId];
      ctx.state.jersey[p.eventId] = {
        holder: null,
        status: 'ASSIGNED',
        acceptedBy: null,
        declinedBy: [...(prev?.declinedBy ?? []), ...(mine ? [mine.id] : [])],
      };
      ctx.save();
      return jerseyDetail(ctx, ev(ctx, p));
    },
  ],

  // Me
  [
    'GET',
    '/me/teams',
    (ctx): MyTeamSummary[] =>
      myTeams(ctx).map((t) => ({
        teamId: t.team.id,
        teamName: t.team.name,
        category: t.team.category,
        gender: t.team.gender,
        clubId: CLUB.id,
        clubName: CLUB.name,
        isTeamAdmin: t.adminUserIds.includes(me(ctx).userId),
        rosterRole: myTp(ctx, t)?.role ?? null,
      })),
  ],
  ['GET', '/me/dashboard', (ctx, _p, q) => dashboard(ctx, q)],
  [
    'GET',
    '/me/personas',
    (ctx): MyPersonas => {
      const t = ctx.world.showcase;
      const mine = myTp(ctx, t);
      const pending = mine
        ? allEvents(ctx).filter(
            (e) =>
              e.teamId === t.team.id &&
              e.startsAt > ctx.now &&
              e.startsAt < ctx.now + 14 * DAY &&
              convokedOf(ctx, e).has(mine.id) &&
              !rsvpOf(ctx, e, mine.id).status,
          ).length
        : 0;
      return { self: { pendingCount: pending, playerIds: [me(ctx).playerId] }, children: [] };
    },
  ],
  [
    'GET',
    '/me/notifications',
    (ctx): NotificationList => {
      const items = notifications(ctx);
      return { items, unreadCount: items.filter((n) => !n.readAt).length };
    },
  ],
  [
    'PATCH',
    '/me/notifications/:notificationId/read',
    (ctx, p) => {
      ctx.state.readNotifications.push(p.notificationId);
      ctx.save();
      return null;
    },
  ],
  [
    'POST',
    '/me/notifications/read-all',
    (ctx) => {
      ctx.state.allReadAt = ctx.now;
      ctx.save();
      return null;
    },
  ],
  ['GET', '/me/push-subscriptions/public-key', () => ({ publicKey: null })],
  [
    'GET',
    '/me/players/:playerId/guardians',
    (_ctx, p): MyPlayerGuardians => ({ playerId: p.playerId, isMinor: false, guardians: [] }),
  ],

  // Public guest page
  [
    'GET',
    '/public/guest/:token',
    (ctx, p) => {
      if (p.token !== GUEST_TOKEN || !ctx.state.guestLinkEnabled)
        throw new HttpError(fail(404, 'Not found'));
      return guestPage(ctx);
    },
  ],
  [
    'PUT',
    '/public/guest/:token/events/:eventId/rsvp',
    (ctx, p, _q, body) => {
      const b = body as {
        teamPlayerId: string;
        status: EventRsvpStatus;
        travelMode?: EventTravelMode;
      };
      const e = ev(ctx, p);
      setRsvp(ctx, e, b.teamPlayerId, b.status, b.travelMode);
      return guestEvent(ctx, e);
    },
  ],
  [
    'DELETE',
    '/public/guest/:token/events/:eventId/rsvp',
    (ctx, p, q) => {
      const e = ev(ctx, p);
      const tp = q.get('teamPlayerId');
      if (tp) setRsvp(ctx, e, tp, null);
      return guestEvent(ctx, e);
    },
  ],
  ['POST', '/public/guest/:token/invite-request', () => null],
];

const compiled = routes.map(([method, pattern, handler]) => {
  const names: string[] = [];
  const regex = new RegExp(
    `^${pattern
      .split('/')
      .map((seg) =>
        seg.startsWith(':')
          ? (names.push(seg.slice(1)), '([^/]+)')
          : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('/')}$`,
  );
  return { method, regex, names, handler };
});

export function handle(
  ctxBase: Omit<Ctx, 'persona'> & { persona: PersonaKey },
  method: string,
  path: string,
  query: URLSearchParams,
  body: unknown,
): ApiResult | null {
  const ctx: Ctx = { ...ctxBase };
  if (path.startsWith('/admin')) return fail(503, 'Back-office indisponible dans la démo.');
  for (const r of compiled) {
    if (r.method !== method) continue;
    const m = r.regex.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    try {
      const out = r.handler(ctx, params, query, body);
      return out === null && method !== 'GET' ? noContent : ok(out ?? null);
    } catch (err) {
      if (err instanceof HttpError) return err.result;
      throw err;
    }
  }
  return null;
}
