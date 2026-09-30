import { useQuery } from '@tanstack/react-query';
import type { MatchStats } from '@basketeasy/types/team-stats';
import { apiClient } from '../api/client';
import { matchStatsQueryKey } from './queryKeys';
import { useTeamPersona } from '../guardians/useActingAs';

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
    queryFn: () =>
      apiClient.get<MatchStats>(
        `/clubs/${clubId}/teams/${teamId}/stats/matches/${eventId}`,
        forPlayerId ? { forPlayerId } : undefined,
      ),
    enabled: isReady && (options?.enabled ?? true),
  });
}
