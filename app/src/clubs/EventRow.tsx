import { useState } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { TeamEvent } from '@basketeasy/types/events';
import { formatEventDate } from './eventDateFormat';
import { eventTypeLabel } from './eventLabels';
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
      <TableCell>{formatEventDate(event.startsAt)}</TableCell>
      <TableCell>{eventTypeLabel(event.type)}</TableCell>
      <TableCell>{event.location}</TableCell>
      <TableCell>{event.type === 'MATCH' ? `vs ${event.opponentName}` : '—'}</TableCell>
      <TableCell>{event.notes ?? '—'}</TableCell>
      <TableCell className="min-w-[280px]">
        <div className="flex flex-col gap-2.5">
          {isRostered && event.myConvocation && <Badge>Convoqué</Badge>}
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
