import { useQuery, type Query } from '@tanstack/react-query';
import type { ScoresheetExtraction } from '@basketeasy/types/scoresheet-extraction';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { eventScoresheetExtractionQueryKey } from './queryKeys';

/**
 * `static` only once a manager confirmed the read. Before that it is the OCR
 * job's output (or its failure), which a retry or a new upload replaces while
 * the query is disabled behind the status poll: a fresh-looking old read would
 * then hide the new one, so an unconfirmed read stays `live`.
 */
export function scoresheetExtractionStaleTime(query: Query<ScoresheetExtraction | null>): number {
  return query.state.data?.status === 'CONFIRMED' ? FRESHNESS.static : FRESHNESS.live;
}

/**
 * The LLM's read of one MATCH event's scoresheet, or `null` if no
 * extraction has run yet (NOT a 404/error). Callers typically pass
 * `enabled: false` until the underlying scoresheet status has moved past
 * `UPLOADED`.
 */
export function useEventScoresheetExtraction(
  clubId: string,
  teamId: string,
  eventId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: eventScoresheetExtractionQueryKey(clubId, teamId, eventId),
    staleTime: scoresheetExtractionStaleTime,
    queryFn: ({ signal }) =>
      apiClient.get<ScoresheetExtraction | null>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/scoresheet-extraction`,
        undefined,
        { signal },
      ),
    enabled: options?.enabled,
  });
}
