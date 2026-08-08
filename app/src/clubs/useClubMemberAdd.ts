import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddClubMemberRequest, ClubMember } from '@basketeasy/types/club-members';
import { apiClient } from '../api/client';
import { clubMembersQueryKey } from './queryKeys';

export function useClubMemberAdd(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddClubMemberRequest) =>
      apiClient.post<ClubMember>(`/clubs/${clubId}/members`, dto),
    onSuccess: (member) => {
      queryClient.setQueryData<ClubMember[]>(clubMembersQueryKey(clubId), (prev) => [
        ...(prev ?? []),
        member,
      ]);
    },
  });
}
