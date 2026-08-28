import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { cn } from '@basketeasy/ui/cn';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import type { TeamEvent } from '@basketeasy/types/events';
import { eventDayKey, formatDayHeading, formatEventTime } from './eventDateFormat';
import { eventDetailLinkLabel, eventTypeShortLabel } from './eventLabels';
import { EventLogisticsMiniChips } from './EventLogisticsMiniChips';
import { EventVenueBadge } from './EventVenueBadge';
import { EventVoteBadge } from './EventVoteBadge';
import { EventRsvpControl } from './EventRsvpControl';
import { MatchWinnersRow } from './MatchWinnersRow';

/**
 * Two content columns to the right of the time block — left: venue/status
 * badges plus the jersey/ball mini-chips, with the RSVP control underneath;
 * right: location (+ opponent for MATCH) with the "Voir →" link underneath.
 * Everything else (notes, the full RSVP/convocation breakdown,
 * Modifier/Supprimer, convocation management) lives on the detail page for
 * BOTH event types, not just MATCH — EventDetailPage and its Effectif tab
 * (EventRosterTab) cover TRAINING exactly the same way, so the agenda card
 * doesn't need to duplicate any of it here. EventRow (the table view) is a
 * different surface with room to spare and still carries those inline.
 */
function AgendaEventCard({
  clubId,
  teamId,
  event,
  isRostered,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  isRostered: boolean;
}) {
  const isMatch = event.type === 'MATCH';

  return (
    <Card variant="flush" className="flex flex-row">
      <div
        className={cn(
          'flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 py-4 sm:w-24',
          isMatch
            ? 'bg-blue-green text-cream'
            : 'border-r border-border bg-surface-2 text-charcoal',
        )}
      >
        {event.timeConfirmed ? (
          <span className="tabular font-heading text-2xl font-extrabold leading-none sm:text-3xl">
            {formatEventTime(event.startsAt)}
          </span>
        ) : (
          // w-full + text-center (rather than letting the span shrink-to-fit
          // and get centered by the flex column) keeps this two-word label
          // from overflowing the narrow time-block column and getting
          // clipped by the card's overflow-hidden — it was rendering as a
          // mangled fragment ("ONFIRME") on a narrow viewport before this.
          <span className="w-full break-words px-0.5 text-center font-heading text-xs font-extrabold uppercase leading-tight tracking-wide-caps">
            à confirmer
          </span>
        )}
        <span className="min-w-0 max-w-full truncate font-heading text-xs font-bold uppercase tracking-wide-caps opacity-80">
          {eventTypeShortLabel(event.type)}
        </span>
      </div>
      <div className="flex min-w-0 flex-grow flex-col gap-2.5 p-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-4">
          {/* Left column: badge/logistics cluster on top, RSVP underneath.
              min-w-0 + flex-1 lets it shrink below its content's natural
              width instead of the sm:flex-row parent falling back to the
              min-content trap the single-line layout hit before (a wrapper
              around a flex-1 sibling of shrink-0 items baking in the wrong
              floor) — here each column is its own flex-1 min-w-0 item, so
              there's no shrink-0/flex-1 mix inside a shared wrapper to get
              wrong. The columns only sit side by side from `sm` up — below
              that the RSVP control's fixed-width segmented group (see
              EventRsvpControl, `w-fit`, non-compact below `lg`) is too wide
              for a half-width mobile column, so the whole card stacks to
              one full-width column below `sm` instead, which is also
              where a two-up layout stops earning its keep on a ~360-400px
              phone anyway. */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {/* Venue/status badges plus the jersey/ball mini-chips, all
                shrink-0 flex-wrap siblings — none of them compete for
                space with a flex-1 item the way location used to sit
                alongside badges on the old single row, so free-wrapping
                them together here is safe. */}
            <div className="flex flex-wrap items-center gap-2">
              {isRostered && event.myConvocation && <Badge className="shrink-0">Convoqué</Badge>}
              {isMatch && event.venue && (
                <span className="shrink-0">
                  <EventVenueBadge venue={event.venue} />
                </span>
              )}
              {event.isImported && (
                <Badge variant="outline" tone="neutral" className="shrink-0">
                  Importé
                </Badge>
              )}
              {!event.timeConfirmed && (
                <Badge variant="outline" tone="neutral" className="shrink-0 whitespace-nowrap">
                  Heure à confirmer
                </Badge>
              )}
              <EventLogisticsMiniChips eventType={event.type} logistics={event.logistics} />
              <EventVoteBadge event={event} />
            </div>
            {isRostered && (
              <EventRsvpControl clubId={clubId} teamId={teamId} event={event} compactOnDesktop />
            )}
          </div>
          {/* Right column: location (+ opponent for MATCH) on top, the
              "Voir →" link underneath. min-w-0 lets the location line
              truncate instead of forcing the column past its share of the
              row. */}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:items-end sm:text-right">
            <span className="min-w-0 max-w-full truncate text-sm text-muted">
              {event.location}
              {isMatch ? ` · vs ${event.opponentName}` : ''}
            </span>
            <Link
              to={`/clubs/${clubId}/teams/${teamId}/events/${event.id}`}
              className="shrink-0 text-sm font-bold text-blue-green hover:underline"
            >
              {eventDetailLinkLabel(event.type)} →
            </Link>
          </div>
        </div>
        <MatchWinnersRow clubId={clubId} teamId={teamId} event={event} />
      </div>
    </Card>
  );
}

/**
 * Day-grouped agenda view — the Événements tab's default (item 5a). Reads a
 * bounded, unpaginated window of events (see TeamDetailPage's agenda fetch,
 * from today through the LINKING_PAGE_SIZE cap) already sorted ascending by
 * startsAt, so grouping only needs to preserve arrival order — no re-sort.
 * Empty days are simply never rendered, since only days with an event
 * produce a group at all.
 */
export function TeamEventsAgenda({
  clubId,
  teamId,
  events,
  isRostered,
}: {
  clubId: string;
  teamId: string;
  events: TeamEvent[];
  isRostered: boolean;
}) {
  const groups = new Map<string, TeamEvent[]>();
  for (const event of events) {
    const key = eventDayKey(event.startsAt);
    const group = groups.get(key);
    if (group) {
      group.push(event);
    } else {
      groups.set(key, [event]);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {Array.from(groups.entries()).map(([key, dayEvents]) => (
        <section key={key} className="flex flex-col gap-3">
          <SectionHeading>{formatDayHeading(dayEvents[0].startsAt)}</SectionHeading>
          <div className="flex flex-col gap-2">
            {dayEvents.map((event) => (
              <AgendaEventCard
                key={event.id}
                clubId={clubId}
                teamId={teamId}
                event={event}
                isRostered={isRostered}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
