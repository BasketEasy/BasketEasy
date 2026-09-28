import type {
  AdminClubMembersQuery,
  AdminClubsQuery,
  AdminEventsQuery,
  AdminPlayersQuery,
  AdminScoresheetsQuery,
  AdminTeamsQuery,
  AdminUsersQuery,
} from '@basketeasy/types/platform-admin-browse';
import type { ListAuditLogParams } from '@basketeasy/types/platform-admin';
import type { AdminStatsQuery } from '@basketeasy/types/platform-admin-stats';

// Its own prefix, and deliberately not under `me` or `clubs`: back-office
// data is platform-scoped, and every one of these queries becomes
// unauthorized the moment the step-up session ends — which is what lets the
// shell drop the whole subtree in one `removeQueries` call.
export const adminQueryKeyPrefix = ['admin'] as const;

export const retentionRunsQueryKey = [...adminQueryKeyPrefix, 'retention', 'runs'] as const;

// Each area keeps its lists and its records under one prefix, so a later
// mutation can invalidate "everything about clubs" in one call. A list key
// ends in its query object and a record key in its id plus a noun, so the two
// can never collide.

export const adminClubsQueryKey = (query: AdminClubsQuery) =>
  [...adminQueryKeyPrefix, 'clubs', 'list', query] as const;
export const adminClubQueryKey = (clubId: string) =>
  [...adminQueryKeyPrefix, 'clubs', clubId, 'detail'] as const;
export const adminClubMembersQueryKey = (clubId: string, query: AdminClubMembersQuery) =>
  [...adminQueryKeyPrefix, 'clubs', clubId, 'members', query] as const;

export const adminTeamsQueryKey = (query: AdminTeamsQuery) =>
  [...adminQueryKeyPrefix, 'teams', 'list', query] as const;
export const adminTeamQueryKey = (teamId: string) =>
  [...adminQueryKeyPrefix, 'teams', teamId, 'detail'] as const;
export const adminTeamRosterQueryKey = (teamId: string) =>
  [...adminQueryKeyPrefix, 'teams', teamId, 'roster'] as const;

export const adminUsersQueryKey = (query: AdminUsersQuery) =>
  [...adminQueryKeyPrefix, 'users', 'list', query] as const;
export const adminUserQueryKey = (userId: string) =>
  [...adminQueryKeyPrefix, 'users', userId, 'detail'] as const;

export const adminPlayersQueryKey = (query: AdminPlayersQuery) =>
  [...adminQueryKeyPrefix, 'players', 'list', query] as const;
export const adminPlayerQueryKey = (playerId: string) =>
  [...adminQueryKeyPrefix, 'players', playerId, 'detail'] as const;

export const adminEventsQueryKey = (query: AdminEventsQuery) =>
  [...adminQueryKeyPrefix, 'events', 'list', query] as const;
export const adminEventQueryKey = (eventId: string) =>
  [...adminQueryKeyPrefix, 'events', eventId, 'detail'] as const;

export const adminScoresheetsQueryKey = (query: AdminScoresheetsQuery) =>
  [...adminQueryKeyPrefix, 'scoresheets', 'list', query] as const;

export const adminAuditLogQueryKey = (query: ListAuditLogParams) =>
  [...adminQueryKeyPrefix, 'audit-log', query] as const;

export const adminSearchQueryKey = (q: string) => [...adminQueryKeyPrefix, 'search', q] as const;

export const adminStatsQueryKey = (query: AdminStatsQuery) =>
  [...adminQueryKeyPrefix, 'stats', query] as const;
