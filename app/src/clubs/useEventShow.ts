import { useQuery } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { teamEventQueryKey } from './queryKeys';
import { useTeamPersona } from '../guardians/useActingAs';

export function useEventShow(clubId: string, teamId: string, eventId: string) {
  const { forPlayerId, isReady } = useTeamPersona(teamId);
  const query = useQuery({
    queryKey: teamEventQueryKey(clubId, teamId, eventId, forPlayerId),
    staleTime: FRESHNESS.live,
    queryFn: () =>
      apiClient.get<TeamEvent>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}`,
        forPlayerId ? { forPlayerId } : undefined,
      ),
    enabled: isReady,
  });
  // A query held back for the persona is still loading, not empty: callers
  // branch on isLoading, and a disabled query reports false.
  return { ...query, isLoading: query.isLoading || !isReady };
}
