import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  GUEST_RSVP_CLOSED_CODE,
  type GuestEvent,
  type GuestRsvpRequest,
  type GuestTeamPage,
} from '@basketeasy/types/guest-links';
import { ApiError, apiClient } from '../api/client';
import { guestPageQueryKey } from './queryKeys';

// The endpoints answer with the updated event: write it straight into the
// page so the buttons move without a refetch.
function storeEvent(queryClient: QueryClient, token: string, event: GuestEvent) {
  queryClient.setQueryData<GuestTeamPage>(guestPageQueryKey(token), (page) =>
    page ? { ...page, events: page.events.map((e) => (e.id === event.id ? event : e)) } : page,
  );
}

// A closed event has nothing left to show: refetch so it drops off the page.
function refetchIfClosed(queryClient: QueryClient, token: string, err: unknown) {
  if (err instanceof ApiError && err.code === GUEST_RSVP_CLOSED_CODE) {
    queryClient.invalidateQueries({ queryKey: guestPageQueryKey(token) });
  }
}

export function useGuestRsvpSet(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, ...body }: GuestRsvpRequest & { eventId: string }) =>
      apiClient.put<GuestEvent>(`/public/guest/${token}/events/${eventId}/rsvp`, body),
    onSuccess: (event) => storeEvent(queryClient, token, event),
    onError: (err) => refetchIfClosed(queryClient, token, err),
  });
}

export function useGuestRsvpClear(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, teamPlayerId }: { eventId: string; teamPlayerId: string }) =>
      apiClient.delete<GuestEvent>(
        `/public/guest/${token}/events/${eventId}/rsvp?teamPlayerId=${encodeURIComponent(teamPlayerId)}`,
      ),
    onSuccess: (event) => storeEvent(queryClient, token, event),
    onError: (err) => refetchIfClosed(queryClient, token, err),
  });
}
