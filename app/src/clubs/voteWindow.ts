/**
 * Best/worst voting's hard window, mirroring EventsService.castVote exactly
 * (both ends enforced server-side, not just displayed here): opens
 * VOTE_OPEN_DELAY_HOURS after kickoff — nobody has anything meaningful to
 * vote on the moment the whistle blows — and closes VOTE_CLOSE_DELAY_DAYS
 * after kickoff.
 */
const VOTE_OPEN_DELAY_HOURS = 1;
const VOTE_CLOSE_DELAY_DAYS = 5;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function voteWindowOpensAt(startsAtIso: string): Date {
  return new Date(new Date(startsAtIso).getTime() + VOTE_OPEN_DELAY_HOURS * HOUR_MS);
}

function voteWindowClosesAt(startsAtIso: string): Date {
  return new Date(new Date(startsAtIso).getTime() + VOTE_CLOSE_DELAY_DAYS * DAY_MS);
}

/** Whether the vote window is currently open for this event's startsAt. */
export function isVoteWindowOpen(startsAtIso: string): boolean {
  const now = new Date();
  return now >= voteWindowOpensAt(startsAtIso) && now <= voteWindowClosesAt(startsAtIso);
}

/**
 * Whether the vote window has ended — the point at which results become
 * public to everyone (not just voters) and the Vote tab becomes visible to
 * the whole team, per EventsService.getEventVoteResults/EventDetailPage.
 */
export function hasVoteWindowClosed(startsAtIso: string): boolean {
  return new Date() > voteWindowClosesAt(startsAtIso);
}

const voteWindowEndFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** "Ouvert jusqu'au 2 sept. 23h59" — the window always ends at end of day. */
export function formatVoteWindowEnd(startsAtIso: string): string {
  return `${voteWindowEndFormatter.format(voteWindowClosesAt(startsAtIso))} 23h59`;
}

/**
 * Days remaining in the "Votes ouverts" agenda badge's window — null
 * whenever the badge shouldn't show: the window hasn't opened yet (the
 * match hasn't started, or it's within the first hour) or it has already
 * closed.
 */
export function voteWindowDaysRemaining(startsAtIso: string): number | null {
  if (!isVoteWindowOpen(startsAtIso)) {
    return null;
  }
  const msRemaining = voteWindowClosesAt(startsAtIso).getTime() - Date.now();
  return Math.ceil(msRemaining / DAY_MS);
}
