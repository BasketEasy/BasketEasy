import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AccessTokenResponse } from '@basketeasy/types/auth';
import type { AcceptPlayerInviteRequest } from '@basketeasy/types/player-invites';
import { apiClient, setAccessToken } from '../api/client';
import { sessionQueryKey } from '../auth/session';

// Mirrors useRegister (app/src/auth/mutations.ts) — same "write straight into
// the session cache" pattern, since accepting an invite also creates and
// logs into a brand-new account.
export function useAcceptPlayerInvite(token: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AcceptPlayerInviteRequest) =>
      apiClient.post<AccessTokenResponse>(`/invites/${token}/accept`, dto),
    onSuccess: (response) => {
      setAccessToken(response.accessToken);
      queryClient.setQueryData(sessionQueryKey, response.user);
    },
  });
}
