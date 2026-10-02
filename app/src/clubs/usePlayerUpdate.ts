import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Player, UpdatePlayerRequest } from '@basketeasy/types/players';
import { apiClient } from '../api/client';
import { invalidateRosterDependents } from './eventCache';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerUpdate(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playerId, dto }: { playerId: string; dto: UpdatePlayerRequest }) =>
      apiClient.patch<Player>(`/clubs/${clubId}/players/${playerId}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubPlayersQueryKey(clubId) });
      // The player's name is on every roster, RSVP and convocation list, the
      // season table, the personas and the home; deleting one also removes
      // the roster slots. Which teams they are on is not known here, so every
      // team's queries are marked (the active ones refetch, the rest wait).
      invalidateRosterDependents(queryClient);
    },
  });
}
