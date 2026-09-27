import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  ClubMeetingSettings,
  UpdateClubMeetingSettingsRequest,
} from '@basketeasy/types/meeting-points';
import { apiClient } from '../api/client';
import { clubMeetingSettingsQueryKey } from '../clubs/queryKeys';

export function useClubMeetingSettingsUpdate(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpdateClubMeetingSettingsRequest) =>
      apiClient.patch<ClubMeetingSettings>(`/clubs/${clubId}/meeting-settings`, dto),
    onSuccess: (settings) => {
      queryClient.setQueryData(clubMeetingSettingsQueryKey(clubId), settings);
      // Every team under the club inherits this default: their events' meeting
      // plans and their own settings' `clubDefaults` are both stale now.
      queryClient.invalidateQueries({ queryKey: ['clubs', clubId, 'teams'] });
    },
  });
}
