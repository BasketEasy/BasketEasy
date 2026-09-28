import { useQuery } from '@tanstack/react-query';
import type { RetentionRunSummary } from '@basketeasy/types/platform-admin';
import type {
  AdminUserDetail,
  AdminUsersQuery,
  AdminUserSummary,
} from '@basketeasy/types/platform-admin-browse';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { platformUserQueryKey, platformUsersQueryKey, retentionRunsQueryKey } from './queryKeys';

export function useRetentionRuns() {
  return useQuery({
    queryKey: retentionRunsQueryKey,
    queryFn: () => apiClient.get<RetentionRunSummary[]>('/admin/retention/runs'),
  });
}

export function usePlatformUsers(params: AdminUsersQuery) {
  return useQuery({
    queryKey: platformUsersQueryKey(params),
    queryFn: () => apiClient.get<PaginatedResult<AdminUserSummary>>('/admin/users', params),
  });
}

/**
 * A DATA_OFFICER's fetch of this writes an ADMIN_PII_VIEWED row server-side, so it is
 * pinned to a single deliberate read: no refetch on window focus, no
 * background revalidation. A DPO answering "who looked at this person's data
 * and when" must not have to explain away six identical rows produced by a
 * browser tab regaining focus.
 */
export function usePlatformUser(userId: string) {
  return useQuery({
    queryKey: platformUserQueryKey(userId),
    queryFn: () => apiClient.get<AdminUserDetail>(`/admin/users/${userId}`),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    retry: false,
  });
}
