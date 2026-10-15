import type { QueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import {
  type EventIds,
  invalidateDashboard,
  invalidateEventLists,
  invalidateEventParts,
} from '../clubs/eventCache';
import { isEventDetailQuery } from '../clubs/queryKeys';

/**
 * The meeting routes answer with the plan alone (they live in the
 * meeting-points module, which doesn't assemble a TeamEvent). The plan is the
 * event's, not a persona's, so it is patched into every cached copy of the
 * detail at once. What mirrors it elsewhere is marked stale: the agenda lists
 * and the dashboard carry `meetingPlan`, and the WhatsApp share message names
 * the rendez-vous. Nothing else under the event reads it, so the RSVPs, the
 * convocations and the rest are left alone.
 */
export function storeMeetingPlan(
  queryClient: QueryClient,
  ids: EventIds,
  plan: EventMeetingPlan,
): void {
  queryClient.setQueriesData<TeamEvent>(
    { predicate: isEventDetailQuery(ids.clubId, ids.teamId, ids.eventId) },
    (event) => event && { ...event, meetingPlan: plan },
  );
  invalidateEventLists(queryClient, ids);
  invalidateEventParts(queryClient, ids, ['whatsapp-share']);
  invalidateDashboard(queryClient);
}
