import { Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { FactTile } from '@basketeasy/ui/fact-tile';
import { CalendarIcon } from '@basketeasy/ui/icons/calendar';
import type { EventRsvpStatus, TeamEvent } from '@basketeasy/types/events';
import { formatEventDayShort, formatEventTime } from './eventDateFormat';

const MY_ANSWER: Record<EventRsvpStatus, string> = {
  GOING: 'Présent',
  NOT_GOING: 'Absent',
  MAYBE: 'Peut-être',
};

/**
 * The team hero's fact: when the next event is. A rostered reader also reads
 * their own answer to it, so the one question they may owe is on the hero.
 * `navState` is the origin the team page was opened with, handed on so the
 * event page's way back still ends where the journey started.
 */
export function TeamNextEventTile({
  clubId,
  teamId,
  event,
  showMyAnswer,
  navState,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  showMyAnswer: boolean;
  navState: unknown;
}) {
  const subject =
    event.type === 'MATCH'
      ? event.opponentName
        ? `vs ${event.opponentName}`
        : 'Match'
      : 'Entraînement';
  const answer = showMyAnswer
    ? ` · ${event.myRsvpStatus ? MY_ANSWER[event.myRsvpStatus] : 'Sans réponse'}`
    : '';
  return (
    <FactTile
      icon={<CalendarIcon size="lg" aria-hidden="true" />}
      label={
        <span className="tabular">
          {formatEventDayShort(event.startsAt)} ·{' '}
          {event.timeConfirmed ? formatEventTime(event.startsAt) : 'heure à confirmer'}
        </span>
      }
      detail={`Prochain : ${subject}${answer}`}
      actions={
        <Button asChild variant="outline" size="sm" className="flex-1">
          <Link to={`/clubs/${clubId}/teams/${teamId}/events/${event.id}`} state={navState}>
            {event.type === 'MATCH' ? 'Voir le match' : 'Voir la séance'}
          </Link>
        </Button>
      }
    />
  );
}
