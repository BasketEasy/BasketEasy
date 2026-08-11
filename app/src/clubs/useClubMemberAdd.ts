import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddClubMemberRequest, ClubMember } from '@basketeasy/types/club-members';
import { apiClient } from '../api/client';
import { clubMembersQueryKey } from './queryKeys';

export function useClubMemberAdd(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddClubMemberRequest) =>
      apiClient.post<ClubMember>(`/clubs/${clubId}/members`, dto),
    // The members list is paginated/filtered/sorted, so the new member's
    // correct position across every cached (page, search, role, sortBy, …)
    // combination isn't derivable from the mutation response alone —
    // refetch every cached variant instead (see docs/frontend-stack.md).
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubMembersQueryKey(clubId) });
    },
  });
}
