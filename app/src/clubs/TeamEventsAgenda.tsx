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
import { EventRsvpControl } from './EventRsvpControl';

/**
 * One line per event — time, type, key badges, location (+ opponent for
 * MATCH), RSVP control, and a "Voir →" link to EventDetailPage. Everything
 * else (notes, the full RSVP/convocation breakdown, Modifier/Supprimer,
 * convocation management) now lives on that detail page for BOTH event
 * types, not just MATCH — EventDetailPage and its Effectif tab
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
  const hasBadges =
    (isRostered && event.myConvocation) ||
    event.isImported ||
    !event.timeConfirmed ||
    (isMatch && !!event.venue);

  return (
    <Card className="flex flex-row overflow-hidden p-0">
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
        {/* One line for the common case at lg+: badges, location (+
            opponent for MATCH), RSVP control, and the detail link.
            `lg:flex-wrap` (rather than nowrap) is the safety valve for an
            unusually crowded row (several badges, a long location) — the
            RSVP/link cluster drops to its own second line instead of being
            forced to overlap the badges/location content, which a hard
            nowrap did. Below lg it stacks top to bottom, since there's no
            single-line requirement on a narrower card. */}
        <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-3 lg:gap-y-2">
          {hasBadges && (
            // shrink-0 on both the cluster and each badge: badges never
            // compress, only the location span (flex-1 + min-w-0, a direct
            // sibling rather than nested alongside these) gives up width.
            // Nesting location one level down inside a shared wrapper with
            // the badges previously broke that: the wrapper's own automatic
            // min-content size baked in the badges' full width, so the flex
            // algorithm either couldn't shrink the wrapper at all (letting
            // it barge into the RSVP/link column) or, once min-w-0 was moved
            // onto the wrapper to fix that, lost track of the badges' floor
            // entirely and let them overflow it instead. Keeping all three
            // — badges, location, RSVP/link — as flat siblings of one row
            // sidesteps that miscalculation altogether.
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
              {isRostered && event.myConvocation && <Badge className="shrink-0">Convoqué</Badge>}
              {isMatch && event.venue && (
                <span className="shrink-0">
                  <EventVenueBadge venue={event.venue} />
                </span>
              )}
              {event.isImported && (
                <Badge variant="outline" className="shrink-0">
                  Importé
                </Badge>
              )}
              {!event.timeConfirmed && (
                <Badge variant="outline" className="shrink-0 whitespace-nowrap">
                  Heure à confirmer
                </Badge>
              )}
            </div>
          )}
          {/* Jersey/ball mini-chips, always rendered for both event types.
              shrink-0 keeps them from compressing; they fall back to the
              row's own lg:flex-wrap (not a hardcoded second row) when the
              line is too crowded to fit everything, same safety valve the
              badges cluster above already relies on. */}
          <div className="shrink-0">
            <EventLogisticsMiniChips eventType={event.type} logistics={event.logistics} />
          </div>
          {/* flex-1 + min-w-0 is what lets lg:truncate actually bite instead
              of forcing the row to grow past its container — a long
              location/opponent string truncates rather than pushing badges
              or the RSVP/link cluster off the single line. */}
          <span className="min-w-0 flex-1 text-sm text-muted lg:truncate">
            {event.location}
            {isMatch ? ` · vs ${event.opponentName}` : ''}
          </span>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
            {isRostered && (
              <EventRsvpControl clubId={clubId} teamId={teamId} event={event} compactOnDesktop />
            )}
            <Link
              to={`/clubs/${clubId}/teams/${teamId}/events/${event.id}`}
              className="shrink-0 text-sm font-bold text-blue-green hover:underline"
            >
              {eventDetailLinkLabel(event.type)} →
            </Link>
          </div>
        </div>
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
