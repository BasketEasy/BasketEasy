import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { clubMembersQueryKey } from './queryKeys';

export function useClubMemberRemove(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => apiClient.delete(`/clubs/${clubId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubMembersQueryKey(clubId) });
    },
  });
}
