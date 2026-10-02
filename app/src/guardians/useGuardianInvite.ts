import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessTokenResponse } from '@basketeasy/types/auth';
import type {
  AcceptedGuardianInvite,
  AcceptGuardianInviteAsMeRequest,
  AcceptGuardianInviteRequest,
  GuardianInvitePreview,
} from '@basketeasy/types/guardians';
import { apiClient, setAccessToken } from '../api/client';
import { replaceSession } from '../auth/session';
import { guardianInvitePreviewQueryKey, personasQueryKey } from './queryKeys';

export function useGuardianInvitePreview(token: string) {
  return useQuery({
    queryKey: guardianInvitePreviewQueryKey(token),
    queryFn: () => apiClient.get<GuardianInvitePreview>(`/guardian-invites/${token}`),
    // A 404/409 here is a fact about the link, not a transient failure.
    retry: false,
  });
}

// Creates the parent's account and logs into it — the same "write straight
// into the session cache" shape as useAcceptPlayerInvite.
export function useAcceptGuardianInvite(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: AcceptGuardianInviteRequest) =>
      apiClient.post<AccessTokenResponse>(`/guardian-invites/${token}/accept`, dto),
    onSuccess: (response) => {
      setAccessToken(response.accessToken);
      replaceSession(queryClient, response.user);
    },
  });
}

// For a parent who already has an account (they play, coach, or follow
// another child): the session stays, only the personas change.
export function useAcceptGuardianInviteAsMe(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: AcceptGuardianInviteAsMeRequest) =>
      apiClient.post<AcceptedGuardianInvite>(`/guardian-invites/${token}/accept-as-me`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: personasQueryKey }),
  });
}
