import { useQuery } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { teamEventQueryKey } from './queryKeys';
import { useTeamActingAs } from '../guardians/useActingAs';

export function useEventShow(clubId: string, teamId: string, eventId: string) {
  const forPlayerId = useTeamActingAs(teamId);
  return useQuery({
    queryKey: teamEventQueryKey(clubId, teamId, eventId, forPlayerId),
    queryFn: () =>
      apiClient.get<TeamEvent>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}`,
        forPlayerId ? { forPlayerId } : undefined,
      ),
  });
}
