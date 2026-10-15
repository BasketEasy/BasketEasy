import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmScoresheetExtractionRequest,
  ScoresheetExtraction,
} from '@basketeasy/types/scoresheet-extraction';
import type { EventScoresheet } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { invalidateDashboard, invalidateEventDetails, invalidateEventLists } from './eventCache';
import {
  eventScoresheetExtractionQueryKey,
  eventScoresheetStatusQueryKey,
  teamStatsQueryKeyPrefix,
} from './queryKeys';

/**
 * Confirms the extracted box score as ground truth, optionally overwriting
 * it with reviewer corrections first, and records which roster member wore
 * each of our own jersey numbers — the mapping the season stats are folded
 * from. On success, the confirmed ScoresheetExtraction is written straight
 * into the extraction query's cache so the review UI flips to CONFIRMED
 * without a second round trip. The team's stats (the season table and this
 * match's lines) are folded from the same confirm, so they are refetched.
 * The confirm also gives the event its `result`, which the event's detail, the
 * lists and the dashboard all carry, and flips the sheet's own status (patched
 * in place: the response says nothing more than that).
 *
 * The whole request is typed rather than assembled inline, so a field added
 * to the contract can't quietly go unsent.
 */
export function useConfirmEventScoresheetExtraction(
  clubId: string,
  teamId: string,
  eventId: string,
) {
  const queryClient = useQueryClient();
  const basePath = `/clubs/${clubId}/teams/${teamId}/events/${eventId}/scoresheet-extraction`;

  return useMutation({
    mutationFn: (request: ConfirmScoresheetExtractionRequest) =>
      apiClient.patch<ScoresheetExtraction>(`${basePath}/confirm`, request),
    onSuccess: (data) => {
      queryClient.setQueryData(eventScoresheetExtractionQueryKey(clubId, teamId, eventId), data);
      queryClient.setQueryData<EventScoresheet | null>(
        eventScoresheetStatusQueryKey(clubId, teamId, eventId),
        (sheet) => sheet && { ...sheet, status: 'CONFIRMED' },
      );
      void queryClient.invalidateQueries({ queryKey: teamStatsQueryKeyPrefix(clubId, teamId) });
      invalidateEventDetails(queryClient, { clubId, teamId, eventId });
      invalidateEventLists(queryClient, { clubId, teamId });
      invalidateDashboard(queryClient);
    },
  });
}
