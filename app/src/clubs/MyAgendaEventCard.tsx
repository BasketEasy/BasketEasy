import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { ResponseMeter } from '@basketeasy/ui/response-meter';
import { Text } from '@basketeasy/ui/text';
import { TimeBlock } from '@basketeasy/ui/time-block';
import type { MyAgendaEvent } from '@basketeasy/types/my-dashboard';
import { formatEventDate } from './eventDateFormat';
import { eventTypeLabel } from './eventLabels';
import { EventRsvpControl } from './EventRsvpControl';

/**
 * One event on the cross-team home agenda. The manager's « Cette semaine »
 * card and the player's « Ma semaine » screen both render the same record —
 * an upcoming event across every team the caller manages or is rostered on —
 * so they share this one component (CLAUDE.md "one component per record")
 * instead of growing two near-identical cards.
 *
 * The card is a plain container, never a `Link`: a rostered viewer answers
 * here, and an interactive control nested inside an anchor is invalid HTML
 * that breaks both keyboard activation and screen-reader semantics. The
 * title/meta block is the link, the RSVP control is its sibling.
 *
 * Both sizes open on a `TimeBlock` tile (the Parquet time block, solid for a
 * match, outlined for a training): `sm` on the `size="default"` list card,
 * `md` on `size="hero"`, the player's "Prochain rendez-vous", which adds a `brand`-tone card when the viewer is actually called up (the same
 * tone the event page's decision band uses for "this is the thing on the
 * screen" — `Card`'s `tone` prop, per the phase-3 precedent), and a
 * full-width RSVP control since it is the one action on the card.
 *
 * `showRsvpSummary` renders the squad-wide `ResponseMeter` on the
 * `size="default"` card only — `ManagerHome`'s "Cette semaine" list opts in,
 * `PlayerHome` doesn't: a player's own row already carries her personal RSVP
 * control, and a squad-wide meter on every row of a to-do list would be
 * noise where the manager's list has no such control of its own to compete
 * with. The hero card never shows it regardless of the flag — it's the
 * player's one most-important event, not a squad view.
 */
export function MyAgendaEventCard({
  event,
  isRostered,
  size = 'default',
  showRsvpSummary = false,
}: {
  event: MyAgendaEvent;
  isRostered: boolean;
  size?: 'default' | 'hero';
  showRsvpSummary?: boolean;
}) {
  const isCalledUp = isRostered && event.myConvocation;
  const eventHref = `/clubs/${event.clubId}/teams/${event.teamId}/events/${event.eventId}`;
  const rsvpEvent = {
    id: event.eventId,
    myRsvpStatus: event.myRsvpStatus,
    myRsvpRespondedBy: event.myRsvpRespondedBy,
    myRsvpRespondedAt: event.myRsvpRespondedAt,
  };

  if (size === 'hero') {
    return (
      <Card
        tone={isCalledUp ? 'brand' : 'neutral'}
        className="flex w-full flex-col gap-3 p-3.5 sm:p-4"
      >
        <div className="flex min-w-0 gap-3.5">
          <TimeBlock
            type={event.type}
            startsAt={event.startsAt}
            timeConfirmed={event.timeConfirmed}
            size="md"
          />
          <Link
            to={eventHref}
            state={{ origin: { from: 'dashboard' } }}
            className={cn(
              'group flex min-w-0 flex-1 flex-col justify-center gap-1 rounded-sm text-left',
              focusRing,
            )}
          >
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone={event.type === 'MATCH' ? 'brand' : 'structure'}>
                {eventTypeLabel(event.type)}
              </Badge>
              {isCalledUp && <Badge>Convoqué</Badge>}
            </span>
            <Text
              as="span"
              variant="display"
              size="lg"
              className="group-hover:underline group-focus-visible:underline"
            >
              {event.type === 'MATCH' && event.opponentName
                ? `vs ${event.opponentName}`
                : event.teamName}
            </Text>
            <Text as="span" variant="meta" size="sm">
              {formatEventDate(event.startsAt)} · {event.location}
            </Text>
          </Link>
        </div>
        {isRostered && (
          <EventRsvpControl
            clubId={event.clubId}
            teamId={event.teamId}
            event={rsvpEvent}
            fullWidth
          />
        )}
      </Card>
    );
  }

  return (
    <Card className="flex w-full flex-col gap-3 p-3.5">
      <div className="flex min-w-0 gap-3">
        <TimeBlock
          type={event.type}
          startsAt={event.startsAt}
          timeConfirmed={event.timeConfirmed}
          size="sm"
        />
        <Link
          to={eventHref}
          state={{ origin: { from: 'dashboard' } }}
          className={cn(
            'group flex min-w-0 flex-1 flex-col justify-center gap-1 rounded-sm text-left',
            focusRing,
          )}
        >
          <span className="flex flex-wrap items-center gap-2">
            <Text
              as="span"
              variant="label"
              className="group-hover:underline group-focus-visible:underline"
            >
              {event.teamName}
            </Text>
            <Badge tone={event.type === 'MATCH' ? 'brand' : 'structure'}>
              {eventTypeLabel(event.type)}
            </Badge>
            {isCalledUp && <Badge>Convoqué</Badge>}
          </span>
          <Text as="span" variant="meta">
            {formatEventDate(event.startsAt)} · {event.location}
            {event.type === 'MATCH' && event.opponentName ? ` · vs ${event.opponentName}` : ''}
          </Text>
        </Link>
      </div>
      {showRsvpSummary && event.rsvpSummary.rosterSize > 0 && (
        <ResponseMeter
          going={event.rsvpSummary.going}
          maybe={event.rsvpSummary.maybe}
          notGoing={event.rsvpSummary.notGoing}
          pending={event.rsvpSummary.pending}
          size="sm"
        />
      )}
      {isRostered && (
        <EventRsvpControl clubId={event.clubId} teamId={event.teamId} event={rsvpEvent} />
      )}
    </Card>
  );
}
