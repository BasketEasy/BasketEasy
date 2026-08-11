import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { FieldError } from '@basketeasy/ui/field-error';
import { Input } from '@basketeasy/ui/input';
import { SelectField } from '@basketeasy/ui/select-field';
import { Textarea } from '@basketeasy/ui/textarea';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { EventType, EventUpdateScope, TeamEvent } from '@basketeasy/types/events';
import { useEventUpdate } from './useEventUpdate';
import { useEventDelete } from './useEventDelete';
import { getClubErrorMessage } from './clubErrorMessages';
import { formatEventDate, toDatetimeLocalValue } from './eventDateFormat';
import { EVENT_TYPE_OPTIONS, EVENT_UPDATE_SCOPE_OPTIONS, eventTypeLabel } from './eventLabels';

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
  const [isEditing, setIsEditing] = useState(false);
  const [type, setType] = useState<EventType>(event.type);
  const [startsAt, setStartsAt] = useState(toDatetimeLocalValue(event.startsAt));
  const [location, setLocation] = useState(event.location);
  const [notes, setNotes] = useState(event.notes ?? '');
  const [opponentName, setOpponentName] = useState(event.opponentName ?? '');
  const [editScope, setEditScope] = useState<EventUpdateScope>('THIS');
  const [deleteScope, setDeleteScope] = useState<EventUpdateScope>('THIS');
  const [error, setError] = useState<string | null>(null);
  const { mutate: updateEvent, isPending: isUpdating } = useEventUpdate(clubId, teamId);
  const { mutate: deleteEvent, isPending: isDeleting } = useEventDelete(clubId, teamId);

  const isRecurring = event.recurrenceId !== null;

  const resetFields = () => {
    setType(event.type);
    setStartsAt(toDatetimeLocalValue(event.startsAt));
    setLocation(event.location);
    setNotes(event.notes ?? '');
    setOpponentName(event.opponentName ?? '');
    setEditScope('THIS');
    setError(null);
  };

  const startEditing = () => {
    resetFields();
    setIsEditing(true);
  };

  const cancelEditing = () => {
    resetFields();
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <TableRow>
        <TableCell>
          <Input
            aria-label="Date et heure"
            type="datetime-local"
            value={startsAt}
            disabled={editScope !== 'THIS'}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          {editScope !== 'THIS' && (
            <p className="text-sm text-muted mt-1">
              La date ne peut être modifiée que pour cet événement seul.
            </p>
          )}
        </TableCell>
        <TableCell>
          <SelectField
            label="Type"
            id={`event-${event.id}-type-select`}
            options={EVENT_TYPE_OPTIONS}
            value={type}
            onValueChange={(value) => setType(value as EventType)}
          />
        </TableCell>
        <TableCell>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </TableCell>
        <TableCell>
          {type === 'MATCH' && (
            <Input
              aria-label="Adversaire"
              placeholder="Adversaire"
              value={opponentName}
              onChange={(e) => setOpponentName(e.target.value)}
            />
          )}
        </TableCell>
        <TableCell>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </TableCell>
        <TableCell className="flex flex-col gap-2">
          {error && <FieldError>{error}</FieldError>}
          {isRecurring && (
            <SelectField
              label="Appliquer à"
              id={`event-${event.id}-edit-scope-select`}
              options={EVENT_UPDATE_SCOPE_OPTIONS}
              value={editScope}
              onValueChange={(value) => setEditScope(value as EventUpdateScope)}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isUpdating}
              onClick={() =>
                updateEvent(
                  {
                    eventId: event.id,
                    dto: {
                      type,
                      ...(editScope === 'THIS'
                        ? { startsAt: new Date(startsAt).toISOString() }
                        : {}),
                      location,
                      notes: notes || undefined,
                      opponentName: type === 'MATCH' ? opponentName : undefined,
                      scope: editScope,
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
      <TableCell>{eventTypeLabel(event.type)}</TableCell>
      <TableCell>{event.location}</TableCell>
      <TableCell>{event.type === 'MATCH' ? `vs ${event.opponentName}` : '—'}</TableCell>
      <TableCell>{event.notes ?? '—'}</TableCell>
      <TableCell className="flex flex-col gap-2">
        {error && <FieldError>{error}</FieldError>}
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={startEditing}>
              Modifier
            </Button>
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
