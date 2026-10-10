import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TeamGuestLinkInfo } from '@basketeasy/types/guest-links';
import { apiClient } from '../api/client';
import { guestLinkQueryKey } from '../clubs/queryKeys';

const path = (clubId: string, teamId: string) => `/clubs/${clubId}/teams/${teamId}/guest-link`;

export function useTeamGuestLink(clubId: string, teamId: string) {
  return useQuery({
    queryKey: guestLinkQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<TeamGuestLinkInfo>(path(clubId, teamId)),
  });
}

// Enable and regenerate answer with the live URL; disable with nothing, which
// is the link being off. Each writes the answer into the cache, so the card
// never shows a stale URL while a refetch is in flight.
function useGuestLinkMutation(
  clubId: string,
  teamId: string,
  run: () => Promise<TeamGuestLinkInfo | void>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (info) =>
      queryClient.setQueryData<TeamGuestLinkInfo>(guestLinkQueryKey(clubId, teamId), info ?? null),
  });
}

export function useTeamGuestLinkEnable(clubId: string, teamId: string) {
  return useGuestLinkMutation(clubId, teamId, () =>
    apiClient.post<{ url: string }>(path(clubId, teamId)),
  );
}

export function useTeamGuestLinkRegenerate(clubId: string, teamId: string) {
  return useGuestLinkMutation(clubId, teamId, () =>
    apiClient.post<{ url: string }>(`${path(clubId, teamId)}/regenerate`),
  );
}

export function useTeamGuestLinkDisable(clubId: string, teamId: string) {
  return useGuestLinkMutation(clubId, teamId, () => apiClient.delete<void>(path(clubId, teamId)));
}
