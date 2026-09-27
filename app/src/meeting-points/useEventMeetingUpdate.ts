import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventMeetingPlan, UpdateEventMeetingRequest } from '@basketeasy/types/meeting-points';
import { apiClient } from '../api/client';
import { storeMeetingPlan } from './storeMeetingPlan';

export function useEventMeetingUpdate(clubId: string, teamId: string, eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpdateEventMeetingRequest) =>
      apiClient.patch<EventMeetingPlan>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/meeting`,
        dto,
      ),
    onSuccess: (plan) => storeMeetingPlan(queryClient, { clubId, teamId, eventId }, plan),
  });
}
