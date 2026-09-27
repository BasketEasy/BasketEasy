import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  TeamMeetingSettings,
  UpdateTeamMeetingSettingsRequest,
} from '@basketeasy/types/meeting-points';
import { apiClient } from '../api/client';
import { teamEventsQueryKeyPrefix, teamMeetingSettingsQueryKey } from '../clubs/queryKeys';

export function useTeamMeetingSettingsUpdate(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpdateTeamMeetingSettingsRequest) =>
      apiClient.patch<TeamMeetingSettings>(
        `/clubs/${clubId}/teams/${teamId}/meeting-settings`,
        dto,
      ),
    onSuccess: (settings) => {
      queryClient.setQueryData(teamMeetingSettingsQueryKey(clubId, teamId), settings);
      // Both the event lists and each single event under this team carry a
      // plan resolved from these settings.
      queryClient.invalidateQueries({ queryKey: teamEventsQueryKeyPrefix(clubId, teamId) });
    },
  });
}
