import { useQuery } from '@tanstack/react-query';
import type { PlayerInvitePreview } from '@basketeasy/types/player-invites';
import { apiClient } from '../api/client';

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ['invites', token] as const,
    queryFn: () => apiClient.get<PlayerInvitePreview>(`/invites/${token}`),
    // A 404 here means the token is invalid/expired, not a transient
    // failure — retrying won't make it valid.
    retry: false,
  });
}
