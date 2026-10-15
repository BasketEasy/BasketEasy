import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamPlayer, UpdateTeamPlayerRequest } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { invalidateJerseyRotation } from './eventCache';
import {
  isTeamFamilyQuery,
  myTeamsQueryKey,
  teamEventsQueryKeyPrefix,
  teamPlayersQueryKey,
} from './queryKeys';

/**
 * One roster entry's editable fields: the roster role, the jersey wash exemption.
 *
 * The paginated rosters are refetched (a role can move a row between filters).
 * An exemption changes the wash pool, so the rotation and every event of the
 * team (each match's suggested holder) follow; a role is printed on the RSVP
 * and convocation rosters and in « Mes équipes », and nowhere in the rotation.
 */
export function useTeamPlayerUpdate(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playerId, ...dto }: UpdateTeamPlayerRequest & { playerId: string }) =>
      apiClient.patch<TeamPlayer>(`/clubs/${clubId}/teams/${teamId}/players/${playerId}`, dto),
    onSuccess: (_data, { role, jerseyDutyExempt }) => {
      queryClient.invalidateQueries({ queryKey: teamPlayersQueryKey(clubId, teamId) });
      if (jerseyDutyExempt !== undefined) {
        invalidateJerseyRotation(queryClient, { clubId, teamId });
        queryClient.invalidateQueries({ queryKey: teamEventsQueryKeyPrefix(clubId, teamId) });
      }
      if (role !== undefined) {
        queryClient.invalidateQueries({ queryKey: myTeamsQueryKey });
        const isTeamEventQuery = isTeamFamilyQuery(['events'], { clubId, teamId });
        queryClient.invalidateQueries({
          predicate: (query) =>
            isTeamEventQuery(query) &&
            (query.queryKey[6] === 'rsvps' || query.queryKey[6] === 'convocations'),
        });
      }
    },
  });
}
