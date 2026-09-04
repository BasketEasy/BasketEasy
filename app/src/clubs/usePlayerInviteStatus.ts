import { useQuery } from '@tanstack/react-query';
import type { PlayerInviteStatus } from '@basketeasy/types/player-invites';
import { apiClient } from '../api/client';
import { clubPlayerInviteQueryKey } from './queryKeys';

// Fetched only while the invite dialog is open (enabled), not eagerly per
// roster row — same "lazily fetched only once a viewer opens it" convention
// as the event RSVP/convocation roster breakdowns.
export function usePlayerInviteStatus(clubId: string, playerId: string, enabled: boolean) {
  return useQuery({
    queryKey: clubPlayerInviteQueryKey(clubId, playerId),
    queryFn: () => apiClient.get<PlayerInviteStatus>(`/clubs/${clubId}/players/${playerId}/invite`),
    enabled,
  });
}
