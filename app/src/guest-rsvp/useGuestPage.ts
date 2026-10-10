import { useQuery } from '@tanstack/react-query';
import type { GuestTeamPage } from '@basketeasy/types/guest-links';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { guestPageQueryKey } from './queryKeys';

export function useGuestPage(token: string) {
  return useQuery({
    queryKey: guestPageQueryKey(token),
    // A teammate may have answered since the tab was left open: `live` refetches
    // on focus once 30 s have passed.
    staleTime: FRESHNESS.live,
    queryFn: () => apiClient.get<GuestTeamPage>(`/public/guest/${encodeURIComponent(token)}`),
    // A 404 is a dead link (regenerated or switched off), not a blip.
    retry: false,
  });
}
