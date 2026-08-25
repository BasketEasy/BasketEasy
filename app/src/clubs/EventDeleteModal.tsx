import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { SelectField } from '@basketeasy/ui/select-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { toast } from '@basketeasy/ui/toast-store';
import type { EventUpdateScope, TeamEvent } from '@basketeasy/types/events';
import { useEventDelete } from './useEventDelete';
import { getClubErrorMessage } from './clubErrorMessages';
import { EVENT_UPDATE_SCOPE_OPTIONS } from './eventLabels';

export function EventDeleteModal({
  clubId,
  teamId,
  event,
}: {
  clubId: string;
  teamId: string;
  event: TeamEvent;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<EventUpdateScope>('THIS');
  const { mutate: deleteEvent, isPending } = useEventDelete(clubId, teamId);

  const isRecurring = event.recurrenceId !== null;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // Reset to a fresh THIS scope every time the dialog reopens, so a
      // scope picked on a previous open never leaks into the next
      // confirmation.
      setScope('THIS');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Supprimer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer l&apos;événement</DialogTitle>
          <DialogDescription>Cette action est irréversible.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {isRecurring && (
            <SelectField
              label="Appliquer à"
              id={`event-${event.id}-delete-scope-select`}
              options={EVENT_UPDATE_SCOPE_OPTIONS}
              value={scope}
              onValueChange={(value) => setScope(value as EventUpdateScope)}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="outline"
              loading={isPending}
              onClick={() =>
                deleteEvent(
                  { eventId: event.id, scope },
                  {
                    onSuccess: () => {
                      toast({ variant: 'success', title: 'Événement supprimé' });
                      setOpen(false);
                    },
                    onError: (err) =>
                      toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
                  },
                )
              }
            >
              Confirmer la suppression
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
