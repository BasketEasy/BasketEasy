import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { cn } from '@basketeasy/ui/cn';
import { FactTile } from '@basketeasy/ui/fact-tile';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { Heading } from '@basketeasy/ui/heading';
import { ResponseMeter } from '@basketeasy/ui/response-meter';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { TimeBlock } from '@basketeasy/ui/time-block';
import type { MyAgendaEvent } from '@basketeasy/types/my-dashboard';
import { eventVenueLabel, isUnknownEventLocation } from '@basketeasy/types/events';
import { EventTravelModeControl } from '../meeting-points/EventTravelModeControl';
import { formatEventDate, formatEventDayFull, formatEventTime } from './eventDateFormat';
import { MapPinIcon } from './eventDetailIcons';
import { eventTypeLabel } from './eventLabels';
import { EventRsvpControl } from './EventRsvpControl';
import { EventVenueBadge } from './EventVenueBadge';

const DASHBOARD_ORIGIN = { origin: { from: 'dashboard' } };

/**
 * The hero's venue detail: the RDV when the match has one (so the reader
 * knows what « avec le groupe » means before answering), else the arrival
 * time a match always has, else the address under a named gym.
 */
function heroVenueDetail(event: MyAgendaEvent): string | undefined {
  const plan = event.meetingPlan;
  if (plan?.meetingPoint) {
    return plan.meetsAt
      ? `RDV ${formatEventTime(plan.meetsAt)} · ${plan.meetingPoint.name}`
      : 'RDV · horaire à confirmer';
  }
  if (plan) return `Arrivée ${formatEventTime(plan.arrivalAt)}`;
  return event.locationName ? event.location : undefined;
}

/**
 * The list card's one line about getting there, for a GOING answer to a
 * match with a meeting point. The choice itself lives on the hero and on the
 * event page: two radio cards on every list card would drown the agenda.
 */
function listTravelLine(event: MyAgendaEvent): string | null {
  const plan = event.meetingPlan;
  if (event.type !== 'MATCH' || event.myTravelMode === null || !plan?.meetingPoint) return null;
  if (event.myTravelMode === 'DIRECT') {
    return `Direct à la salle · arrivée ${formatEventTime(plan.arrivalAt)}`;
  }
  return plan.meetsAt
    ? `RDV ${formatEventTime(plan.meetsAt)} · avec le groupe`
    : 'RDV à confirmer · avec le groupe';
}

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
 * The list card (`size="default"`) opens on a `TimeBlock` tile (solid for a
 * match, outlined for a training). The hero (`size="hero"`, the player's
 * « Prochain rendez-vous ») takes the page-hero grammar instead: badges, the
 * team as eyebrow, the title as an `h2` (the greeting is the page's `h1`),
 * the date line, then a venue `FactTile` with the RDV, the full-width RSVP
 * control and, once the reader said « Présent » to a match with a meeting
 * point, « Comment venez-vous ? » — the same `EventTravelModeControl` the
 * event page's decision band renders. It takes the `brand` tone when the
 * viewer is actually called up.
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
    const isMatch = event.type === 'MATCH';
    return (
      <Card
        tone={isCalledUp ? 'brand' : 'neutral'}
        className="flex w-full flex-col gap-3.5 p-4 md:grid md:grid-cols-2 md:items-start md:gap-6 md:p-6"
      >
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isMatch ? 'brand' : 'structure'}>{eventTypeLabel(event.type)}</Badge>
            {isCalledUp && (
              <Badge variant="soft" tone="accent">
                Convoqué
              </Badge>
            )}
            {isMatch && event.venue && <EventVenueBadge venue={event.venue} />}
          </div>
          <Text variant="eyebrow">{event.teamName}</Text>
          {/* h2, not h1: the page's h1 is the greeting. */}
          <Heading as="h2" size="hero" className="m-0">
            <Link
              to={eventHref}
              state={DASHBOARD_ORIGIN}
              className={cn('rounded-sm hover:underline', focusRing)}
            >
              {isMatch && event.opponentName ? `vs ${event.opponentName}` : 'Entraînement'}
            </Link>
          </Heading>
          <Text variant="meta" className="tabular">
            {formatEventDayFull(event.startsAt)} ·{' '}
            {event.timeConfirmed ? formatEventTime(event.startsAt) : 'heure à confirmer'}
          </Text>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <FactTile
            icon={<MapPinIcon size={19} />}
            label={
              isUnknownEventLocation(event.location)
                ? 'Lieu non communiqué'
                : eventVenueLabel(event)
            }
            detail={heroVenueDetail(event)}
          />
          {isRostered && (
            <EventRsvpControl
              clubId={event.clubId}
              teamId={event.teamId}
              event={rsvpEvent}
              fullWidth
            />
          )}
          {isRostered && event.myTravelMode !== null && (
            <EventTravelModeControl
              clubId={event.clubId}
              teamId={event.teamId}
              event={{ ...event, id: event.eventId }}
            />
          )}
        </div>
      </Card>
    );
  }

  const travelLine = isRostered ? listTravelLine(event) : null;
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
          state={DASHBOARD_ORIGIN}
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
            {formatEventDate(event.startsAt)} · {eventVenueLabel(event)}
            {event.type === 'MATCH' && event.opponentName ? ` · vs ${event.opponentName}` : ''}
          </Text>
        </Link>
      </div>
      {travelLine && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Text as="span" variant="meta" size="xs" className="tabular">
            {travelLine}
          </Text>
          <TextLink asChild tone="brand">
            <Link to={`${eventHref}?tab=decision`} state={DASHBOARD_ORIGIN}>
              Changer
            </Link>
          </TextLink>
        </div>
      )}
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
