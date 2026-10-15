import type { GetDashboardParams } from '@basketeasy/types/my-dashboard';
import type { ListClubMembersParams } from '@basketeasy/types/club-members';
import type { ListPlayersParams } from '@basketeasy/types/players';
import type { ListEventsParams } from '@basketeasy/types/events';
import type {
  ListTeamClubsParams,
  ListTeamPlayersParams,
  ListTeamsParams,
} from '@basketeasy/types/teams';

/**
 * The trailing key segment of a query read as a child (see useActingAs): a
 * persona's answers never share a cache entry with the user's own. Absent for
 * the user themself, so every existing key — and every prefix invalidation
 * built from one — is unchanged and still matches both personas.
 */
const actingAsKeyPart = (forPlayerId?: string) => (forPlayerId ? [{ pour: forPlayerId }] : []);

export const clubsQueryKey = ['clubs'] as const;
export const clubQueryKey = (clubId: string) => ['clubs', clubId] as const;
export const clubMembersQueryKey = (clubId: string, params?: ListClubMembersParams) =>
  ['clubs', clubId, 'members', params ?? {}] as const;
export const clubPlayersQueryKey = (clubId: string, params?: ListPlayersParams) =>
  ['clubs', clubId, 'players', params ?? {}] as const;
export const clubPlayerInviteQueryKey = (clubId: string, playerId: string) =>
  ['clubs', clubId, 'players', playerId, 'invite'] as const;
export const clubPlayerGuardiansQueryKey = (clubId: string, playerId: string) =>
  ['clubs', clubId, 'players', playerId, 'guardians'] as const;
export const clubTeamsQueryKey = (clubId: string, params?: ListTeamsParams) =>
  ['clubs', clubId, 'teams', params ?? {}] as const;
export const teamQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId] as const;
export const teamClubsQueryKey = (clubId: string, teamId: string, params?: ListTeamClubsParams) =>
  ['clubs', clubId, 'teams', teamId, 'clubs', params ?? {}] as const;
export const teamPlayersQueryKey = (
  clubId: string,
  teamId: string,
  params?: ListTeamPlayersParams,
) => ['clubs', clubId, 'teams', teamId, 'players', params ?? {}] as const;
/** Every event query of a team — lists and single events alike. */
export const teamEventsQueryKeyPrefix = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'events'] as const;
export const teamEventsQueryKey = (clubId: string, teamId: string, params?: ListEventsParams) =>
  ['clubs', clubId, 'teams', teamId, 'events', params ?? {}] as const;
export const teamEventQueryKey = (
  clubId: string,
  teamId: string,
  eventId: string,
  forPlayerId?: string,
) =>
  ['clubs', clubId, 'teams', teamId, 'events', eventId, ...actingAsKeyPart(forPlayerId)] as const;
/**
 * The sub-queries an event owns, one family per name. Each sits under the
 * event's key, so deleting the event covers them all; a persona, when the
 * family has one, is the last segment (so this key is the prefix of every
 * persona's copy of the family).
 */
export type EventPart =
  | 'rsvps'
  | 'convocations'
  | 'jersey-duty'
  | 'votes'
  | 'scoresheet'
  | 'scoresheet-extraction'
  | 'whatsapp-share'
  | 'rsvp-history';
export const eventSubKey = (clubId: string, teamId: string, eventId: string, part: EventPart) =>
  ['clubs', clubId, 'teams', teamId, 'events', eventId, part] as const;
/**
 * The event itself, whichever persona read it, and none of its sub-queries:
 * `teamEventQueryKey` is a prefix of those too, so invalidating it also
 * refetches every RSVP, convocation, vote and scoresheet query of the event.
 * Matches on the positions the builders above lay out: the key is six
 * segments long, or seven when the last is the persona object.
 */
export const isEventDetailQuery =
  (clubId: string, teamId: string, eventId: string) =>
  ({ queryKey }: { queryKey: readonly unknown[] }) =>
    queryKey[0] === 'clubs' &&
    queryKey[1] === clubId &&
    queryKey[2] === 'teams' &&
    queryKey[3] === teamId &&
    queryKey[4] === 'events' &&
    queryKey[5] === eventId &&
    (queryKey.length === 6 || (queryKey.length === 7 && typeof queryKey[6] === 'object'));
/** The persona (`forPlayerId`) a cached event detail was read for; undefined for the user themself. */
export const eventDetailPersona = (queryKey: readonly unknown[]): string | undefined =>
  (queryKey[6] as { pour?: string } | undefined)?.pour;
export const eventRsvpsQueryKey = (
  clubId: string,
  teamId: string,
  eventId: string,
  forPlayerId?: string,
) => [...eventSubKey(clubId, teamId, eventId, 'rsvps'), ...actingAsKeyPart(forPlayerId)] as const;
export const eventConvocationsQueryKey = (
  clubId: string,
  teamId: string,
  eventId: string,
  forPlayerId?: string,
) =>
  [
    ...eventSubKey(clubId, teamId, eventId, 'convocations'),
    ...actingAsKeyPart(forPlayerId),
  ] as const;
export const eventVoteResultsQueryKey = (clubId: string, teamId: string, eventId: string) =>
  eventSubKey(clubId, teamId, eventId, 'votes');
export const eventScoresheetStatusQueryKey = (clubId: string, teamId: string, eventId: string) =>
  eventSubKey(clubId, teamId, eventId, 'scoresheet');
export const eventScoresheetExtractionQueryKey = (
  clubId: string,
  teamId: string,
  eventId: string,
) => eventSubKey(clubId, teamId, eventId, 'scoresheet-extraction');
export const rsvpHistoryQueryKey = (
  clubId: string,
  teamId: string,
  eventId: string,
  teamPlayerId: string,
) => [...eventSubKey(clubId, teamId, eventId, 'rsvp-history'), teamPlayerId] as const;
export const whatsAppShareQueryKey = (clubId: string, teamId: string, eventId: string) =>
  eventSubKey(clubId, teamId, eventId, 'whatsapp-share');
export const guestLinkQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'guest-link'] as const;
export const whatsAppSettingsQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'whatsapp-settings'] as const;
export const teamSeasonStatsQueryKey = (
  clubId: string,
  teamId: string,
  season?: number,
  forPlayerId?: string,
) =>
  [
    'clubs',
    clubId,
    'teams',
    teamId,
    'stats',
    season ?? 'current',
    ...actingAsKeyPart(forPlayerId),
  ] as const;
/** Under the season key's `stats` prefix, so a confirm can invalidate both at once. */
export const matchStatsQueryKey = (
  clubId: string,
  teamId: string,
  eventId: string,
  forPlayerId?: string,
) =>
  [
    'clubs',
    clubId,
    'teams',
    teamId,
    'stats',
    'matches',
    eventId,
    ...actingAsKeyPart(forPlayerId),
  ] as const;
export const teamStatsQueryKeyPrefix = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'stats'] as const;
export const teamAdminsQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'admins'] as const;
export const teamFfbbLinksQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'ffbb-links'] as const;
export const teamPouleResultsQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'ffbb-poule-results'] as const;
export const teamAdminCandidatesQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'admins', 'eligible'] as const;
export const myTeamsQueryKey = ['me', 'teams'] as const;
export const myTeamsForQueryKey = (forPlayerId?: string) =>
  [...myTeamsQueryKey, ...actingAsKeyPart(forPlayerId)] as const;
/**
 * Prefix shared by every /me/dashboard query. The full key carries the
 * from/to window, so a mutation that changes the dashboard's contents has to
 * invalidate this prefix — invalidating `myDashboardQueryKey()` alone would
 * only match the caller that passed no params, leaving a 14-day window (or
 * any other) stale on screen.
 */
export const myDashboardQueryKeyPrefix = ['me', 'dashboard'] as const;
export const myDashboardQueryKey = (params?: GetDashboardParams) =>
  [...myDashboardQueryKeyPrefix, params ?? {}] as const;
export const clubMeetingSettingsQueryKey = (clubId: string) =>
  ['clubs', clubId, 'meeting-settings'] as const;
export const teamMeetingSettingsQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'meeting-settings'] as const;
/**
 * What a club's meeting-point default makes stale: every team's events (their
 * plans inherit it) and every team's meeting settings (they carry
 * `clubDefaults`) — and nothing else under the club's teams (rosters, stats,
 * FFBB links). Matches on the positions the builders above lay out.
 */
export const isClubMeetingDependentQuery =
  (clubId: string) =>
  ({ queryKey }: { queryKey: readonly unknown[] }) =>
    queryKey[0] === 'clubs' &&
    queryKey[1] === clubId &&
    queryKey[2] === 'teams' &&
    (queryKey[4] === 'events' || queryKey[4] === 'meeting-settings');
/**
 * Any cached query of a team, by the family it sits in (`'players'`,
 * `'events'`, `'stats'`, `'jersey-rotation'`, …), for the club and team given
 * or, when one is left out, whichever it was read through: a CTC team is
 * reachable under each of its linked clubs. Matches on the positions the
 * builders above lay out; the club's own `['clubs', id, 'teams', {params}]`
 * lists have an object where the team id goes, so they never match.
 */
export const isTeamFamilyQuery =
  (families: readonly string[], scope: { clubId?: string; teamId?: string } = {}) =>
  ({ queryKey }: { queryKey: readonly unknown[] }) =>
    queryKey[0] === 'clubs' &&
    queryKey[2] === 'teams' &&
    typeof queryKey[3] === 'string' &&
    typeof queryKey[4] === 'string' &&
    families.includes(queryKey[4]) &&
    (scope.clubId === undefined || queryKey[1] === scope.clubId) &&
    (scope.teamId === undefined || queryKey[3] === scope.teamId);
/** Every team's admin candidates (`…/admins/eligible`), whichever club they were read through. */
export const isTeamAdminCandidatesQuery = ({ queryKey }: { queryKey: readonly unknown[] }) =>
  isTeamFamilyQuery(['admins'])({ queryKey }) && queryKey[5] === 'eligible';
/** One match's jersey wash duty, under the event's key so deleting or refreshing the event covers it. */
export const jerseyDutyQueryKey = (
  clubId: string,
  teamId: string,
  eventId: string,
  forPlayerId?: string,
) =>
  [
    ...eventSubKey(clubId, teamId, eventId, 'jersey-duty'),
    ...actingAsKeyPart(forPlayerId),
  ] as const;
/** Every rotation overview of a team, whichever season or persona. */
export const jerseyRotationQueryKeyPrefix = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'jersey-rotation'] as const;
export const jerseyRotationQueryKey = (clubId: string, teamId: string, forPlayerId?: string) =>
  [...jerseyRotationQueryKeyPrefix(clubId, teamId), ...actingAsKeyPart(forPlayerId)] as const;
