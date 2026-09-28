import type { GetDashboardParams } from '@basketeasy/types/my-dashboard';
import type { ListClubMembersParams } from '@basketeasy/types/club-members';
import type { ListPlayersParams } from '@basketeasy/types/players';
import type { ListEventsParams } from '@basketeasy/types/events';
import type {
  ListTeamClubsParams,
  ListTeamPlayersParams,
  ListTeamsParams,
} from '@basketeasy/types/teams';

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
export const teamEventQueryKey = (clubId: string, teamId: string, eventId: string) =>
  ['clubs', clubId, 'teams', teamId, 'events', eventId] as const;
export const eventRsvpsQueryKey = (clubId: string, teamId: string, eventId: string) =>
  ['clubs', clubId, 'teams', teamId, 'events', eventId, 'rsvps'] as const;
export const eventConvocationsQueryKey = (clubId: string, teamId: string, eventId: string) =>
  ['clubs', clubId, 'teams', teamId, 'events', eventId, 'convocations'] as const;
export const eventVoteResultsQueryKey = (clubId: string, teamId: string, eventId: string) =>
  ['clubs', clubId, 'teams', teamId, 'events', eventId, 'votes'] as const;
export const eventScoresheetStatusQueryKey = (clubId: string, teamId: string, eventId: string) =>
  ['clubs', clubId, 'teams', teamId, 'events', eventId, 'scoresheet'] as const;
export const eventScoresheetExtractionQueryKey = (
  clubId: string,
  teamId: string,
  eventId: string,
) => ['clubs', clubId, 'teams', teamId, 'events', eventId, 'scoresheet-extraction'] as const;
export const teamSeasonStatsQueryKey = (clubId: string, teamId: string, season?: number) =>
  ['clubs', clubId, 'teams', teamId, 'stats', season ?? 'current'] as const;
export const teamAdminsQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'admins'] as const;
export const teamFfbbLinksQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'ffbb-links'] as const;
export const teamPouleResultsQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'ffbb-poule-results'] as const;
export const teamAdminCandidatesQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'admins', 'eligible'] as const;
export const myTeamsQueryKey = ['me', 'teams'] as const;
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
