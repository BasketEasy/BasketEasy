import { useQuery } from '@tanstack/react-query';
import type { TeamSeasonStats } from '@basketeasy/types/team-stats';
import { apiClient } from '../api/client';
import { teamSeasonStatsQueryKey } from './queryKeys';

/**
 * A team's season aggregated from its confirmed scoresheets — one entry per
 * roster member, plus the season's own bounds and the count of matches that
 * contributed. Omitting `season` asks the server for the season containing
 * today, which is also why the query key falls back to 'current' rather than
 * resolving a year client-side: the season boundary is the server's to own.
 */
export function useTeamSeasonStats(clubId: string, teamId: string, season?: number) {
  return useQuery({
    queryKey: teamSeasonStatsQueryKey(clubId, teamId, season),
    queryFn: () =>
      apiClient.get<TeamSeasonStats>(
        `/clubs/${clubId}/teams/${teamId}/stats${season === undefined ? '' : `?season=${season}`}`,
      ),
  });
}
