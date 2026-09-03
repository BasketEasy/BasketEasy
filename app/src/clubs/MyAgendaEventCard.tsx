import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
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
 * `size="default"` is the card phase 1 shipped inside `DashboardPage`
 * (`Card` `inset`, no `TimeBlock`) — kept byte-identical so the manager's
 * "Cette semaine" list is unaffected by this phase. `size="hero"` is new for
 * the player's "Prochain rendez-vous": the phase-0 `TimeBlock` at its larger
 * size, a `brand`-tone card when the viewer is actually called up (the same
 * tone the event page's decision band uses for "this is the thing on the
 * screen" — `Card`'s `tone` prop, per the phase-3 precedent), and a
 * full-width RSVP control since it is the one action on the card.
 *
 * `MyAgendaEvent` doesn't carry `timeConfirmed` yet
 * (`docs/ux-audit/player-first-implementation-plan.md` §6.1, phase 7), so the
 * hero's `TimeBlock` always renders a confirmed time — every event on
 * today's dashboard payload has a real kickoff.
 */
export function MyAgendaEventCard({
  event,
  isRostered,
  size = 'default',
}: {
  event: MyAgendaEvent;
  isRostered: boolean;
  size?: 'default' | 'hero';
}) {
  const isCalledUp = isRostered && event.myConvocation;
  const eventHref = `/clubs/${event.clubId}/teams/${event.teamId}/events/${event.eventId}`;
  const rsvpEvent = { id: event.eventId, myRsvpStatus: event.myRsvpStatus };

  if (size === 'hero') {
    return (
      <Card variant="flush" tone={isCalledUp ? 'brand' : 'neutral'} className="flex w-full">
        <TimeBlock type={event.type} startsAt={event.startsAt} timeConfirmed size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
          <Link
            to={eventHref}
            state={{ origin: { from: 'dashboard' } }}
            className={cn('group flex flex-col gap-1 rounded-sm text-left', focusRing)}
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
          {isRostered && (
            <EventRsvpControl
              clubId={event.clubId}
              teamId={event.teamId}
              event={rsvpEvent}
              fullWidth
            />
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card variant="inset" className="flex w-full flex-col gap-2">
      <Link
        to={eventHref}
        state={{ origin: { from: 'dashboard' } }}
        className={cn('group flex flex-col gap-1 rounded-sm text-left', focusRing)}
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
      {isRostered && (
        <EventRsvpControl clubId={event.clubId} teamId={event.teamId} event={rsvpEvent} />
      )}
    </Card>
  );
}
