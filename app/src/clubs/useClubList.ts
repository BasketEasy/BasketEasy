import { useQuery } from '@tanstack/react-query';
import type { Club } from '@basketeasy/types/clubs';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { useAccount } from '../auth/useAccount';
import { clubsQueryKey } from './queryKeys';

export function useClubList() {
  const { user } = useAccount();

  // `ActiveClubProvider` (mounted around the whole app in main.tsx, so it
  // renders on the public LandingPage too) pulls this in via useAdminClubs()
  // — without `enabled` it fired GET /clubs for a logged-out visitor on
  // every page load, a request that could only ever fail for lack of a
  // session.
  return useQuery({
    queryKey: clubsQueryKey,
    // Mounted for the whole session (header, club switcher), so never discarded:
    // a finite tier, or a club added by someone else would never show up.
    staleTime: FRESHNESS.slow,
    queryFn: ({ signal }) => apiClient.get<Club[]>('/clubs', undefined, { signal }),
    enabled: Boolean(user),
  });
}
