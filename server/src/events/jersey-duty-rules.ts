import type { JerseyDutyStatus } from '@basketeasy/types/jersey-duty';

/**
 * The jersey wash rotation's rules as pure functions, so every definition
 * (what counts as a turn, who is in the pool, the suggestion order) lives in
 * one place and is unit-testable without Prisma. Design: docs/decisions/events.md.
 */

/** A roster member as the rotation sees them for one match. */
export interface RotationMember {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
  convoked: boolean;
  going: boolean;
  exempt: boolean;
  declined: boolean;
  turns: number;
  lastTurnAt: Date | null;
}

export interface OrderedCandidate {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
  turns: number;
  lastTurnAt: Date | null;
}

/**
 * A counted turn: someone held the duty at kickoff (a row with a holder that
 * isn't voided) on a MATCH of the team that has started, inside the season.
 * Pre-kickoff rows don't count yet, accepted or not (decision 9).
 */
export function isCountedTurn(
  duty: { teamPlayerId: string | null; voidedAt: Date | null },
  event: { startsAt: Date },
  now: Date,
  season: { start: Date; end: Date },
): boolean {
  return (
    duty.teamPlayerId !== null &&
    duty.voidedAt === null &&
    event.startsAt.getTime() <= now.getTime() &&
    event.startsAt.getTime() >= season.start.getTime() &&
    event.startsAt.getTime() <= season.end.getTime()
  );
}

/** Convoked and GOING: the people at the match, exemptions and declines included. */
export function isConvokedGoing(member: Pick<RotationMember, 'convoked' | 'going'>): boolean {
  return member.convoked && member.going;
}

/** Decision 6: convoked, GOING, not exempted, and hasn't declined this match. */
export function isInPool(member: RotationMember): boolean {
  return isConvokedGoing(member) && !member.exempt && !member.declined;
}

/**
 * Decision 5: fewest turns this season, then longest since the last turn
 * (never washed first), then last name, first name, and the id as the final
 * tie-break so the order is total and a re-read never reshuffles.
 */
export function compareCandidates(a: OrderedCandidate, b: OrderedCandidate): number {
  if (a.turns !== b.turns) return a.turns - b.turns;
  if (a.lastTurnAt?.getTime() !== b.lastTurnAt?.getTime()) {
    if (a.lastTurnAt === null) return -1;
    if (b.lastTurnAt === null) return 1;
    return a.lastTurnAt.getTime() - b.lastTurnAt.getTime();
  }
  return (
    a.lastName.localeCompare(b.lastName, 'fr') ||
    a.firstName.localeCompare(b.firstName, 'fr') ||
    a.teamPlayerId.localeCompare(b.teamPlayerId)
  );
}

export function orderCandidates<T extends OrderedCandidate>(candidates: T[]): T[] {
  return [...candidates].sort(compareCandidates);
}

/**
 * « …, le moins de l'équipe »: strictly fewer turns than every other pool
 * member. A pool of one has nobody to be the fewest of, so it is false.
 */
export function isFewestTurns(ordered: OrderedCandidate[]): boolean {
  if (ordered.length < 2) return false;
  return ordered.slice(1).every((other) => other.turns > ordered[0].turns);
}

export function jerseyDutyStatus(
  duty: {
    teamPlayerId: string | null;
    acceptedAt: Date | null;
    doneAt: Date | null;
    voidedAt: Date | null;
  } | null,
): JerseyDutyStatus {
  if (!duty || duty.teamPlayerId === null) return 'UNASSIGNED';
  if (duty.voidedAt) return 'VOIDED';
  if (duty.doneAt) return 'DONE';
  if (duty.acceptedAt) return 'ACCEPTED';
  return 'ASSIGNED';
}

/**
 * Only the team's next MATCH gets a suggestion; a later match with no holder
 * waits for it, otherwise two upcoming matches would propose the same person.
 */
export type SuggestionPlan =
  { kind: 'NEXT_MATCH' } | { kind: 'AFTER_PREVIOUS'; previousMatchStartsAt: Date };

export function planSuggestion(
  event: { id: string },
  nextMatch: { id: string; startsAt: Date } | null,
): SuggestionPlan {
  if (!nextMatch || nextMatch.id === event.id) return { kind: 'NEXT_MATCH' };
  return { kind: 'AFTER_PREVIOUS', previousMatchStartsAt: nextMatch.startsAt };
}
