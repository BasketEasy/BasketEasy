import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ParsedScoresheetData,
  ScoresheetExtraction,
} from '@basketeasy/types/scoresheet-extraction';
import { apiClient } from '../api/client';
import { eventScoresheetExtractionQueryKey } from './queryKeys';

/**
 * Confirms the extracted box score as ground truth, optionally overwriting
 * it with reviewer corrections first. On success, the confirmed
 * ScoresheetExtraction is written straight into the extraction query's
 * cache so the review UI flips to CONFIRMED without a second round trip.
 */
export function useConfirmEventScoresheetExtraction(
  clubId: string,
  teamId: string,
  eventId: string,
) {
  const queryClient = useQueryClient();
  const basePath = `/clubs/${clubId}/teams/${teamId}/events/${eventId}/scoresheet-extraction`;

  return useMutation({
    mutationFn: (corrections?: ParsedScoresheetData) =>
      apiClient.patch<ScoresheetExtraction>(`${basePath}/confirm`, { corrections }),
    onSuccess: (data) => {
      queryClient.setQueryData(eventScoresheetExtractionQueryKey(clubId, teamId, eventId), data);
    },
  });
}
