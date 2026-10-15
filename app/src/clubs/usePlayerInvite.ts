import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PlayerInviteLink } from '@basketeasy/types/player-invites';
import { apiClient } from '../api/client';
import { clubPlayerInviteQueryKey } from './queryKeys';

export function usePlayerInvite(clubId: string, playerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<PlayerInviteLink>(`/clubs/${clubId}/players/${playerId}/invite`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubPlayerInviteQueryKey(clubId, playerId) });
    },
  });
}
