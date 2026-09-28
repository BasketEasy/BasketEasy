import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  AuditLogEntry,
  ListAuditLogParams,
  RetentionRunSummary,
} from '@basketeasy/types/platform-admin';
import type {
  AdminClubDetail,
  AdminClubMember,
  AdminClubMembersQuery,
  AdminClubsQuery,
  AdminClubSummary,
  AdminEventDetail,
  AdminEventsQuery,
  AdminEventSummary,
  AdminPlayerDetail,
  AdminPlayersQuery,
  AdminPlayerSummary,
  AdminRosterEntry,
  AdminScoresheetsQuery,
  AdminScoresheetSummary,
  AdminTeamDetail,
  AdminTeamsQuery,
  AdminTeamSummary,
  AdminUserDetail,
  AdminUsersQuery,
  AdminUserSummary,
} from '@basketeasy/types/platform-admin-browse';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import {
  ADMIN_SEARCH_MIN_LENGTH,
  type AdminSearchResult,
} from '@basketeasy/types/platform-admin-search';
import { apiClient } from '../api/client';
import {
  adminAuditLogQueryKey,
  adminClubMembersQueryKey,
  adminClubQueryKey,
  adminClubsQueryKey,
  adminEventQueryKey,
  adminEventsQueryKey,
  adminPlayerQueryKey,
  adminPlayersQueryKey,
  adminScoresheetsQueryKey,
  adminSearchQueryKey,
  adminTeamQueryKey,
  adminTeamRosterQueryKey,
  adminTeamsQueryKey,
  adminUserQueryKey,
  adminUsersQueryKey,
  retentionRunsQueryKey,
} from './queryKeys';

// Every back-office read. Lists keep the previous page on screen while the
// next one loads, so paging and filtering don't flash the loading branch.

export function useRetentionRuns() {
  return useQuery({
    queryKey: retentionRunsQueryKey,
    queryFn: () => apiClient.get<RetentionRunSummary[]>('/admin/retention/runs'),
  });
}

export function useAdminAuditLog(query: ListAuditLogParams) {
  return useQuery({
    queryKey: adminAuditLogQueryKey(query),
    queryFn: () => apiClient.get<PaginatedResult<AuditLogEntry>>('/admin/audit-log', query),
    placeholderData: keepPreviousData,
  });
}

export function useAdminClubs(query: AdminClubsQuery) {
  return useQuery({
    queryKey: adminClubsQueryKey(query),
    queryFn: () => apiClient.get<PaginatedResult<AdminClubSummary>>('/admin/clubs', query),
    placeholderData: keepPreviousData,
  });
}

export function useAdminClub(clubId: string) {
  return useQuery({
    queryKey: adminClubQueryKey(clubId),
    queryFn: () => apiClient.get<AdminClubDetail>(`/admin/clubs/${clubId}`),
  });
}

export function useAdminClubMembers(clubId: string, query: AdminClubMembersQuery) {
  return useQuery({
    queryKey: adminClubMembersQueryKey(clubId, query),
    queryFn: () =>
      apiClient.get<PaginatedResult<AdminClubMember>>(`/admin/clubs/${clubId}/members`, query),
    placeholderData: keepPreviousData,
  });
}

export function useAdminTeams(query: AdminTeamsQuery) {
  return useQuery({
    queryKey: adminTeamsQueryKey(query),
    queryFn: () => apiClient.get<PaginatedResult<AdminTeamSummary>>('/admin/teams', query),
    placeholderData: keepPreviousData,
  });
}

export function useAdminTeam(teamId: string) {
  return useQuery({
    queryKey: adminTeamQueryKey(teamId),
    queryFn: () => apiClient.get<AdminTeamDetail>(`/admin/teams/${teamId}`),
  });
}

export function useAdminTeamRoster(teamId: string) {
  return useQuery({
    queryKey: adminTeamRosterQueryKey(teamId),
    queryFn: () => apiClient.get<AdminRosterEntry[]>(`/admin/teams/${teamId}/roster`),
  });
}

export function useAdminUsers(query: AdminUsersQuery) {
  return useQuery({
    queryKey: adminUsersQueryKey(query),
    queryFn: () => apiClient.get<PaginatedResult<AdminUserSummary>>('/admin/users', query),
    placeholderData: keepPreviousData,
  });
}

/**
 * A DATA_OFFICER's fetch of a person writes an ADMIN_PII_VIEWED row
 * server-side, so person records are pinned to a single deliberate read: no
 * refetch on window focus or reconnect, no background revalidation, no retry.
 * A DPO answering "who looked at this person's data and when" must not have
 * to explain away six identical rows produced by a tab regaining focus.
 */
const personRecordOptions = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  staleTime: Infinity,
  retry: false,
} as const;

export function useAdminUser(userId: string) {
  return useQuery({
    queryKey: adminUserQueryKey(userId),
    queryFn: () => apiClient.get<AdminUserDetail>(`/admin/users/${userId}`),
    ...personRecordOptions,
  });
}

export function useAdminPlayers(query: AdminPlayersQuery) {
  return useQuery({
    queryKey: adminPlayersQueryKey(query),
    queryFn: () => apiClient.get<PaginatedResult<AdminPlayerSummary>>('/admin/players', query),
    placeholderData: keepPreviousData,
  });
}

export function useAdminPlayer(playerId: string) {
  return useQuery({
    queryKey: adminPlayerQueryKey(playerId),
    queryFn: () => apiClient.get<AdminPlayerDetail>(`/admin/players/${playerId}`),
    ...personRecordOptions,
  });
}

export function useAdminEvents(query: AdminEventsQuery, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: adminEventsQueryKey(query),
    queryFn: () => apiClient.get<PaginatedResult<AdminEventSummary>>('/admin/events', query),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useAdminEvent(eventId: string) {
  return useQuery({
    queryKey: adminEventQueryKey(eventId),
    queryFn: () => apiClient.get<AdminEventDetail>(`/admin/events/${eventId}`),
  });
}

export function useAdminScoresheets(query: AdminScoresheetsQuery) {
  return useQuery({
    queryKey: adminScoresheetsQueryKey(query),
    queryFn: () =>
      apiClient.get<PaginatedResult<AdminScoresheetSummary>>('/admin/scoresheets', query),
    placeholderData: keepPreviousData,
  });
}

/**
 * The global search. Idle below the minimum length (the API would 400), and
 * kept fresh for 30s so reopening the box on the same text is instant.
 */
export function useAdminSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: adminSearchQueryKey(query),
    queryFn: () => apiClient.get<AdminSearchResult>('/admin/search', { q: query }),
    enabled: query.length >= ADMIN_SEARCH_MIN_LENGTH,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
