import { useEffect, useRef, useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Checkbox } from '@basketeasy/ui/checkbox';
import { Label } from '@basketeasy/ui/label';
import { Loader } from '@basketeasy/ui/loader';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@basketeasy/ui/dialog';
import { QueryError } from '@basketeasy/ui/query-error';
import { toast } from '@basketeasy/ui/toast-store';
import type { EventConvocationRosterEntry } from '@basketeasy/types/events';
import { teamMemberRoleLabel } from './teamLabels';
import { useEventConvocations } from './useEventConvocations';
import { useEventConvocationsSet } from './useEventConvocationsSet';
import { getClubErrorMessage } from './clubErrorMessages';
import { Text } from '@basketeasy/ui/text';

function convokedIdsOf(roster: EventConvocationRosterEntry[]): Set<string> {
  return new Set(roster.filter((r) => r.convoked).map((r) => r.teamPlayerId));
}

function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

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
  const [staleWarning, setStaleWarning] = useState(false);
  const { data: roster, isError, refetch } = useEventConvocations(clubId, teamId, eventId, open);
  const { mutate: setConvocations, isPending } = useEventConvocationsSet(clubId, teamId);
  // Seeds the checked set once per dialog open, not on every background
  // refetch of the roster query (e.g. window refocus) — otherwise an
  // in-progress, unsaved toggle would silently get overwritten mid-edit.
  const hasSeededRef = useRef(false);
  // The convoked set as it stood on the server when this dialog opened —
  // kept separately from `selected` (the manager's in-progress edits) so a
  // submit can detect whether the server side moved since then (see
  // handleSubmit below).
  const seededSnapshotRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!open) {
      hasSeededRef.current = false;
      seededSnapshotRef.current = null;
      setStaleWarning(false);
      return;
    }
    if (roster && !hasSeededRef.current) {
      const convokedIds = convokedIdsOf(roster);
      setSelected(convokedIds);
      seededSnapshotRef.current = convokedIds;
      hasSeededRef.current = true;
    }
  }, [open, roster]);

  const toggle = (teamPlayerId: string) => {
    setStaleWarning(false);
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

  const selectAll = () => {
    if (!roster) {
      return;
    }
    setStaleWarning(false);
    setSelected(new Set(roster.map((r) => r.teamPlayerId)));
  };

  const selectNone = () => {
    setStaleWarning(false);
    setSelected(new Set());
  };

  const submit = () => {
    setStaleWarning(false);
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

  const handleSubmit = () => {
    // The roster query keeps refetching in the background while the dialog
    // is open, but its result is deliberately never used to re-seed
    // `selected` (see hasSeededRef above) — so `roster` here is the latest
    // known server state, independent of this manager's in-progress edits.
    // Comparing it against the snapshot taken at open time tells us whether
    // someone else changed the call-up list since — a blind full-replace
    // submit would otherwise silently discard that change.
    if (
      roster &&
      seededSnapshotRef.current &&
      !areSetsEqual(convokedIdsOf(roster), seededSnapshotRef.current)
    ) {
      setStaleWarning(true);
      return;
    }
    submit();
  };

  const selectedCount = selected.size;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Gérer la convocation</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gérer la convocation</DialogTitle>
          <DialogDescription>
            Sélectionnez les joueurs convoqués pour cet événement. Indépendant des réponses de
            présence de chacun.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {staleWarning && (
            <div className="flex flex-col gap-2 rounded-md border border-error/40 bg-error/5 p-3">
              <Text variant="body" size="sm" tone="danger">
                La liste a changé depuis l&apos;ouverture de cette fenêtre.
              </Text>
              <Button variant="outline" className="w-fit" onClick={submit} disabled={isPending}>
                Enregistrer quand même
              </Button>
            </div>
          )}
          {isError ? (
            <QueryError onRetry={() => refetch()} />
          ) : !roster ? (
            <Loader>Chargement…</Loader>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={selectAll} disabled={isPending}>
                    Tout sélectionner
                  </Button>
                  <Button variant="ghost" onClick={selectNone} disabled={isPending}>
                    Tout désélectionner
                  </Button>
                </div>
                <Text as="span" variant="meta" className="whitespace-nowrap">
                  {selectedCount}/{roster.length} sélectionné{selectedCount > 1 ? 's' : ''}
                </Text>
              </div>
              <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                {roster.map((entry) => {
                  const inputId = `convocation-${eventId}-${entry.teamPlayerId}`;
                  return (
                    <Label
                      key={entry.teamPlayerId}
                      htmlFor={inputId}
                      className="flex min-h-11 items-center gap-2.5 rounded-md px-1 hover:bg-sunk"
                    >
                      <Checkbox
                        id={inputId}
                        checked={selected.has(entry.teamPlayerId)}
                        onCheckedChange={() => toggle(entry.teamPlayerId)}
                      />
                      <span className="flex flex-col">
                        <Text as="span" variant="label" size="sm" className="font-medium">
                          {entry.firstName} {entry.lastName}
                        </Text>
                        <Text as="span" variant="meta" size="xs">
                          {teamMemberRoleLabel(entry.role)}
                        </Text>
                      </span>
                    </Label>
                  );
                })}
              </div>
            </>
          )}
          <Button onClick={handleSubmit} disabled={!roster} loading={isPending}>
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
