import { Card } from '@basketeasy/ui/card';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import type { TeamEvent } from '@basketeasy/types/events';
import { hasVoteWindowClosed } from './voteWindow';
import { useEventVoteResults } from './useEventVoteResults';
import { WorstIcon } from './voteIcons';

/**
 * Compact "Vainqueurs" strip shown directly under a past MATCH event's card
 * on the team's Événements tab, once its vote window has closed — the top
 * BEST and top WORST-category player, by name. Results are public to
 * everyone once the window closes (see EventsService.getEventVoteResults),
 * so no eligibility check is needed here beyond "the window is closed".
 * Renders nothing before that, for a TRAINING event, or if nobody voted —
 * keeps the agenda clean for matches with no votes cast.
 */
export function MatchWinnersCard({
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

  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-1.5 bg-surface-2 px-3.5 py-2.5">
      <span className="flex items-center gap-2 text-sm">
        <TrophyIcon className="h-4 w-4 shrink-0 text-gold" />
        <span className="text-muted">Meilleur joueur</span>
        <span className="font-bold text-charcoal">
          {bestWinner.firstName} {bestWinner.lastName}
        </span>
      </span>
      {worstWinner && (
        <span className="flex items-center gap-2 text-sm">
          <WorstIcon size={15} className="shrink-0 text-blue-green-2" />
          <span className="text-muted">Joueur en difficulté</span>
          <span className="font-bold text-charcoal">
            {worstWinner.firstName} {worstWinner.lastName}
          </span>
        </span>
      )}
    </Card>
  );
}
