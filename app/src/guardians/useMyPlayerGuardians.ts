import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import type { MyPlayerGuardians } from '@basketeasy/types/guardians';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { myPlayerGuardiansQueryKey } from './queryKeys';

/** Who follows each of the caller's own players — one read per club they play in. */
export function useMyPlayerGuardians(playerIds: string[]) {
  return useQueries({
    queries: playerIds.map((playerId) => ({
      queryKey: myPlayerGuardiansQueryKey(playerId),
      staleTime: FRESHNESS.slow,
      queryFn: () => apiClient.get<MyPlayerGuardians>(`/me/players/${playerId}/guardians`),
    })),
  });
}

export function useRemoveMyGuardian(playerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guardianUserId: string) =>
      apiClient.delete<void>(`/me/players/${playerId}/guardians/${guardianUserId}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: myPlayerGuardiansQueryKey(playerId) }),
  });
}
