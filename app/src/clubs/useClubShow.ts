import { useQuery } from '@tanstack/react-query';
import type { Club } from '@basketeasy/types/clubs';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { clubQueryKey } from './queryKeys';

export function useClubShow(clubId: string) {
  return useQuery({
    queryKey: clubQueryKey(clubId),
    staleTime: FRESHNESS.static,
    queryFn: ({ signal }) => apiClient.get<Club>(`/clubs/${clubId}`, undefined, { signal }),
  });
}
