import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import type { EventVoteCandidateResult, TeamEvent } from '@basketeasy/types/events';
import { hasVoteWindowClosed } from './voteWindow';
import { useEventVoteResults } from './useEventVoteResults';
import { countTiedAtTop } from './voteTies';
import { WorstIcon } from './voteIcons';
import { Text } from '@basketeasy/ui/text';

/**
 * "🏆 Player A - 67%          100% - Player B 🛡️" — a space-between row of
 * the top BEST and top WORST-category player (with their share of votes
 * cast), embedded directly inside the event card (TeamEventsAgenda's
 * AgendaEventCard) and row (EventRow), once a past MATCH event's vote
 * window has closed. Results are already public to everyone at that point
 * (see EventsService.getEventVoteResults), so no eligibility check beyond
 * "the window is closed". Renders nothing before that, for a TRAINING
 * event, or if nobody voted — keeps the card/row unchanged for matches
 * with no votes cast.
 *
 * A tie for the top spot, on either side independently, swaps the name for
 * "Égalité (N)" rather than trying to cram 2+ names into this already-tight
 * slot (see the mobile-stacking comment below for how tight "one name" is)
 * — length-neutral against a real name, and degrades the same way for 3+.
 */
export function MatchWinnersRow({
  clubId,
  teamId,
  event,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
}) {
  const eligible = event.type === 'MATCH' && hasVoteWindowClosed(event.startsAt);
  const { data: results } = useEventVoteResults(clubId, teamId, event.id, eligible);

  if (!eligible || !results || results.best.length === 0) {
    return null;
  }

  const bestWinner = results.best[0];
  const worstWinner = results.worst[0];
  const bestTiedCount = countTiedAtTop(results.best);
  const worstTiedCount = countTiedAtTop(results.worst);
  // Same share-of-votes-cast convention as MatchVoteTab's leaderboard bars.
  const denominator = results.votesCast > 0 ? results.votesCast : 1;
  const bestPct = Math.round((bestWinner.voteCount / denominator) * 100);
  const worstPct = worstWinner ? Math.round((worstWinner.voteCount / denominator) * 100) : null;

  return (
    // Stacks to two lines below `sm` — a single row at phone width squeezed
    // both names down to bare initials (space-between + min-w-0/truncate on
    // both halves competing for the same line), unreadable. From `sm` up
    // there's room for the mockup's actual space-between single row.
    <div className="flex flex-col gap-1.5 border-t border-border pt-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="flex min-w-0 items-center gap-1.5">
        <TrophyIcon tone="accent" className="h-4 w-4 shrink-0" />
        <Text as="span" variant="label" className="truncate">
          {winnerLabel(bestWinner, bestTiedCount)}
        </Text>
        <Text as="span" variant="label" tone="accent" className="tabular shrink-0">
          - {bestPct}%
        </Text>
      </span>
      {worstWinner && (
        <span className="flex min-w-0 items-center gap-1.5 sm:justify-end">
          <Text as="span" variant="label" tone="structure" className="tabular shrink-0">
            {worstPct}% -
          </Text>
          <Text as="span" variant="label" className="truncate">
            {winnerLabel(worstWinner, worstTiedCount)}
          </Text>
          <WorstIcon size={15} tone="structure" className="shrink-0" />
        </span>
      )}
    </div>
  );
}

function winnerLabel(winner: EventVoteCandidateResult, tiedCount: number): string {
  return tiedCount > 1 ? `Égalité (${tiedCount})` : `${winner.firstName} ${winner.lastName}`;
}
