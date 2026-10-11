import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ClubMember, ListClubMembersParams } from '@basketeasy/types/club-members';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { clubMembersQueryKey } from './queryKeys';

export function useClubMemberList(
  clubId: string,
  params?: ListClubMembersParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: clubMembersQueryKey(clubId, params),
    staleTime: FRESHNESS.slow,
    queryFn: ({ signal }) =>
      apiClient.get<PaginatedResult<ClubMember>>(`/clubs/${clubId}/members`, params, { signal }),
    enabled: options?.enabled,
    placeholderData: keepPreviousData,
  });
}
