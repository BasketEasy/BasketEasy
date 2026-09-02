import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmScoresheetExtractionRequest,
  ScoresheetExtraction,
} from '@basketeasy/types/scoresheet-extraction';
import { apiClient } from '../api/client';
import { eventScoresheetExtractionQueryKey } from './queryKeys';

/**
 * Confirms the extracted box score as ground truth, optionally overwriting
 * it with reviewer corrections first, and records which roster member wore
 * each of our own jersey numbers — the mapping the season stats are folded
 * from. On success, the confirmed ScoresheetExtraction is written straight
 * into the extraction query's cache so the review UI flips to CONFIRMED
 * without a second round trip.
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
    },
  });
}
