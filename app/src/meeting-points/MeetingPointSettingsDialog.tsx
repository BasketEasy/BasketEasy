import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Checkbox } from '@basketeasy/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@basketeasy/ui/dialog';
import { FormField } from '@basketeasy/ui/form-field';
import { Label } from '@basketeasy/ui/label';
import {
  MAX_ARRIVAL_BUFFER_MINUTES,
  MEETING_POINT_ADDRESS_MAX_LENGTH,
  MEETING_POINT_NAME_MAX_LENGTH,
  type MeetingPoint,
} from '@basketeasy/types/meeting-points';
import { formatMeetingPoint } from './meetingPointLabels';

export interface MeetingPointSettingsValue {
  meetingPoint: MeetingPoint | null;
  /** Null only for a team inheriting the club's buffer. */
  arrivalBufferMinutes: number | null;
}

/** What a team inherits — present only when editing a team's settings. */
export interface InheritedMeetingSettings {
  meetingPoint: MeetingPoint | null;
  arrivalBufferMinutes: number;
}

const HALF_FILLED_ERROR = 'Renseignez le nom et l’adresse';
const BUFFER_ERROR = `Entre 0 et ${MAX_ARRIVAL_BUFFER_MINUTES} minutes`;

/**
 * The edit form behind both the club's and a team's meeting-point settings —
 * one component, with `inherited` switching on the team-only "use the club's"
 * checkboxes. A Dialog per CLAUDE.md: a focused, infrequent edit of a
 * multi-field record.
 *
 * Name and address travel together: both empty means "no meeting point",
 * exactly one filled is a validation error rather than a silent null.
 */
export function MeetingPointSettingsDialog({
  open,
  onOpenChange,
  title,
  value,
  inherited,
  isSaving,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: MeetingPointSettingsValue;
  inherited?: InheritedMeetingSettings;
  isSaving: boolean;
  /** A server error from the last submit, shown inside the still-open dialog. */
  error: string | null;
  onSubmit: (value: MeetingPointSettingsValue) => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [buffer, setBuffer] = useState('');
  const [inheritPlace, setInheritPlace] = useState(false);
  const [inheritBuffer, setInheritBuffer] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [bufferError, setBufferError] = useState<string | null>(null);

  // Re-sync every time the dialog opens, so a cancelled edit never leaks
  // into the next one — same pattern as TeamEditModal.
  useEffect(() => {
    if (!open) return;
    setName(value.meetingPoint?.name ?? '');
    setAddress(value.meetingPoint?.address ?? '');
    setBuffer(String(value.arrivalBufferMinutes ?? inherited?.arrivalBufferMinutes ?? 45));
    setInheritPlace(Boolean(inherited) && value.meetingPoint === null);
    setInheritBuffer(Boolean(inherited) && value.arrivalBufferMinutes === null);
    setPlaceError(null);
    setBufferError(null);
  }, [open, value, inherited]);

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    const minutes = Number(buffer);
    let valid = true;

    if (!inheritPlace && Boolean(trimmedName) !== Boolean(trimmedAddress)) {
      setPlaceError(HALF_FILLED_ERROR);
      valid = false;
    } else {
      setPlaceError(null);
    }
    if (
      !inheritBuffer &&
      (buffer.trim() === '' ||
        !Number.isInteger(minutes) ||
        minutes < 0 ||
        minutes > MAX_ARRIVAL_BUFFER_MINUTES)
    ) {
      setBufferError(BUFFER_ERROR);
      valid = false;
    } else {
      setBufferError(null);
    }
    if (!valid) return;

    onSubmit({
      meetingPoint:
        inheritPlace || !trimmedName ? null : { name: trimmedName, address: trimmedAddress },
      arrivalBufferMinutes: inheritBuffer ? null : minutes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Le rendez-vous d’avant-match est calculé à partir de ce lieu, du délai d’arrivée et du
            temps de trajet jusqu’à la salle.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {inherited && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="meeting-inherit-place"
                checked={inheritPlace}
                onCheckedChange={(checked) => setInheritPlace(checked === true)}
              />
              <Label htmlFor="meeting-inherit-place">
                Utiliser le point de rendez-vous du club
                {inherited.meetingPoint
                  ? ` (${formatMeetingPoint(inherited.meetingPoint)})`
                  : ' (aucun défini)'}
              </Label>
            </div>
          )}
          {!inheritPlace && (
            <>
              <FormField
                label="Nom du lieu"
                id="meeting-point-name"
                placeholder="Parking salle Coubertin"
                maxLength={MEETING_POINT_NAME_MAX_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={placeError && !name.trim() ? placeError : undefined}
              />
              <FormField
                label="Adresse"
                id="meeting-point-address"
                placeholder="12 rue de la Salle, 44000 Nantes"
                hint="L’adresse sert à calculer le temps de trajet vers chaque match."
                maxLength={MEETING_POINT_ADDRESS_MAX_LENGTH}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                error={placeError && !address.trim() ? placeError : undefined}
              />
            </>
          )}

          {inherited && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="meeting-inherit-buffer"
                checked={inheritBuffer}
                onCheckedChange={(checked) => setInheritBuffer(checked === true)}
              />
              <Label htmlFor="meeting-inherit-buffer">
                Utiliser le délai du club ({inherited.arrivalBufferMinutes} min)
              </Label>
            </div>
          )}
          {!inheritBuffer && (
            <FormField
              label="Arrivée avant le match (minutes)"
              id="meeting-arrival-buffer"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_ARRIVAL_BUFFER_MINUTES}
              hint="Les joueurs qui viennent directement arrivent à cette heure-là."
              value={buffer}
              onChange={(e) => setBuffer(e.target.value)}
              error={bufferError ?? undefined}
            />
          )}

          <Button loading={isSaving} onClick={handleSubmit}>
            Enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
