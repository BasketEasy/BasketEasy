import { useQuery } from '@tanstack/react-query';
import type { ClubMeetingSettings } from '@basketeasy/types/meeting-points';
import { apiClient } from '../api/client';
import { clubMeetingSettingsQueryKey } from '../clubs/queryKeys';

export function useClubMeetingSettings(clubId: string) {
  return useQuery({
    queryKey: clubMeetingSettingsQueryKey(clubId),
    queryFn: () => apiClient.get<ClubMeetingSettings>(`/clubs/${clubId}/meeting-settings`),
  });
}
