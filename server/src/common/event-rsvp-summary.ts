import type { EventRsvpStatus } from '@basketeasy/types/events';
import type { EventRsvpSummary } from '@basketeasy/types/events';

/**
 * Server-side twin of `countEventRoster` in `app/src/clubs/useEventRoster.ts`
 * — that hook computes the exact same aggregate client-side from a fully
 * merged per-member roster, which is the right shape for the single-event
 * page (names, avatars, "who specifically"). Here there is no per-member
 * roster in hand — only a roster *size* and the sets of rsvp/convocation
 * rows for a whole batch of events — so this is a from-scratch port, not a
 * shared import (this package cannot import from `app/`). Keep the two in
 * sync: same field names, same rule that convocation (once anyone is called
 * up) narrows what the response counts describe.
 *
 * The one shortcut this version takes over the client's: it never needs the
 * *identity* of every non-responding, non-convoked roster member, because
 * every rsvp/convocation row is already known to belong to a rostered
 * member (RSVP is self-service, restricted to the caller's own TeamPlayer;
 * convocation is validated against the roster on write) — so "pending" is
 * always `answering - going - maybe - notGoing` rather than needing a scan
 * over full roster identity per event.
 */
export interface EventRsvpRow {
  eventId: string;
  teamPlayerId: string;
  status: EventRsvpStatus;
}

export interface EventConvocationRow {
  eventId: string;
  teamPlayerId: string;
}

function groupByEventId<T extends { eventId: string }>(rows: T[]): Map<string, T[]> {
  const byEvent = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = byEvent.get(row.eventId);
    if (bucket) {
      bucket.push(row);
    } else {
      byEvent.set(row.eventId, [row]);
    }
  }
  return byEvent;
}

/**
 * Computes one `EventRsvpSummary` per event id from a batch of rsvp and
 * convocation rows spanning any number of events — three inputs, all
 * already fetched in bounded queries by the caller (EventsService,
 * DashboardService), never re-queried here.
 */
export function computeEventRsvpSummaries(
  eventIds: string[],
  rosterSizeByEventId: Map<string, number>,
  rsvpRows: EventRsvpRow[],
  convocationRows: EventConvocationRow[],
): Map<string, EventRsvpSummary> {
  const rsvpsByEvent = groupByEventId(rsvpRows);
  const convocationsByEvent = groupByEventId(convocationRows);

  const summaries = new Map<string, EventRsvpSummary>();
  for (const eventId of eventIds) {
    const rosterSize = rosterSizeByEventId.get(eventId) ?? 0;
    const eventRsvps = rsvpsByEvent.get(eventId) ?? [];
    const eventConvocations = convocationsByEvent.get(eventId) ?? [];

    const convokedIds = new Set(eventConvocations.map((c) => c.teamPlayerId));
    const isConvocationScoped = convokedIds.size > 0;
    const statusByPlayer = new Map(eventRsvps.map((r) => [r.teamPlayerId, r.status]));
    const answering = isConvocationScoped ? convokedIds.size : rosterSize;

    const countStatus = (status: EventRsvpStatus): number =>
      isConvocationScoped
        ? Array.from(convokedIds).filter((id) => statusByPlayer.get(id) === status).length
        : eventRsvps.filter((r) => r.status === status).length;

    const going = countStatus('GOING');
    const maybe = countStatus('MAYBE');
    const notGoing = countStatus('NOT_GOING');

    summaries.set(eventId, {
      rosterSize,
      convoked: convokedIds.size,
      answering,
      going,
      maybe,
      notGoing,
      pending: answering - going - maybe - notGoing,
      isConvocationScoped,
    });
  }
  return summaries;
}
