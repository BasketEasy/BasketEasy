import { useQuery } from '@tanstack/react-query';
import type { TeamSeasonStats } from '@basketeasy/types/team-stats';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { teamSeasonStatsQueryKey } from './queryKeys';
import { useTeamPersona } from '../guardians/useActingAs';

/**
 * A team's season aggregated from its confirmed scoresheets — one entry per
 * roster member, plus the season's own bounds and the count of matches that
 * contributed. Omitting `season` asks the server for the season containing
 * today, which is also why the query key falls back to 'current' rather than
 * resolving a year client-side: the season boundary is the server's to own.
 */
export function useTeamSeasonStats(clubId: string, teamId: string, season?: number) {
  // A parent reading their child's team sees the child's row highlighted.
  const { forPlayerId, isReady } = useTeamPersona(teamId);
  const query = useQuery({
    queryKey: teamSeasonStatsQueryKey(clubId, teamId, season, forPlayerId),
    // Awards count every teammate's vote, and `season: 'current'` rolls over on
    // 1 September: both move without a write of ours.
    staleTime: FRESHNESS.slow,
    queryFn: ({ signal }) =>
      apiClient.get<TeamSeasonStats>(
        `/clubs/${clubId}/teams/${teamId}/stats`,
        {
          ...(season === undefined ? {} : { season }),
          ...(forPlayerId ? { forPlayerId } : {}),
        },
        { signal },
      ),
    enabled: isReady,
  });
  // A query held back for the persona is still loading, not empty: callers
  // branch on isLoading, and a disabled query reports false.
  return { ...query, isLoading: query.isLoading || !isReady };
}
