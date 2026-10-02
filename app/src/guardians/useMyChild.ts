import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyChildProfile, UpdateMyChildRequest } from '@basketeasy/types/guardians';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { myChildQueryKey, personasQueryKey } from './queryKeys';

export function useMyChild(playerId: string) {
  return useQuery({
    queryKey: myChildQueryKey(playerId),
    // Co-guardians and the club's admins edit the same profile.
    staleTime: FRESHNESS.slow,
    queryFn: () => apiClient.get<MyChildProfile>(`/me/children/${playerId}`),
  });
}

export function useUpdateMyChild(playerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateMyChildRequest) =>
      apiClient.patch<MyChildProfile>(`/me/children/${playerId}`, dto),
    onSuccess: (profile) => {
      queryClient.setQueryData(myChildQueryKey(playerId), profile);
      // The persona list names the child too.
      void queryClient.invalidateQueries({ queryKey: personasQueryKey });
    },
  });
}

export function useStopFollowingChild(playerId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<void>(`/me/children/${playerId}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: myChildQueryKey(playerId) });
      void queryClient.invalidateQueries({ queryKey: personasQueryKey });
    },
  });
}
