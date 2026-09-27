import type {
  EventConvocationRosterEntry,
  EventRsvpRosterEntry,
  EventRsvpStatus,
} from '@basketeasy/types/events';
import type { EventTravelMode } from '@basketeasy/types/meeting-points';
import { useEventConvocations } from './useEventConvocations';
import { useEventRsvps } from './useEventRsvps';

export interface EventRosterRow {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
  role: EventRsvpRosterEntry['role'];
  isMe: boolean;
  rsvpStatus: EventRsvpStatus | null;
  /** Null unless GOING to a match — see EventRsvpRosterEntry.travelMode. */
  travelMode: EventTravelMode | null;
  convoked: boolean;
}

export interface EventRosterCounts {
  /** Everyone on the team's roster. */
  rosterSize: number;
  convoked: number;
  /** The people the response counts below are about — see `isConvocationScoped`. */
  answering: number;
  going: number;
  maybe: number;
  notGoing: number;
  pending: number;
  /**
   * True once anyone has been called up: the response counts then describe
   * the convoked group only ("9 oui … sur 12 convoqués"). Before a call-up
   * exists there is no group yet, so they describe the whole roster instead
   * — reporting "0 convoqués" and four zeroes would be the same page saying
   * nothing twice.
   */
  isConvocationScoped: boolean;
}

/**
 * Both roster-breakdown endpoints are keyed off the same team roster
 * server-side, so a plain lookup from the RSVP list into a convocation Map
 * is enough — no need to union the two id sets.
 */
function mergeRoster(
  rsvps: EventRsvpRosterEntry[],
  convocations: EventConvocationRosterEntry[],
): EventRosterRow[] {
  const convocationByPlayer = new Map(convocations.map((c) => [c.teamPlayerId, c]));
  return rsvps.map((rsvp) => ({
    teamPlayerId: rsvp.teamPlayerId,
    firstName: rsvp.firstName,
    lastName: rsvp.lastName,
    role: rsvp.role,
    isMe: rsvp.isMe,
    rsvpStatus: rsvp.status,
    travelMode: rsvp.travelMode,
    convoked: convocationByPlayer.get(rsvp.teamPlayerId)?.convoked ?? false,
  }));
}

export function countEventRoster(rows: EventRosterRow[]): EventRosterCounts {
  const convoked = rows.filter((row) => row.convoked);
  const isConvocationScoped = convoked.length > 0;
  const answering = isConvocationScoped ? convoked : rows;
  const count = (status: EventRsvpStatus) =>
    answering.filter((row) => row.rsvpStatus === status).length;
  return {
    rosterSize: rows.length,
    convoked: convoked.length,
    answering: answering.length,
    going: count('GOING'),
    maybe: count('MAYBE'),
    notGoing: count('NOT_GOING'),
    pending: answering.filter((row) => row.rsvpStatus === null).length,
    isConvocationScoped,
  };
}

/**
 * One event's roster with both per-member answers on it: who was called up,
 * and who has replied what.
 *
 * The two halves are the existing per-event breakdown endpoints, merged
 * client-side by `teamPlayerId` — no backend aggregate, matching the Events
 * module's established convention (see `CLAUDE.md`). Three surfaces on the
 * event page need exactly this shape (the player's « Qui vient ? », the
 * manager's pilot band, the manager's match roster), and TanStack dedupes
 * them onto the same two query keys, so calling this hook per block costs
 * nothing extra and keeps each block owning its own
 * `error → loading → empty → data` ladder.
 */
export function useEventRoster(clubId: string, teamId: string, eventId: string) {
  const {
    data: rsvps,
    isLoading: isLoadingRsvps,
    isError: isRsvpsError,
    refetch: refetchRsvps,
  } = useEventRsvps(clubId, teamId, eventId, true);
  const {
    data: convocations,
    isLoading: isLoadingConvocations,
    isError: isConvocationsError,
    refetch: refetchConvocations,
  } = useEventConvocations(clubId, teamId, eventId, true);

  const rows = rsvps && convocations ? mergeRoster(rsvps, convocations) : null;

  return {
    rows,
    counts: rows ? countEventRoster(rows) : null,
    isError: isRsvpsError || isConvocationsError,
    isLoading: isLoadingRsvps || isLoadingConvocations,
    retry: () => {
      if (isRsvpsError) refetchRsvps();
      if (isConvocationsError) refetchConvocations();
    },
  };
}
