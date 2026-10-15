import { useQuery } from '@tanstack/react-query';
import type { PouleResults } from '@basketeasy/types/ffbb';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { teamPouleResultsQueryKey } from './queryKeys';

export function usePouleResults(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamPouleResultsQueryKey(clubId, teamId),
    // The server scrapes FFBB live for this: never retried, and not refetched on
    // every mount. Standings move when FFBB records a result, so not `static`.
    staleTime: FRESHNESS.slow,
    retry: false,
    queryFn: ({ signal }) =>
      apiClient.get<PouleResults>(
        `/clubs/${clubId}/teams/${teamId}/ffbb-poule-results`,
        undefined,
        { signal },
      ),
  });
}
