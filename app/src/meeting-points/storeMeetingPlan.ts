import type { QueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import { teamEventQueryKey, teamEventsQueryKeyPrefix } from '../clubs/queryKeys';

/**
 * The meeting routes answer with the plan alone (they live in the
 * meeting-points module, which doesn't assemble a TeamEvent). Patch it into
 * the cached event so the page updates at once, then mark the team's event
 * queries stale for anything else the write moved.
 */
export function storeMeetingPlan(
  queryClient: QueryClient,
  ids: { clubId: string; teamId: string; eventId: string },
  plan: EventMeetingPlan,
): void {
  queryClient.setQueryData<TeamEvent>(
    teamEventQueryKey(ids.clubId, ids.teamId, ids.eventId),
    (event) => event && { ...event, meetingPlan: plan },
  );
  queryClient.invalidateQueries({ queryKey: teamEventsQueryKeyPrefix(ids.clubId, ids.teamId) });
}
