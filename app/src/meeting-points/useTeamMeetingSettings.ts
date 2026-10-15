import { useQuery } from '@tanstack/react-query';
import type { TeamMeetingSettings } from '@basketeasy/types/meeting-points';
import { apiClient } from '../api/client';
import { FRESHNESS } from '../api/freshness';
import { teamMeetingSettingsQueryKey } from '../clubs/queryKeys';

export function useTeamMeetingSettings(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamMeetingSettingsQueryKey(clubId, teamId),
    staleTime: FRESHNESS.static,
    queryFn: ({ signal }) =>
      apiClient.get<TeamMeetingSettings>(
        `/clubs/${clubId}/teams/${teamId}/meeting-settings`,
        undefined,
        { signal },
      ),
  });
}
