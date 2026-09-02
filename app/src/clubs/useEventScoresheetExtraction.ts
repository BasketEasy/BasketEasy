import { useQuery } from '@tanstack/react-query';
import type { ScoresheetExtraction } from '@basketeasy/types/scoresheet-extraction';
import { apiClient } from '../api/client';
import { eventScoresheetExtractionQueryKey } from './queryKeys';

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
    queryFn: () =>
      apiClient.get<ScoresheetExtraction | null>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/scoresheet-extraction`,
      ),
    enabled: options?.enabled,
  });
}
