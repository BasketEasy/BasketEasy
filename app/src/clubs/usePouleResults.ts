import { useQuery } from '@tanstack/react-query';
import type { PouleResults } from '@basketeasy/types/ffbb';
import { apiClient } from '../api/client';
import { teamPouleResultsQueryKey } from './queryKeys';

export function usePouleResults(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamPouleResultsQueryKey(clubId, teamId),
    queryFn: () =>
      apiClient.get<PouleResults>(`/clubs/${clubId}/teams/${teamId}/ffbb-poule-results`),
  });
}
