import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AcceptedPlayerInvite } from '@basketeasy/types/player-invites';
import { apiClient } from '../api/client';
import { replaceSession } from '../auth/session';

// The account does not change, but linking granted it a membership and a
// roster entry, so the session is rewritten with the user the server just
// re-read and everything cached for "me" (teams, personas, dashboard) is
// dropped: none of it knew about this player.
export function useAcceptPlayerInviteAsMe(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<AcceptedPlayerInvite>(`/invites/${token}/accept-as-me`),
    onSuccess: (response) => replaceSession(queryClient, response.user),
  });
}
