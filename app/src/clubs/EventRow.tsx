import { useState } from 'react';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { TeamEvent } from '@basketeasy/types/events';
import { formatEventDate } from './eventDateFormat';
import { eventTypeLabel } from './eventLabels';
import { EventEditModal } from './EventEditModal';
import { EventDeleteModal } from './EventDeleteModal';

export function EventRow({
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
    <TableRow>
      <TableCell>{formatEventDate(event.startsAt)}</TableCell>
      <TableCell>{eventTypeLabel(event.type)}</TableCell>
      <TableCell>{event.location}</TableCell>
      <TableCell>{event.type === 'MATCH' ? `vs ${event.opponentName}` : '—'}</TableCell>
      <TableCell>{event.notes ?? '—'}</TableCell>
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
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
