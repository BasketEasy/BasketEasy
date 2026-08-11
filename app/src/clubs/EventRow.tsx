import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { FieldError } from '@basketeasy/ui/field-error';
import { SelectField } from '@basketeasy/ui/select-field';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { EventUpdateScope, TeamEvent } from '@basketeasy/types/events';
import { useEventDelete } from './useEventDelete';
import { getClubErrorMessage } from './clubErrorMessages';
import { formatEventDate } from './eventDateFormat';
import { EVENT_UPDATE_SCOPE_OPTIONS, eventTypeLabel } from './eventLabels';
import { EventEditModal } from './EventEditModal';

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
  const [deleteScope, setDeleteScope] = useState<EventUpdateScope>('THIS');
  const [error, setError] = useState<string | null>(null);
  const { mutate: deleteEvent, isPending: isDeleting } = useEventDelete(clubId, teamId);

  const isRecurring = event.recurrenceId !== null;

  return (
    <TableRow>
      <TableCell>{formatEventDate(event.startsAt)}</TableCell>
      <TableCell>{eventTypeLabel(event.type)}</TableCell>
      <TableCell>{event.location}</TableCell>
      <TableCell>{event.type === 'MATCH' ? `vs ${event.opponentName}` : '—'}</TableCell>
      <TableCell>{event.notes ?? '—'}</TableCell>
      <TableCell className="flex flex-col gap-2">
        {error && <FieldError>{error}</FieldError>}
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <EventEditModal
              clubId={clubId}
              teamId={teamId}
              event={event}
              open={isEditOpen}
              onOpenChange={setIsEditOpen}
            />
            {isRecurring && (
              <SelectField
                label="Appliquer à"
                id={`event-${event.id}-delete-scope-select`}
                containerClassName="w-56"
                options={EVENT_UPDATE_SCOPE_OPTIONS}
                value={deleteScope}
                onValueChange={(value) => setDeleteScope(value as EventUpdateScope)}
              />
            )}
            <Button
              variant="outline"
              disabled={isDeleting}
              onClick={() =>
                deleteEvent(
                  { eventId: event.id, scope: deleteScope },
                  { onError: (err) => setError(getClubErrorMessage(err)) },
                )
              }
            >
              Supprimer
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
