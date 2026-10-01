import { useQuery } from '@tanstack/react-query';
import type { JerseyDutyDetail, JerseyRotationOverview } from '@basketeasy/types/jersey-duty';
import { apiClient } from '../api/client';
import { jerseyDutyQueryKey, jerseyRotationQueryKey } from '../clubs/queryKeys';
import { useTeamPersona } from '../guardians/useActingAs';

/**
 * One match's jersey wash duty as the acting persona reads it: who holds it,
 * the suggestion, and which of the buttons they get (`rights`). The persona is
 * the last segment of the key, so switching to a child never reuses the
 * parent's answer.
 */
export function useJerseyDuty(clubId: string, teamId: string, eventId: string) {
  const { forPlayerId, isReady } = useTeamPersona(teamId);
  const query = useQuery({
    queryKey: jerseyDutyQueryKey(clubId, teamId, eventId, forPlayerId),
    queryFn: () =>
      apiClient.get<JerseyDutyDetail>(
        `/clubs/${clubId}/teams/${teamId}/events/${eventId}/jersey-duty`,
        forPlayerId ? { forPlayerId } : undefined,
      ),
    enabled: isReady,
  });
  return { ...query, isLoading: query.isLoading || !isReady };
}

/**
 * The team's rotation overview. The match page reads it for one thing only,
 * the manager's picker: the suggestion order and who is exempted.
 */
export function useJerseyRotation(clubId: string, teamId: string, enabled = true) {
  const { forPlayerId, isReady } = useTeamPersona(teamId);
  const query = useQuery({
    queryKey: jerseyRotationQueryKey(clubId, teamId, forPlayerId),
    queryFn: () =>
      apiClient.get<JerseyRotationOverview>(
        `/clubs/${clubId}/teams/${teamId}/jersey-rotation`,
        forPlayerId ? { forPlayerId } : undefined,
      ),
    enabled: enabled && isReady,
  });
  return { ...query, isLoading: query.isLoading || !isReady };
}
