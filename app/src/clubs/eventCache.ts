import type { QueryClient } from '@tanstack/react-query';
import type { TeamEvent } from '@basketeasy/types/events';
import { personasQueryKey } from '../guardians/queryKeys';
import {
  type EventPart,
  eventDetailPersona,
  eventSubKey,
  isEventDetailQuery,
  isTeamFamilyQuery,
  jerseyRotationQueryKeyPrefix,
  myDashboardQueryKeyPrefix,
  myTeamsQueryKey,
  teamEventQueryKey,
  teamEventsQueryKey,
  teamEventsQueryKeyPrefix,
  teamStatsQueryKeyPrefix,
} from './queryKeys';

export interface EventIds {
  clubId: string;
  teamId: string;
  eventId: string;
}

/**
 * Writes an event the server just assembled into the cached detail it was
 * assembled for (`forPlayerId` is the persona it answered as; undefined for
 * the user themself), so the page updates without a second request.
 *
 * Only an entry that already exists is touched: an RSVP given from the agenda
 * has no detail cached, and a half-built entry that looked fresh would be
 * served as is. The WhatsApp fields are kept from the entry being replaced
 * when the response has none, because the own-answer routes (RSVP, clear,
 * travel mode) assemble the event without the manager-only fields, and a
 * manager who is also on the roster would lose their reminder state.
 */
export function storeTeamEvent(
  queryClient: QueryClient,
  ids: Pick<EventIds, 'clubId' | 'teamId'>,
  forPlayerId: string | undefined,
  event: TeamEvent,
): void {
  queryClient.setQueryData<TeamEvent>(
    teamEventQueryKey(ids.clubId, ids.teamId, event.id, forPlayerId),
    (previous) =>
      previous && {
        ...event,
        whatsAppShare: event.whatsAppShare ?? previous.whatsAppShare,
        whatsAppSettings: event.whatsAppSettings ?? previous.whatsAppSettings,
      },
  );
}

/** Marks the named sub-queries of one event stale, whichever persona read them. */
export function invalidateEventParts(
  queryClient: QueryClient,
  ids: EventIds,
  parts: readonly EventPart[],
): void {
  for (const part of parts) {
    void queryClient.invalidateQueries({
      queryKey: eventSubKey(ids.clubId, ids.teamId, ids.eventId, part),
    });
  }
}

/**
 * One family's copies read as other personas than `keep` (undefined is the
 * user themself). A persona's copy marks a different row `isMe` or holds its
 * own answer, so it is stale after a write that only filled `keep`'s entry,
 * which is left alone.
 */
export function invalidateOtherPersonas(
  queryClient: QueryClient,
  ids: EventIds,
  part: EventPart,
  keep: string | undefined,
): void {
  const family = eventSubKey(ids.clubId, ids.teamId, ids.eventId, part);
  void queryClient.invalidateQueries({
    queryKey: family,
    predicate: ({ queryKey }) =>
      (queryKey[family.length] as { pour?: string } | undefined)?.pour !== keep,
  });
}

/** Every event list of the team (any filter, any persona), and no single event. */
export function invalidateEventLists(
  queryClient: QueryClient,
  ids: Pick<EventIds, 'clubId' | 'teamId'>,
): void {
  void queryClient.invalidateQueries({ queryKey: teamEventsQueryKey(ids.clubId, ids.teamId) });
}

/**
 * The event's own detail, but not the persona's copy that was just written
 * (`except`): another persona's cached copy carries the same roster summary
 * and goes stale, while refetching the entry a write has just filled would be
 * a request for what the response already said. With no `except`, every
 * persona's copy is marked.
 */
export function invalidateEventDetails(
  queryClient: QueryClient,
  ids: EventIds,
  except?: { forPlayerId: string | undefined },
): void {
  const isDetail = isEventDetailQuery(ids.clubId, ids.teamId, ids.eventId);
  void queryClient.invalidateQueries({
    predicate: (query) =>
      isDetail(query) &&
      (except === undefined || eventDetailPersona(query.queryKey) !== except.forPlayerId),
  });
}

/** The home's agenda and action items mirror RSVPs, convocations, logistics, results and votes. */
export function invalidateDashboard(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: myDashboardQueryKeyPrefix });
}

/** Rotation overviews (counts, next match) of the team, whichever persona or season. */
export function invalidateJerseyRotation(
  queryClient: QueryClient,
  ids: Pick<EventIds, 'clubId' | 'teamId'>,
): void {
  void queryClient.invalidateQueries({
    queryKey: jerseyRotationQueryKeyPrefix(ids.clubId, ids.teamId),
  });
}

/**
 * What an RSVP write moves, for `useEventRsvpSet` and `useEventRsvpClear`
 * (the server answers both with the persona's whole `TeamEvent`).
 *
 * The response goes into the persona's detail. Elsewhere: the lists and the
 * dashboard carry the persona's answer and the roster summary, the RSVP
 * roster has a row that moved, and the jersey wash reads the same answers
 * (`jersey-duty.service` builds its pool from RSVPs and convocations), so the
 * event's duty and the rotation overview follow. Convocations, votes, the
 * scoresheet and the WhatsApp share do not read an RSVP and are left alone.
 */
export function applyRsvpWrite(
  queryClient: QueryClient,
  ids: Pick<EventIds, 'clubId' | 'teamId'>,
  forPlayerId: string | undefined,
  event: TeamEvent,
): void {
  const eventIds = { ...ids, eventId: event.id };
  storeTeamEvent(queryClient, ids, forPlayerId, event);
  invalidateEventDetails(queryClient, eventIds, { forPlayerId });
  invalidateEventLists(queryClient, ids);
  invalidateEventParts(queryClient, eventIds, ['rsvps', 'jersey-duty']);
  invalidateJerseyRotation(queryClient, ids);
  invalidateDashboard(queryClient);
}

/**
 * The series-wide manager writes (create, edit, time change, delete, FFBB
 * import) keep the broad prefix: every event query of the team, lists, details
 * and all their sub-queries, because a kick-off, a venue or a deletion reaches
 * the RSVP roster, the duty and the share message too. Next to it, what lives
 * outside that prefix: the rotation (next match, counts) and the dashboard.
 * `stats` is for the writes that can move or remove a played match, whose lines
 * the team's season table is folded from. `listsOnly` narrows the prefix to the
 * lists, for a delete of one event whose own entries are dropped instead.
 */
export function invalidateTeamEvents(
  queryClient: QueryClient,
  ids: Pick<EventIds, 'clubId' | 'teamId'>,
  options: { stats?: boolean; listsOnly?: boolean } = {},
): void {
  if (options.listsOnly) {
    invalidateEventLists(queryClient, ids);
  } else {
    void queryClient.invalidateQueries({
      queryKey: teamEventsQueryKeyPrefix(ids.clubId, ids.teamId),
    });
  }
  invalidateJerseyRotation(queryClient, ids);
  invalidateDashboard(queryClient);
  if (options.stats) {
    void queryClient.invalidateQueries({
      queryKey: teamStatsQueryKeyPrefix(ids.clubId, ids.teamId),
    });
  }
}

/**
 * Drops what a deleted event owned (its RSVPs, convocations, votes, duty,
 * scoresheet and share), so nothing refetches a route that now answers 404.
 * The detail entry itself stays for the caller's broad invalidation to
 * refetch: the page showing it has to find out the event is gone.
 */
export function removeEventSubQueries(queryClient: QueryClient, ids: EventIds): void {
  queryClient.removeQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === 'clubs' &&
      queryKey[1] === ids.clubId &&
      queryKey[2] === 'teams' &&
      queryKey[3] === ids.teamId &&
      queryKey[4] === 'events' &&
      queryKey[5] === ids.eventId &&
      typeof queryKey[6] === 'string',
  });
}

/**
 * Everything of a team that names its players or counts them: the rosters,
 * every event (the roster summary, the RSVP and convocation rosters, the
 * wash duty, who carries the jerseys), the season table, the rotation, the
 * teams a person is on, the personas and the home. A roster change or a
 * player edit is rare and manager-only, so this is deliberately the broad
 * prefix; leaving `teamId` out covers every team (a player edit does not know
 * which teams the player is on).
 */
export function invalidateRosterDependents(
  queryClient: QueryClient,
  scope: { teamId?: string } = {},
): void {
  void queryClient.invalidateQueries({
    predicate: isTeamFamilyQuery(['players', 'events', 'stats', 'jersey-rotation'], scope),
  });
  void queryClient.invalidateQueries({ queryKey: myTeamsQueryKey });
  void queryClient.invalidateQueries({ queryKey: personasQueryKey });
  invalidateDashboard(queryClient);
}
