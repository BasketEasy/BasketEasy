import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConfirmEventShareRequest,
  EventShareStatus,
  EventShareType,
  EventWhatsAppShare,
} from '@basketeasy/types/whatsapp-reminder';
import { apiClient } from '../api/client';
import { teamEventsQueryKeyPrefix, whatsAppShareQueryKey } from '../clubs/queryKeys';

const path = (clubId: string, teamId: string, eventId: string) =>
  `/clubs/${clubId}/teams/${teamId}/events/${eventId}/whatsapp-share`;

export function useEventWhatsAppShare(clubId: string, teamId: string, eventId: string) {
  return useQuery({
    queryKey: whatsAppShareQueryKey(clubId, teamId, eventId),
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
    // The event lists carry the « À partager » badge (`event.whatsAppShare`), so
    // sharing has to refresh them too, not only this card's own query. The
    // team's events prefix covers that query (it sits under the event's key):
    // invalidating it a second time on its own would restart its refetch.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKeyPrefix(clubId, teamId) }),
  });
}

/** The card's own « Réactiver le lien » writes the guest-link cache elsewhere: refetch here. */
export function useInvalidateEventWhatsAppShare(clubId: string, teamId: string, eventId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: whatsAppShareQueryKey(clubId, teamId, eventId) });
}
