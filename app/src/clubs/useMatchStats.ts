import { useQuery, type Query } from '@tanstack/react-query';
import type { MatchStats } from '@basketeasy/types/team-stats';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { matchStatsQueryKey } from './queryKeys';
import { useTeamPersona } from '../guardians/useActingAs';

/**
 * Until a manager confirms the scoresheet there is nothing here, and that can
 * happen while a player has the page open: `live` while `hasStats` is false.
 * Once there are lines they only move on a re-confirm or a roster rename, both
 * of which invalidate the team's stats, so `slow`.
 */
export function matchStatsStaleTime(query: Query<MatchStats>): number {
  return query.state.data?.hasStats ? FRESHNESS.slow : FRESHNESS.live;
}

/**
 * One match's lines from its confirmed scoresheet. `enabled` lets the caller
 * hold the request back until the match has been played: before kickoff
 * there is no sheet to read.
 */
export function useMatchStats(
  clubId: string,
  teamId: string,
  eventId: string,
  options?: { enabled?: boolean },
) {
  const { forPlayerId, isReady } = useTeamPersona(teamId);
  return useQuery({
    queryKey: matchStatsQueryKey(clubId, teamId, eventId, forPlayerId),
    staleTime: matchStatsStaleTime,
    queryFn: () =>
      apiClient.get<MatchStats>(
        `/clubs/${clubId}/teams/${teamId}/stats/matches/${eventId}`,
        forPlayerId ? { forPlayerId } : undefined,
      ),
    enabled: isReady && (options?.enabled ?? true),
  });
}
