import { useQuery } from '@tanstack/react-query';
import type { Club } from '@basketeasy/types/clubs';
import { apiClient } from '../api/client';
import { clubQueryKey } from './queryKeys';

export function useClubShow(clubId: string) {
  return useQuery({
    queryKey: clubQueryKey(clubId),
    queryFn: () => apiClient.get<Club>(`/clubs/${clubId}`),
  });
}
