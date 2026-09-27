import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@basketeasy/ui/dialog';
import { FormField } from '@basketeasy/ui/form-field';
import { Input } from '@basketeasy/ui/input';
import { Label } from '@basketeasy/ui/label';
import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { Text } from '@basketeasy/ui/text';
import { FieldError } from '@basketeasy/ui/field-error';
import {
  DEFAULT_ARRIVAL_BUFFER_MINUTES,
  MAX_ARRIVAL_BUFFER_MINUTES,
  MEETING_POINT_ADDRESS_MAX_LENGTH,
  MEETING_POINT_NAME_MAX_LENGTH,
  type MeetingPoint,
} from '@basketeasy/types/meeting-points';

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

type Source = 'INHERIT' | 'OWN';

const HALF_FILLED_ERROR = 'Renseignez le nom et l’adresse';
const BUFFER_ERROR = `Entre 0 et ${MAX_ARRIVAL_BUFFER_MINUTES} minutes`;

function RadioLabel({ title, detail }: { title: string; detail?: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <Text as="span" variant="label" size="sm" className="font-bold">
        {title}
      </Text>
      {detail && (
        <Text as="span" variant="meta" size="xs">
          {detail}
        </Text>
      )}
    </span>
  );
}

/**
 * The edit form behind both the club's and a team's meeting-point settings.
 * One component: `inherited` switches it to the team form, where each value
 * is a choice between the club's and the team's own (radio cards), the
 * fields showing only under « propre à l'équipe ». A Dialog per CLAUDE.md —
 * a focused, infrequent edit of a multi-field record.
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
  const isTeam = Boolean(inherited);
  const [placeSource, setPlaceSource] = useState<Source>('OWN');
  const [bufferSource, setBufferSource] = useState<Source>('OWN');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [buffer, setBuffer] = useState('');
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [bufferError, setBufferError] = useState<string | null>(null);

  // Re-sync every time the dialog opens, so a cancelled edit never leaks
  // into the next one — same pattern as TeamEditModal.
  useEffect(() => {
    if (!open) return;
    setPlaceSource(isTeam && value.meetingPoint === null ? 'INHERIT' : 'OWN');
    setBufferSource(isTeam && value.arrivalBufferMinutes === null ? 'INHERIT' : 'OWN');
    setName(value.meetingPoint?.name ?? '');
    setAddress(value.meetingPoint?.address ?? '');
    setBuffer(
      String(
        value.arrivalBufferMinutes ??
          inherited?.arrivalBufferMinutes ??
          DEFAULT_ARRIVAL_BUFFER_MINUTES,
      ),
    );
    setPlaceError(null);
    setBufferError(null);
  }, [open, value, inherited, isTeam]);

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    const minutes = Number(buffer);
    const ownPlace = placeSource === 'OWN';
    const ownBuffer = bufferSource === 'OWN';
    let valid = true;

    // A team choosing its own place must name one; the club may leave both
    // empty, which is how it says "no meeting point".
    const missingPlace = isTeam ? !trimmedName || !trimmedAddress : false;
    if (ownPlace && (missingPlace || Boolean(trimmedName) !== Boolean(trimmedAddress))) {
      setPlaceError(HALF_FILLED_ERROR);
      valid = false;
    } else {
      setPlaceError(null);
    }
    if (
      ownBuffer &&
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
      meetingPoint: ownPlace && trimmedName ? { name: trimmedName, address: trimmedAddress } : null,
      arrivalBufferMinutes: ownBuffer ? minutes : null,
    });
  };

  const placeFields = (
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
        hint="Une vraie adresse : elle sert à calculer le trajet vers chaque salle."
        maxLength={MEETING_POINT_ADDRESS_MAX_LENGTH}
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        error={placeError && !address.trim() ? placeError : undefined}
      />
    </>
  );

  const bufferField = (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="meeting-arrival-buffer">
        {isTeam ? 'Minutes avant le match' : 'Arrivée à la salle avant le match'}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="meeting-arrival-buffer"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_ARRIVAL_BUFFER_MINUTES}
          className="w-24"
          aria-invalid={Boolean(bufferError)}
          aria-describedby="meeting-arrival-buffer-hint"
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
        />
        <Text as="span" variant="meta">
          minutes
        </Text>
      </div>
      <Text id="meeting-arrival-buffer-hint" variant="meta">
        Les joueurs qui viennent en direct arrivent à cette heure-là.
      </Text>
      {bufferError && <FieldError>{bufferError}</FieldError>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {!isTeam && (
            <DialogDescription>
              Le RDV d’avant-match est calculé à partir de ce lieu, du délai d’arrivée et du temps
              de trajet jusqu’à la salle.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-4 pt-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {inherited ? (
            <>
              <div className="flex flex-col gap-2">
                <Text variant="eyebrow" id="meeting-place-source">
                  Lieu
                </Text>
                <RadioCardGroup<Source>
                  aria-labelledby="meeting-place-source"
                  tone="choice"
                  indicator
                  value={placeSource}
                  onChange={setPlaceSource}
                  options={[
                    {
                      value: 'INHERIT',
                      render: () => (
                        <RadioLabel
                          title="Celui du club"
                          detail={
                            inherited.meetingPoint
                              ? `${inherited.meetingPoint.name} · ${inherited.meetingPoint.address}`
                              : 'Aucun défini par le club'
                          }
                        />
                      ),
                    },
                    {
                      value: 'OWN',
                      render: () => <RadioLabel title="Un lieu propre à l’équipe" />,
                    },
                  ]}
                />
                {placeSource === 'OWN' && placeFields}
              </div>
              <div className="flex flex-col gap-2">
                <Text variant="eyebrow" id="meeting-buffer-source">
                  Arrivée avant le match
                </Text>
                <RadioCardGroup<Source>
                  aria-labelledby="meeting-buffer-source"
                  tone="choice"
                  indicator
                  value={bufferSource}
                  onChange={setBufferSource}
                  options={[
                    {
                      value: 'INHERIT',
                      render: () => (
                        <RadioLabel
                          title="Celle du club"
                          detail={`${inherited.arrivalBufferMinutes} min`}
                        />
                      ),
                    },
                    { value: 'OWN', render: () => <RadioLabel title="Propre à l’équipe" /> },
                  ]}
                />
                {bufferSource === 'OWN' && bufferField}
              </div>
            </>
          ) : (
            <>
              {placeFields}
              {bufferField}
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {!isTeam && value.meetingPoint ? (
              <Button
                variant="ghost"
                disabled={isSaving}
                onClick={() =>
                  onSubmit({
                    meetingPoint: null,
                    arrivalBufferMinutes:
                      value.arrivalBufferMinutes ?? DEFAULT_ARRIVAL_BUFFER_MINUTES,
                  })
                }
              >
                <Text as="span" variant="label" size="sm" tone="danger">
                  Supprimer le RDV
                </Text>
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Annuler</Button>
              </DialogClose>
              <Button loading={isSaving} onClick={handleSubmit}>
                Enregistrer
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
