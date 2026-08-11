import { useQuery } from '@tanstack/react-query';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { apiClient } from '../api/client';
import { myTeamsQueryKey } from './queryKeys';

export function useMyTeamList() {
  return useQuery({
    queryKey: myTeamsQueryKey,
    queryFn: () => apiClient.get<MyTeamSummary[]>('/me/teams'),
  });
}
