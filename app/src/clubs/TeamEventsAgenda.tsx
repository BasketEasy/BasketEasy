import { useState } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { cn } from '@basketeasy/ui/cn';
import { SectionHeading } from '@basketeasy/ui/section-heading';
import type { TeamEvent } from '@basketeasy/types/events';
import { eventDayKey, formatDayHeading, formatEventTime } from './eventDateFormat';
import { eventTypeShortLabel } from './eventLabels';
import { EventEditModal } from './EventEditModal';
import { EventDeleteModal } from './EventDeleteModal';
import { EventRsvpControl } from './EventRsvpControl';
import { EventRsvpBreakdown } from './EventRsvpBreakdown';
import { EventConvocationModal } from './EventConvocationModal';
import { EventConvocationBreakdown } from './EventConvocationBreakdown';

function AgendaEventCard({
  clubId,
  teamId,
  event,
  canManage,
  isRostered,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  canManage: boolean;
  isRostered: boolean;
}) {
  const [isEditOpen, setIsEditOpen] = useState(false);

  return (
    <Card className="flex flex-row overflow-hidden p-0">
      <div
        className={cn(
          'flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 py-4 sm:w-24',
          event.type === 'MATCH'
            ? 'bg-blue-green text-cream'
            : 'border-r border-border bg-surface-2 text-charcoal',
        )}
      >
        {event.timeConfirmed ? (
          <span className="tabular font-heading text-2xl font-extrabold leading-none sm:text-3xl">
            {formatEventTime(event.startsAt)}
          </span>
        ) : (
          <span className="font-heading text-sm font-extrabold uppercase leading-none tracking-wide-caps">
            à confirmer
          </span>
        )}
        <span className="min-w-0 max-w-full truncate font-heading text-xs font-bold uppercase tracking-wide-caps opacity-80">
          {eventTypeShortLabel(event.type)}
        </span>
      </div>
      <div className="flex min-w-0 flex-grow flex-col gap-3.5 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            {(isRostered && event.myConvocation) || event.isImported || !event.timeConfirmed ? (
              <div className="flex flex-wrap items-center gap-2">
                {isRostered && event.myConvocation && <Badge>Convoqué</Badge>}
                {event.isImported && <Badge variant="outline">Importé</Badge>}
                {!event.timeConfirmed && <Badge variant="outline">Heure à confirmer</Badge>}
              </div>
            ) : null}
            <span className="text-sm text-muted">
              {event.location}
              {event.type === 'MATCH' ? ` · vs ${event.opponentName}` : ''}
            </span>
            {event.notes && <span className="text-sm text-muted">{event.notes}</span>}
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <EventEditModal
                clubId={clubId}
                teamId={teamId}
                event={event}
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
              />
              <EventDeleteModal clubId={clubId} teamId={teamId} event={event} />
              <EventConvocationModal clubId={clubId} teamId={teamId} eventId={event.id} />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2.5 border-t border-border pt-3">
          {isRostered && <EventRsvpControl clubId={clubId} teamId={teamId} event={event} />}
          <EventRsvpBreakdown clubId={clubId} teamId={teamId} eventId={event.id} />
          <EventConvocationBreakdown clubId={clubId} teamId={teamId} eventId={event.id} />
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
  canManage,
  isRostered,
}: {
  clubId: string;
  teamId: string;
  events: TeamEvent[];
  canManage: boolean;
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
                canManage={canManage}
                isRostered={isRostered}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
