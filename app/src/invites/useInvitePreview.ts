import { useQuery } from '@tanstack/react-query';
import type { PlayerInvitePreview } from '@basketeasy/types/player-invites';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ['invites', token] as const,
    staleTime: FRESHNESS.static,
    queryFn: ({ signal }) =>
      apiClient.get<PlayerInvitePreview>(`/invites/${token}`, undefined, { signal }),
    // A 404 here means the token is invalid/expired, not a transient
    // failure — retrying won't make it valid.
    retry: false,
  });
}
