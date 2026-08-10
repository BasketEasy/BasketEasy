import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { FieldError } from '@basketeasy/ui/field-error';
import { Input } from '@basketeasy/ui/input';
import { Textarea } from '@basketeasy/ui/textarea';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { TeamEvent } from '@basketeasy/types/events';
import { useEventUpdate } from './useEventUpdate';
import { useEventDelete } from './useEventDelete';
import { getClubErrorMessage } from './clubErrorMessages';
import { formatEventDate, toDatetimeLocalValue } from './eventDateFormat';

export function EventRow({
  clubId,
  teamId,
  event,
  isAdmin,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
  isAdmin: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(event.startsAt));
  const [location, setLocation] = useState(event.location);
  const [notes, setNotes] = useState(event.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const { mutate: updateEvent, isPending: isUpdating } = useEventUpdate(clubId, teamId);
  const { mutate: deleteEvent, isPending: isDeleting } = useEventDelete(clubId, teamId);

  const startEditing = () => {
    setStartsAt(toDatetimeLocalValue(event.startsAt));
    setLocation(event.location);
    setNotes(event.notes ?? '');
    setError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setStartsAt(toDatetimeLocalValue(event.startsAt));
    setLocation(event.location);
    setNotes(event.notes ?? '');
    setError(null);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <TableRow>
        <TableCell>
          <Input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </TableCell>
        <TableCell>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </TableCell>
        <TableCell>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </TableCell>
        <TableCell className="flex flex-col gap-2">
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isUpdating}
              onClick={() =>
                updateEvent(
                  {
                    eventId: event.id,
                    dto: {
                      startsAt: new Date(startsAt).toISOString(),
                      location,
                      notes: notes || undefined,
                    },
                  },
                  {
                    onSuccess: () => setIsEditing(false),
                    onError: (err) => setError(getClubErrorMessage(err)),
                  },
                )
              }
            >
              Enregistrer
            </Button>
            <Button variant="ghost" onClick={cancelEditing}>
              Annuler
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>{formatEventDate(event.startsAt)}</TableCell>
      <TableCell>{event.location}</TableCell>
      <TableCell>{event.notes ?? '—'}</TableCell>
      <TableCell className="flex flex-col gap-2">
        {error && <FieldError>{error}</FieldError>}
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={startEditing}>
              Modifier
            </Button>
            <Button
              variant="outline"
              disabled={isDeleting}
              onClick={() =>
                deleteEvent(event.id, { onError: (err) => setError(getClubErrorMessage(err)) })
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
