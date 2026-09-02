import { useQuery } from '@tanstack/react-query';
import type { EventScoresheet, EventScoresheetStatus } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { eventScoresheetStatusQueryKey } from './queryKeys';

// Statuses the async OCR pipeline is still expected to move off on its own.
// Nothing pushes that transition to the client (no websocket, no
// invalidation from the worker), so the query polls itself while it sits in
// one of them — otherwise the tab stays on "En file d'attente" until the
// user reloads the page, which reads as "nothing happened".
const PENDING_STATUSES: readonly EventScoresheetStatus[] = ['UPLOADED', 'QUEUED', 'PROCESSING'];

const POLL_INTERVAL_MS = 5000;

export function isScoresheetPending(status: EventScoresheetStatus): boolean {
  return PENDING_STATUSES.includes(status);
}

/**
 * Current scoresheet capture status for one MATCH event, or `null` if
 * nothing has been uploaded yet. Visible to the whole team (not
 * rostered-only) — same read visibility as the RSVP/convocation breakdowns.
 *
 * Polls itself every 5s while the OCR job is still in flight and stops as
 * soon as the status lands on a terminal one (PARSED / NEEDS_REVIEW /
 * CONFIRMED / FAILED). `null` (nothing uploaded) is terminal too — there's
 * no job to wait on.
 */
export function useEventScoresheetStatus(clubId: string, teamId: string, eventId: string) {
  return useQuery({
    queryKey: eventScoresheetStatusQueryKey(clubId, teamId, eventId),
    queryFn: () =>
      apiClient.get<EventScoresheet | null>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/scoresheet`,
      ),
    refetchInterval: (query) => {
      const current = query.state.data;
      return current && isScoresheetPending(current.status) ? POLL_INTERVAL_MS : false;
    },
  });
}
