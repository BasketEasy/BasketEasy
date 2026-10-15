import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import { apiClient } from '../api/client';
import { storeMeetingPlan } from './storeMeetingPlan';

/** « Recalculer » — the server recomputes the driving time synchronously. */
export function useEventMeetingRefresh(clubId: string, teamId: string, eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<EventMeetingPlan>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/meeting/refresh`,
        {},
      ),
    onSuccess: (plan) => storeMeetingPlan(queryClient, { clubId, teamId, eventId }, plan),
  });
}
