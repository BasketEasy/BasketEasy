import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@basketeasy/ui/badge';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { TeamEvent } from '@basketeasy/types/events';
import { formatEventDate, formatEventDateOnly } from './eventDateFormat';
import { eventTypeLabel } from './eventLabels';
import { EventLogisticsMiniChips } from './EventLogisticsMiniChips';
import { EventVenueBadge } from './EventVenueBadge';
import { EventEditModal } from './EventEditModal';
import { EventDeleteModal } from './EventDeleteModal';
import { EventRsvpControl } from './EventRsvpControl';
import { EventRsvpBreakdown } from './EventRsvpBreakdown';
import { EventConvocationModal } from './EventConvocationModal';
import { EventConvocationBreakdown } from './EventConvocationBreakdown';

export function EventRow({
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
    <TableRow>
      <TableCell>
        {event.timeConfirmed ? (
          formatEventDate(event.startsAt)
        ) : (
          <div className="flex flex-col items-start gap-1">
            {formatEventDateOnly(event.startsAt)}
            <Badge variant="outline">Heure à confirmer</Badge>
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          {eventTypeLabel(event.type)}
          {event.type === 'MATCH' && event.venue && <EventVenueBadge venue={event.venue} />}
          {event.isImported && <Badge variant="outline">Importé</Badge>}
        </div>
      </TableCell>
      <TableCell>{event.location}</TableCell>
      <TableCell>
        {event.type === 'MATCH' ? (
          <Link
            to={`/clubs/${clubId}/teams/${teamId}/events/${event.id}`}
            className="font-semibold text-blue-green hover:underline"
          >
            vs {event.opponentName}
          </Link>
        ) : (
          '—'
        )}
      </TableCell>
      <TableCell>{event.notes ?? '—'}</TableCell>
      <TableCell className="min-w-[280px]">
        <div className="flex flex-col gap-2.5">
          {isRostered && event.myConvocation && (
            // outline variant (not the orange/success-coded default) plus an
            // explicit "par le coach" and clipboard icon — a filled badge in
            // the brand's primary color, sitting right above the RSVP
            // control, previously read too easily as "attendance confirmed"
            // rather than "the coach picked you," a different, independent
            // signal (see EventConvocationBreakdown's matching icon).
            <Badge variant="outline" className="w-fit gap-1">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3 shrink-0"
              >
                <rect x="6" y="4" width="12" height="17" rx="1.5" />
                <path d="M9 4V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V4" />
                <path d="M9 11.5l2 2 4-4.5" />
              </svg>
              Convoqué par le coach
            </Badge>
          )}
          {event.type === 'MATCH' && <EventLogisticsMiniChips logistics={event.logistics} />}
          {isRostered && <EventRsvpControl clubId={clubId} teamId={teamId} event={event} />}
          <EventRsvpBreakdown clubId={clubId} teamId={teamId} eventId={event.id} />
          <EventConvocationBreakdown clubId={clubId} teamId={teamId} eventId={event.id} />
        </div>
      </TableCell>
      <TableCell>
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
      </TableCell>
    </TableRow>
  );
}
