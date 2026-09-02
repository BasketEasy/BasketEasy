import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventScoresheet } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { eventScoresheetExtractionQueryKey, eventScoresheetStatusQueryKey } from './queryKeys';

/**
 * Re-runs the OCR against the file already archived in R2. The recovery path
 * for a vision-provider outage: the sheet itself is fine, so asking for the
 * photo again would be busywork — only the job is new.
 *
 * On success the returned (QUEUED) EventScoresheet is written straight into
 * the status query's cache, which puts the tab back on its self-polling
 * "analyse en cours" frame without a second round trip, and the now-stale
 * FAILED extraction is invalidated so the finished read replaces it.
 */
export function useRetryEventScoresheetExtraction(clubId: string, teamId: string, eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<EventScoresheet>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/scoresheet-extraction/retry`,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(eventScoresheetStatusQueryKey(clubId, teamId, eventId), data);
      void queryClient.invalidateQueries({
        queryKey: eventScoresheetExtractionQueryKey(clubId, teamId, eventId),
      });
    },
  });
}
