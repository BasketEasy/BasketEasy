import { Badge } from '@basketeasy/ui/badge';
import { TrophyIcon } from '@basketeasy/ui/icons/trophy';
import type { TeamEvent } from '@basketeasy/types/events';
import { voteWindowDaysRemaining } from './voteWindow';

/**
 * "Votes ouverts · N j restants" (`AgendaCard.dc.html:126-129`) — shown on a
 * MATCH event currently inside the vote window (opens 1h after kickoff,
 * closes 5 days after — mirrors EventsService.castVote's hard server-side
 * window, see voteWindow.ts). Shared by the table (EventRow) and card
 * (TeamEventsAgenda) agenda views, same pattern as
 * EventVenueBadge/EventLogisticsMiniChips. Renders nothing outside the
 * window or for a TRAINING event — voting doesn't exist there.
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
    <Badge variant="soft" tone="brand" className="gap-1.5">
      <TrophyIcon className="h-3 w-3 shrink-0" />
      Votes ouverts · {daysRemaining} j restant{daysRemaining > 1 ? 's' : ''}
    </Badge>
  );
}
