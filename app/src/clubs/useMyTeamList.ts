import { useQuery } from '@tanstack/react-query';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { apiClient } from '../api/client';
import { myTeamsForQueryKey } from './queryKeys';
import { useActingAs } from '../guardians/useActingAs';

/**
 * The persona's teams: the user's own, or — when acting for a child — the
 * child's, each navigated through the child's club.
 */
export function useMyTeamList() {
  const { forPlayerId, isReady } = useActingAs();
  return useQuery({
    queryKey: myTeamsForQueryKey(forPlayerId ?? undefined),
    queryFn: () =>
      apiClient.get<MyTeamSummary[]>('/me/teams', forPlayerId ? { forPlayerId } : undefined),
    enabled: isReady,
  });
}
