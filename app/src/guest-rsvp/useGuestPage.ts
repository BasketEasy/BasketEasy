import { useQuery } from '@tanstack/react-query';
import type { GuestTeamPage } from '@basketeasy/types/guest-links';
import { apiClient } from '../api/client';
import { guestPageQueryKey } from './queryKeys';

export function useGuestPage(token: string) {
  return useQuery({
    queryKey: guestPageQueryKey(token),
    queryFn: () => apiClient.get<GuestTeamPage>(`/public/guest/${encodeURIComponent(token)}`),
    // A 404 is a dead link (regenerated or switched off), not a blip.
    retry: false,
    // A teammate may have answered since the tab was left open.
    refetchOnWindowFocus: true,
  });
}
