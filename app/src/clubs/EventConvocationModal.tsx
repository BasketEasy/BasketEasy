import { useEffect, useRef, useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Checkbox } from '@basketeasy/ui/checkbox';
import { Label } from '@basketeasy/ui/label';
import { Loader } from '@basketeasy/ui/loader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { QueryError } from '@basketeasy/ui/query-error';
import { toast } from '@basketeasy/ui/toast-store';
import { teamMemberRoleLabel } from './teamLabels';
import { useEventConvocations } from './useEventConvocations';
import { useEventConvocationsSet } from './useEventConvocationsSet';
import { getClubErrorMessage } from './clubErrorMessages';

/**
 * Manager-only call-up sheet — a focused, infrequent, multi-field edit
 * (picking the whole roster subset for one event), so a Dialog per
 * CLAUDE.md's "Modals vs. inline editing" guidance, same shape as
 * EventEditModal rather than RSVP's inline single-field toggle.
 */
export function EventConvocationModal({
  clubId,
  teamId,
  eventId,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: roster, isError, refetch } = useEventConvocations(clubId, teamId, eventId, open);
  const { mutate: setConvocations, isPending } = useEventConvocationsSet(clubId, teamId);
  // Seeds the checked set once per dialog open, not on every background
  // refetch of the roster query (e.g. window refocus) — otherwise an
  // in-progress, unsaved toggle would silently get overwritten mid-edit.
  const hasSeededRef = useRef(false);

  useEffect(() => {
    if (!open) {
      hasSeededRef.current = false;
      return;
    }
    if (roster && !hasSeededRef.current) {
      setSelected(new Set(roster.filter((r) => r.convoked).map((r) => r.teamPlayerId)));
      hasSeededRef.current = true;
    }
  }, [open, roster]);

  const toggle = (teamPlayerId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(teamPlayerId)) {
        next.delete(teamPlayerId);
      } else {
        next.add(teamPlayerId);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    setConvocations(
      { eventId, teamPlayerIds: Array.from(selected) },
      {
        onSuccess: () => {
          toast({ variant: 'success', title: 'Convocation enregistrée' });
          setOpen(false);
        },
        onError: (err) => toast({ variant: 'destructive', description: getClubErrorMessage(err) }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Gérer la convocation</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gérer la convocation</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {isError ? (
            <QueryError onRetry={() => refetch()} />
          ) : !roster ? (
            <Loader>Chargement…</Loader>
          ) : (
            <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
              {roster.map((entry) => {
                const inputId = `convocation-${eventId}-${entry.teamPlayerId}`;
                return (
                  <div key={entry.teamPlayerId} className="flex items-center gap-2.5">
                    <Checkbox
                      id={inputId}
                      checked={selected.has(entry.teamPlayerId)}
                      onCheckedChange={() => toggle(entry.teamPlayerId)}
                    />
                    <Label htmlFor={inputId} className="flex flex-col">
                      <span className="text-sm font-medium text-charcoal">
                        {entry.firstName} {entry.lastName}
                      </span>
                      <span className="text-xs text-muted">{teamMemberRoleLabel(entry.role)}</span>
                    </Label>
                  </div>
                );
              })}
            </div>
          )}
          <Button onClick={handleSubmit} disabled={!roster} loading={isPending}>
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
