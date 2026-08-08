import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Club, CreateClubRequest } from '@basketeasy/types/clubs';
import { apiClient } from '../api/client';
import { clubsQueryKey } from './queryKeys';

export function useClubCreate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateClubRequest) => apiClient.post<Club>('/clubs', dto),
    onSuccess: (club) => {
      queryClient.setQueryData<Club[]>(clubsQueryKey, (prev) => [...(prev ?? []), club]);
    },
  });
}
