// Best/worst player voting window, both ends measured from Event.startsAt
// and enforced server-side in EventsService.castVote: opens an hour after
// kickoff (nobody has anything meaningful to vote on the moment the whistle
// blows) and closes five days later. Shared with DashboardService so the
// home's « Voter » and the endpoint that accepts the vote can't drift.
export const VOTE_OPEN_DELAY_MS = 60 * 60 * 1000;
export const VOTE_CLOSE_DELAY_MS = 5 * 24 * 60 * 60 * 1000;

export function voteOpensAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + VOTE_OPEN_DELAY_MS);
}

export function voteClosesAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + VOTE_CLOSE_DELAY_MS);
}
