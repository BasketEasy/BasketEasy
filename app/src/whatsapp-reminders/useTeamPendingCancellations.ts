import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmEventShareRequest,
  EventShareStatus,
  TeamPendingCancellation,
} from '@basketeasy/types/whatsapp-reminder';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { pendingCancellationsQueryKey } from './queryKeys';

const pendingQueryKey = pendingCancellationsQueryKey;

const base = (clubId: string, teamId: string) => `/clubs/${clubId}/teams/${teamId}/whatsapp-shares`;

export function useTeamPendingCancellations(clubId: string, teamId: string) {
  return useQuery({
    queryKey: pendingQueryKey(clubId, teamId),
    staleTime: FRESHNESS.slow,
    queryFn: () =>
      apiClient.get<TeamPendingCancellation[]>(`${base(clubId, teamId)}/pending-cancellations`),
  });
}

/** Confirms a cancellation by its share id: its event no longer exists. */
export function useConfirmCancellation(clubId: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shareId, ...body }: ConfirmEventShareRequest & { shareId: string }) =>
      apiClient.post<EventShareStatus>(`${base(clubId, teamId)}/${shareId}/confirm`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: pendingQueryKey(clubId, teamId) }),
  });
}
