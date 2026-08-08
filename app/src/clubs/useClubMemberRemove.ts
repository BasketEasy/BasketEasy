import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClubMember } from '@basketeasy/types/club-members';
import { apiClient } from '../api/client';
import { clubMembersQueryKey } from './queryKeys';

export function useClubMemberRemove(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => apiClient.delete(`/clubs/${clubId}/members/${userId}`),
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<ClubMember[]>(clubMembersQueryKey(clubId), (prev) =>
        (prev ?? []).filter((m) => m.userId !== userId),
      );
    },
  });
}
