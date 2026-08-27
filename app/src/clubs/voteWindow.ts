/**
 * Best/worst voting has no hard server-side deadline beyond "not before the
 * match" (see EventsService.castVote) — this window is a purely
 * client-computed label for the ballot's "Ouvert jusqu'au…" subtitle and the
 * agenda card's "Votes ouverts · N j restants" badge, not something the
 * server enforces. A late vote still counts.
 */
export const VOTE_WINDOW_DAYS = 7;

function voteWindowEndDate(startsAtIso: string): Date {
  const end = new Date(startsAtIso);
  end.setDate(end.getDate() + VOTE_WINDOW_DAYS);
  return end;
}

const voteWindowEndFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** "Ouvert jusqu'au 2 sept. 23h59" — the window always ends at end of day. */
export function formatVoteWindowEnd(startsAtIso: string): string {
  return `${voteWindowEndFormatter.format(voteWindowEndDate(startsAtIso))} 23h59`;
}

/**
 * Days remaining in the "Votes ouverts" agenda badge's illustrative window —
 * null before the badge should show at all: the match hasn't started yet, or
 * the window has already closed (voting itself stays open past this, see
 * above; the badge is just a nudge, not a deadline indicator).
 */
export function voteWindowDaysRemaining(startsAtIso: string): number | null {
  const start = new Date(startsAtIso);
  const now = new Date();
  if (start > now) {
    return null;
  }
  const msRemaining = voteWindowEndDate(startsAtIso).getTime() - now.getTime();
  if (msRemaining <= 0) {
    return null;
  }
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}
