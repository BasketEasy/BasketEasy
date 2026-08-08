import { useQuery } from '@tanstack/react-query';
import type { Club } from '@basketeasy/types/clubs';
import { apiClient } from '../api/client';
import { clubsQueryKey } from './queryKeys';

export function useClubList() {
  return useQuery({
    queryKey: clubsQueryKey,
    queryFn: () => apiClient.get<Club[]>('/clubs'),
  });
}
