import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Club } from '@basketeasy/types/clubs';
import { apiClient } from '../api/client';
import { clubQueryKey } from './queryKeys';

export function useClubFfbbLinkRemove(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.delete(`/clubs/${clubId}/ffbb-link`),
    // The route answers 204, and the only thing it changes is the club's own
    // code, so the cached club is patched. `clubQueryKey(clubId)` is the
    // prefix of every query of the club (teams, members, players, events):
    // invalidating it refetched all of them for a change none of them read.
    onSuccess: () => {
      queryClient.setQueryData<Club>(
        clubQueryKey(clubId),
        (club) => club && { ...club, ffbbClubCode: null },
      );
    },
  });
}
