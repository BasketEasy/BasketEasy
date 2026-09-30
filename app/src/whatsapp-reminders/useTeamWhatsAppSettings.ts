import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TeamWhatsAppSettings,
  UpdateTeamWhatsAppSettingsRequest,
} from '@basketeasy/types/whatsapp-reminder';
import { apiClient } from '../api/client';

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
      apiClient.patch<TeamWhatsAppSettings>(path(clubId, teamId), body),
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsQueryKey(clubId, teamId), settings);
      // Every event's rendered message depends on the template.
      return queryClient.invalidateQueries({
        queryKey: ['clubs', clubId, 'teams', teamId, 'events'],
        predicate: (q) => q.queryKey[q.queryKey.length - 1] === 'whatsapp-share',
      });
    },
  });
}
