import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmEventShareRequest,
  EventShareStatus,
  EventShareType,
  EventWhatsAppShare,
} from '@basketeasy/types/whatsapp-reminder';
import { apiClient } from '../api/client';

const shareQueryKey = (clubId: string, teamId: string, eventId: string) =>
  ['clubs', clubId, 'teams', teamId, 'events', eventId, 'whatsapp-share'] as const;

const path = (clubId: string, teamId: string, eventId: string) =>
  `/clubs/${clubId}/teams/${teamId}/events/${eventId}/whatsapp-share`;

export function useEventWhatsAppShare(clubId: string, teamId: string, eventId: string) {
  return useQuery({
    queryKey: shareQueryKey(clubId, teamId, eventId),
    queryFn: () => apiClient.get<EventWhatsAppShare>(path(clubId, teamId, eventId)),
  });
}

export function useConfirmEventShare(clubId: string, teamId: string, eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      type,
      ...body
    }: ConfirmEventShareRequest & { type: Exclude<EventShareType, 'CANCELLATION'> }) =>
      apiClient.post<EventShareStatus>(`${path(clubId, teamId, eventId)}/${type}/confirm`, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: shareQueryKey(clubId, teamId, eventId) }),
  });
}

/** The card's own « Réactiver le lien » writes the guest-link cache elsewhere: refetch here. */
export function useInvalidateEventWhatsAppShare(clubId: string, teamId: string, eventId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: shareQueryKey(clubId, teamId, eventId) });
}
