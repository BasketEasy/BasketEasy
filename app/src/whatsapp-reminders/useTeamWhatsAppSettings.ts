import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TeamWhatsAppSettings,
  UpdateTeamWhatsAppSettingsRequest,
  UpdateTeamWhatsAppSettingsResponse,
} from '@basketeasy/types/whatsapp-reminder';
import { apiClient } from '../api/client';
import { teamEventsQueryKeyPrefix } from '../clubs/queryKeys';

const settingsQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'whatsapp-settings'] as const;

const path = (clubId: string, teamId: string) =>
  `/clubs/${clubId}/teams/${teamId}/whatsapp-settings`;

export function useTeamWhatsAppSettings(clubId: string, teamId: string) {
  return useQuery({
    queryKey: settingsQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<TeamWhatsAppSettings>(path(clubId, teamId)),
  });
}

export function useUpdateTeamWhatsAppSettings(clubId: string, teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTeamWhatsAppSettingsRequest) =>
      apiClient.patch<UpdateTeamWhatsAppSettingsResponse>(path(clubId, teamId), body),
    onSuccess: ({ guestLinkEnabled, ...settings }) => {
      queryClient.setQueryData<TeamWhatsAppSettings>(settingsQueryKey(clubId, teamId), settings);
      // A save can switch the guest link on, reschedule every upcoming event's
      // reminder, and change the message every event renders from the template.
      if (guestLinkEnabled) {
        void queryClient.invalidateQueries({
          queryKey: ['clubs', clubId, 'teams', teamId, 'guest-link'],
        });
      }
      return queryClient.invalidateQueries({ queryKey: teamEventsQueryKeyPrefix(clubId, teamId) });
    },
  });
}
