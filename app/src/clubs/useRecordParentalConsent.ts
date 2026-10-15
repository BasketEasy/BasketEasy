import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ParentalConsent,
  RecordParentalConsentRequest,
} from '@basketeasy/types/parental-consent';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function useRecordParentalConsent(clubId: string, playerId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: RecordParentalConsentRequest) =>
      apiClient.post<ParentalConsent>(`/clubs/${clubId}/players/${playerId}/parental-consent`, dto),
    onSuccess: () => {
      // The roster row carries parentalConsentGivenAt, so the badge only
      // clears once the list is refetched.
      queryClient.invalidateQueries({ queryKey: clubPlayersQueryKey(clubId) });
    },
  });
}
