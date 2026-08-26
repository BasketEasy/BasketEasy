import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Club } from '@basketeasy/types/clubs';
import type { LinkFfbbClubRequest } from '@basketeasy/types/ffbb';
import { apiClient } from '../api/client';
import { clubQueryKey } from './queryKeys';

export function useClubFfbbLinkSet(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: LinkFfbbClubRequest) =>
      apiClient.patch<Club>(`/clubs/${clubId}/ffbb-link`, dto),
    onSuccess: (club) => {
      queryClient.setQueryData<Club>(clubQueryKey(clubId), club);
    },
  });
}
