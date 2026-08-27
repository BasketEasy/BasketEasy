import { Badge } from '@basketeasy/ui/badge';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import type { TeamEvent } from '@basketeasy/types/events';
import { voteWindowDaysRemaining } from './voteWindow';

/**
 * "Votes ouverts · N j restants" (`AgendaCard.dc.html:126-129`) — shown on a
 * past MATCH event still inside the client-computed vote window. Shared by
 * the table (EventRow) and card (TeamEventsAgenda) agenda views, same
 * pattern as EventVenueBadge/EventLogisticsMiniChips. Renders nothing
 * outside the window (before the match, or once it's closed) or for a
 * TRAINING event — voting doesn't exist there.
 */
export function EventVoteBadge({ event }: { event: TeamEvent }) {
  if (event.type !== 'MATCH') {
    return null;
  }
  const daysRemaining = voteWindowDaysRemaining(event.startsAt);
  if (daysRemaining === null) {
    return null;
  }
  return (
    <Badge variant="outline" className="gap-1.5 border-orange/30 bg-orange-tint text-orange-text">
      <TrophyIcon className="h-3 w-3 shrink-0" />
      Votes ouverts · {daysRemaining} j restant{daysRemaining > 1 ? 's' : ''}
    </Badge>
  );
}
