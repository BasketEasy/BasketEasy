import { useQuery } from '@tanstack/react-query';
import type { ClubMember } from '@basketeasy/types/club-members';
import { apiClient } from '../api/client';
import { clubMembersQueryKey } from './queryKeys';

export function useClubMemberList(clubId: string) {
  return useQuery({
    queryKey: clubMembersQueryKey(clubId),
    queryFn: () => apiClient.get<ClubMember[]>(`/clubs/${clubId}/members`),
  });
}
