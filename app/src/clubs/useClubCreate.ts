import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Club, CreateClubRequest } from '@basketeasy/types/clubs';
import type { User } from '@basketeasy/types/auth';
import { apiClient } from '../api/client';
import { clubsQueryKey } from './queryKeys';
import { sessionQueryKey } from '../auth/session';

export function useClubCreate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateClubRequest) => apiClient.post<Club>('/clubs', dto),
    onSuccess: (club) => {
      queryClient.setQueryData<Club[]>(clubsQueryKey, (prev) => [...(prev ?? []), club]);
      // The creator is always granted ADMIN on their new club (see
      // ClubsService.createClub), but the response here is just the Club,
      // not a refreshed User — update the cached session directly so
      // useIsClubAdmin already sees the new membership on the next render.
      // Without this, ClubCreateForm's navigate to /clubs/:id/members races
      // a stale cached /auth/me and bounces the admin to /dashboard.
      queryClient.setQueryData<User | null>(sessionQueryKey, (user) =>
        user
          ? { ...user, memberships: [...user.memberships, { clubId: club.id, role: 'ADMIN' }] }
          : user,
      );
    },
  });
}
