import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventScoresheet, EventScoresheetUploadUrlResponse } from '@basketeasy/types/events';
import { apiClient } from '../api/client';
import { eventScoresheetStatusQueryKey } from './queryKeys';

/**
 * Orchestrates the three-step direct-to-R2 upload: request a presigned URL
 * from our own API, PUT the photo bytes straight to R2 (raw `fetch`, not
 * `apiClient` — this goes to R2, not our API, so it needs neither the auth
 * header nor `credentials: 'include'`), then confirm the upload with our
 * API. `mutation.isPending` covers both the PUT and the confirm step — the
 * UI (MatchScoresheetTab) only needs one "sending" state, not a
 * frame per sub-step. On success, the confirmed EventScoresheet is written
 * straight into the status query's cache so the tab flips to the queued
 * state without a second round trip.
 */
export function useEventScoresheetUpload(clubId: string, teamId: string, eventId: string) {
  const queryClient = useQueryClient();
  const basePath = `/clubs/${clubId}/teams/${teamId}/events/${eventId}/scoresheet`;

  return useMutation({
    mutationFn: async (file: File): Promise<EventScoresheet> => {
      const { uploadUrl, r2Key } = await apiClient.post<EventScoresheetUploadUrlResponse>(
        `${basePath}/upload-url`,
        { contentType: file.type },
      );

      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!putResponse.ok) {
        throw new Error('La connexion a été interrompue. Vérifiez votre réseau et réessayez.');
      }

      return apiClient.patch<EventScoresheet>(basePath, { r2Key });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(eventScoresheetStatusQueryKey(clubId, teamId, eventId), data);
    },
  });
}
