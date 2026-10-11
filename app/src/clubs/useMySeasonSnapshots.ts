import { useQueries } from '@tanstack/react-query';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import type { TeamSeasonPlayerStats, TeamSeasonStats } from '@basketeasy/types/team-stats';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { useActingAs } from '../guardians/useActingAs';
import { teamSeasonStatsQueryKey } from './queryKeys';

/** How many teams « Ma saison » shows before « Voir toutes mes équipes ». */
export const MY_SEASON_TEAM_LIMIT = 2;

export interface MySeasonSnapshot {
  team: MyTeamSummary;
  /** The persona's own row; null while loading, or if the roster no longer lists them. */
  me: TeamSeasonPlayerStats | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  isRefetching: boolean;
}

/**
 * The persona's current season on each of their first two rostered teams,
 * read from the team season endpoint the « Statistiques » tab uses (same
 * query key, so the cache is shared): one source of truth for « PTS/M »,
 * never re-aggregated on the home. `teams` is `useMyTeamList()`'s data,
 * already the persona's teams, so the persona applies to every one of them.
 */
export function useMySeasonSnapshots(teams: MyTeamSummary[] | undefined): MySeasonSnapshot[] {
  const { forPlayerId: persona, isReady } = useActingAs();
  const forPlayerId = persona ?? undefined;
  const rostered = (teams ?? [])
    .filter((team) => team.rosterRole !== null)
    .slice(0, MY_SEASON_TEAM_LIMIT);
  const results = useQueries({
    queries: rostered.map((team) => ({
      queryKey: teamSeasonStatsQueryKey(team.clubId, team.teamId, undefined, forPlayerId),
      staleTime: FRESHNESS.slow,
      queryFn: ({ signal }) =>
        apiClient.get<TeamSeasonStats>(
          `/clubs/${team.clubId}/teams/${team.teamId}/stats`,
          forPlayerId ? { forPlayerId } : undefined,
          { signal },
        ),
      enabled: isReady,
    })),
  });
  return rostered.map((team, index) => {
    const result = results[index];
    return {
      team,
      me: result.data?.players.find((player) => player.isMe) ?? null,
      isLoading: result.isLoading || !isReady,
      isError: result.isError,
      refetch: () => void result.refetch(),
      isRefetching: result.isRefetching,
    };
  });
}
