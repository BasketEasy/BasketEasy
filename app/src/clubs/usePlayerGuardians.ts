import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GuardianInviteLink, PlayerGuardians } from '@basketeasy/types/guardians';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { clubPlayerGuardiansQueryKey, clubPlayersQueryKey } from './queryKeys';

// Fetched only while the « Parents » dialog is open — same lazy convention as
// usePlayerInviteStatus, never one request per roster row.
export function usePlayerGuardians(clubId: string, playerId: string, enabled: boolean) {
  return useQuery({
    queryKey: clubPlayerGuardiansQueryKey(clubId, playerId),
    // A parent accepts their link on their own device while the admin has this
    // dialog open.
    staleTime: FRESHNESS.live,
    queryFn: ({ signal }) =>
      apiClient.get<PlayerGuardians>(`/clubs/${clubId}/players/${playerId}/guardians`, undefined, {
        signal,
      }),
    enabled,
  });
}

// Every change refreshes the dialog's own list and the roster page behind
// it, whose « Parents (n) » count reads Player.guardianCount.
function useInvalidateGuardians(clubId: string, playerId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: clubPlayerGuardiansQueryKey(clubId, playerId) });
    void queryClient.invalidateQueries({ queryKey: clubPlayersQueryKey(clubId) });
  };
}

export function useCreateGuardianInvite(clubId: string, playerId: string) {
  const invalidate = useInvalidateGuardians(clubId, playerId);
  return useMutation({
    mutationFn: () =>
      apiClient.post<GuardianInviteLink>(`/clubs/${clubId}/players/${playerId}/guardians/invites`),
    onSuccess: invalidate,
  });
}

export function useCancelGuardianInvite(clubId: string, playerId: string) {
  const invalidate = useInvalidateGuardians(clubId, playerId);
  return useMutation({
    mutationFn: (inviteId: string) =>
      apiClient.delete<void>(`/clubs/${clubId}/players/${playerId}/guardians/invites/${inviteId}`),
    onSuccess: invalidate,
  });
}

export function useRemoveGuardian(clubId: string, playerId: string) {
  const invalidate = useInvalidateGuardians(clubId, playerId);
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete<void>(`/clubs/${clubId}/players/${playerId}/guardians/${userId}`),
    onSuccess: invalidate,
  });
}
