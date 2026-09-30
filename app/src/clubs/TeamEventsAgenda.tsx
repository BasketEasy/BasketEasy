import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { ResponseMeter } from '@basketeasy/ui/response-meter';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import { TimeBlock } from '@basketeasy/ui/time-block';
import type { TeamEvent } from '@basketeasy/types/events';
import { eventDayKey, formatDayHeading } from './eventDateFormat';
import { eventDetailLinkLabel } from './eventLabels';
import { EventLogisticsMiniChips } from './EventLogisticsMiniChips';
import { EventVenueBadge } from './EventVenueBadge';
import { EventVoteBadge } from './EventVoteBadge';
import { EventRsvpControl } from './EventRsvpControl';
import { MatchWinnersRow } from './MatchWinnersRow';
import { Text } from '@basketeasy/ui/text';
import { TextLink } from '@basketeasy/ui/text-link';
import { eventVenueLabel } from '@basketeasy/types/events';

/**
 * Two content columns to the right of the time block — left: venue/status
 * badges plus the jersey/ball mini-chips, with the RSVP control underneath;
 * right: location (+ opponent for MATCH) with the "Voir →" link underneath.
 * Everything else (notes, the full RSVP/convocation breakdown,
 * Modifier/Supprimer, convocation management) lives on the detail page for
 * BOTH event types, not just MATCH — EventDetailPage's « Qui vient ? » /
 * « Effectif de la séance » block covers TRAINING exactly the same way, so
 * the agenda card doesn't need to duplicate any of it here. EventRow (the table view) is a
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
    <Card className="flex flex-row gap-3.5 p-3.5 sm:p-4">
      <TimeBlock type={event.type} startsAt={event.startsAt} timeConfirmed={event.timeConfirmed} />
      <div className="flex min-w-0 flex-grow flex-col gap-2.5">
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
            {event.rsvpSummary.rosterSize > 0 && (
              // Visible to the same audience as the event itself — see
              // EventRsvpBreakdown's doc comment — and no longer behind a
              // click: rsvpSummary now arrives on the event, so the squad's
              // answers read at a glance instead of needing the roster
              // breakdown opened first.
              <ResponseMeter
                going={event.rsvpSummary.going}
                maybe={event.rsvpSummary.maybe}
                notGoing={event.rsvpSummary.notGoing}
                pending={event.rsvpSummary.pending}
                size="sm"
              />
            )}
            {isRostered && (
              <EventRsvpControl clubId={clubId} teamId={teamId} event={event} compactOnDesktop />
            )}
          </div>
          {/* Right column: location (+ opponent for MATCH) on top, the
              "Voir →" link underneath. min-w-0 lets the location line
              truncate instead of forcing the column past its share of the
              row. */}
          <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:items-end sm:text-right">
            <Text as="span" variant="meta" className="min-w-0 max-w-full truncate">
              {eventVenueLabel(event)}
              {isMatch ? ` · vs ${event.opponentName}` : ''}
            </Text>
            <TextLink asChild className="shrink-0">
              <Link to={`/clubs/${clubId}/teams/${teamId}/events/${event.id}`}>
                {eventDetailLinkLabel(event.type)} →
              </Link>
            </TextLink>
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
 * either from today onward or up to today depending on the À venir/Passés
 * toggle, capped at LINKING_PAGE_SIZE) already sorted in the requested
 * direction by startsAt, so grouping only needs to preserve arrival order —
 * no re-sort. Empty days are simply never rendered, since only days with an
 * event produce a group at all.
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
