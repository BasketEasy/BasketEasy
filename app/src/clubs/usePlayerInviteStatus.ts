import { useQuery } from '@tanstack/react-query';
import type { PlayerInviteStatus } from '@basketeasy/types/player-invites';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { clubPlayerInviteQueryKey } from './queryKeys';

// Fetched only while the invite dialog is open (enabled), not eagerly per
// roster row — same "lazily fetched only once a viewer opens it" convention
// as the event RSVP/convocation roster breakdowns.
export function usePlayerInviteStatus(clubId: string, playerId: string, enabled: boolean) {
  return useQuery({
    queryKey: clubPlayerInviteQueryKey(clubId, playerId),
    // The invitee accepts on their own device while the admin waits on this
    // dialog, so it is not held for ten minutes.
    staleTime: FRESHNESS.live,
    queryFn: ({ signal }) =>
      apiClient.get<PlayerInviteStatus>(`/clubs/${clubId}/players/${playerId}/invite`, undefined, {
        signal,
      }),
    enabled,
  });
}
