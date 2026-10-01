import type { EventConvocationRosterEntry, EventRsvpRosterEntry } from '@basketeasy/types/events';
import type { JerseyDutyDetail, JerseyRotationOverview } from '@basketeasy/types/jersey-duty';
import { dutyPersonName, exemptSuffix } from './jerseyDutyCopy';

// Radix Select forbids an empty-string item, and « clear the duty » needs an
// option of its own: this sentinel stands in for null.
export const NOBODY = '__nobody__';

/**
 * The picker's options: the whole roster, because a manager may assign
 * anyone, the pool first and in suggestion order (the rotation overview's
 * order), then everyone else by name. An exempted player is still offered,
 * and says so.
 */
export function buildAssignOptions({
  roster,
  rsvps,
  overview,
  teamGender,
  hasHolder,
}: {
  roster: EventConvocationRosterEntry[];
  rsvps: EventRsvpRosterEntry[] | undefined;
  overview: JerseyRotationOverview | undefined;
  teamGender: JerseyDutyDetail['teamGender'];
  hasHolder: boolean;
}): { value: string; label: string }[] {
  const rank = new Map(overview?.rows.map((row, index) => [row.teamPlayerId, index]));
  const exempt = new Set(overview?.rows.filter((row) => row.exempt).map((row) => row.teamPlayerId));
  const going = new Set(
    rsvps?.filter((row) => row.status === 'GOING').map((row) => row.teamPlayerId),
  );
  const inPool = (entry: EventConvocationRosterEntry) =>
    entry.convoked && going.has(entry.teamPlayerId) && !exempt.has(entry.teamPlayerId);

  const byName = (a: EventConvocationRosterEntry, b: EventConvocationRosterEntry) =>
    a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr');
  const pool = roster
    .filter(inPool)
    .sort(
      (a, b) =>
        (rank.get(a.teamPlayerId) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.teamPlayerId) ?? Number.MAX_SAFE_INTEGER) || byName(a, b),
    );
  const rest = roster.filter((entry) => !inPool(entry)).sort(byName);

  const options = [...pool, ...rest].map((entry) => ({
    value: entry.teamPlayerId,
    label: `${dutyPersonName(entry)}${exempt.has(entry.teamPlayerId) ? ` ${exemptSuffix(teamGender)}` : ''}`,
  }));
  return hasHolder ? [{ value: NOBODY, label: 'Personne' }, ...options] : options;
}
