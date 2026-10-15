import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FfbbImportResult } from '@basketeasy/types/ffbb';
import { apiClient } from '../api/client';
import { invalidateTeamEvents } from './eventCache';
import { teamPouleResultsQueryKey } from './queryKeys';

export function useFfbbImport(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient.post<FfbbImportResult>(`/clubs/${clubId}/teams/${teamId}/ffbb-import`),
    onSuccess: () => {
      // The import's effect is invalidated data in the Événements tab, not
      // local UI state here — the toast() the caller shows is what closes
      // the loop for the user (see CLAUDE.md's toast()-for-completed-mutation
      // rule).
      invalidateTeamEvents(queryClient, { clubId, teamId });
      // The import is the manager's « refresh from FFBB » gesture, and the
      // standings beside the schedule come from the same source.
      void queryClient.invalidateQueries({ queryKey: teamPouleResultsQueryKey(clubId, teamId) });
    },
  });
}
