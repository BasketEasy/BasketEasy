import { useState } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Card } from '@basketeasy/ui/card';
import { Heading } from '@basketeasy/ui/heading';
import type { TeamEvent } from '@basketeasy/types/events';
import { eventDayKey, formatDayHeading, formatEventTime } from './eventDateFormat';
import { eventTypeLabel } from './eventLabels';
import { EventEditModal } from './EventEditModal';
import { EventDeleteModal } from './EventDeleteModal';

function AgendaEventCard({
  clubId,
  teamId,
  event,
  canManage,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  canManage: boolean;
}) {
  const [isEditOpen, setIsEditOpen] = useState(false);

  return (
    <Card className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-charcoal">{formatEventTime(event.startsAt)}</span>
          <Badge variant={event.type === 'MATCH' ? 'secondary' : 'outline'}>
            {eventTypeLabel(event.type)}
          </Badge>
        </div>
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
        </div>
      )}
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
}: {
  clubId: string;
  teamId: string;
  events: TeamEvent[];
  canManage: boolean;
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
          <Heading as="h3" size="xl" className="m-0 uppercase tracking-wide text-muted">
            {formatDayHeading(dayEvents[0].startsAt)}
          </Heading>
          <div className="flex flex-col gap-2">
            {dayEvents.map((event) => (
              <AgendaEventCard
                key={event.id}
                clubId={clubId}
                teamId={teamId}
                event={event}
                canManage={canManage}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
