import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { RadioCardGroup } from '@basketeasy/ui/radio-card-group';
import { Text } from '@basketeasy/ui/text';
import {
  DEFAULT_ARRIVAL_BUFFER_MINUTES,
  MAX_ARRIVAL_BUFFER_MINUTES,
  MEETING_POINT_ADDRESS_MAX_LENGTH,
  MEETING_POINT_NAME_MAX_LENGTH,
  type MeetingPoint,
} from '@basketeasy/types/meeting-points';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { meetingPointFields, refineMeetingPointPair, toMeetingPoint } from './meetingPointSchema';

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

const BUFFER_ERROR = `Entre 0 et ${MAX_ARRIVAL_BUFFER_MINUTES} minutes`;

// The buffer stays a string in the form (it is an <input>) and is checked
// only when it is the team's own — an inherited value isn't the form's to
// validate. A team choosing its own place must name one; the club may leave
// both empty, which is how it says "no meeting point".
function settingsSchema(isTeam: boolean) {
  return z
    .object({
      placeSource: z.enum(['INHERIT', 'OWN']),
      bufferSource: z.enum(['INHERIT', 'OWN']),
      ...meetingPointFields,
      buffer: z.string(),
    })
    .superRefine((values, ctx) => {
      if (values.placeSource === 'OWN') {
        refineMeetingPointPair(values, ctx, { required: isTeam });
      }
      const minutes = Number(values.buffer);
      if (
        values.bufferSource === 'OWN' &&
        (values.buffer.trim() === '' ||
          !Number.isInteger(minutes) ||
          minutes < 0 ||
          minutes > MAX_ARRIVAL_BUFFER_MINUTES)
      ) {
        ctx.addIssue({ code: 'custom', path: ['buffer'], message: BUFFER_ERROR });
      }
    });
}

type SettingsFormValues = z.infer<ReturnType<typeof settingsSchema>>;

function defaultsFrom(
  value: MeetingPointSettingsValue,
  inherited: InheritedMeetingSettings | undefined,
): SettingsFormValues {
  const isTeam = Boolean(inherited);
  return {
    placeSource: isTeam && value.meetingPoint === null ? 'INHERIT' : 'OWN',
    bufferSource: isTeam && value.arrivalBufferMinutes === null ? 'INHERIT' : 'OWN',
    name: value.meetingPoint?.name ?? '',
    address: value.meetingPoint?.address ?? '',
    buffer: String(
      value.arrivalBufferMinutes ??
        inherited?.arrivalBufferMinutes ??
        DEFAULT_ARRIVAL_BUFFER_MINUTES,
    ),
  };
}

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
 * `onSubmit` resolves once saved; a rejection stays in the open dialog as a
 * root error, like the other react-hook-form dialogs.
 */
export function MeetingPointSettingsDialog({
  open,
  onOpenChange,
  title,
  value,
  inherited,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: MeetingPointSettingsValue;
  inherited?: InheritedMeetingSettings;
  onSubmit: (value: MeetingPointSettingsValue) => Promise<void>;
}) {
  const isTeam = Boolean(inherited);
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema(isTeam)),
    defaultValues: defaultsFrom(value, inherited),
  });
  const placeSource = watch('placeSource');
  const bufferSource = watch('bufferSource');

  // Re-seed every time the dialog opens, so a cancelled edit never leaks
  // into the next one — same pattern as EventEditModal.
  useEffect(() => {
    if (open) reset(defaultsFrom(value, inherited));
  }, [open, value, inherited, reset]);

  const save = async (next: MeetingPointSettingsValue) => {
    try {
      await onSubmit(next);
    } catch (err) {
      setError('root', { message: getClubErrorMessage(err) });
    }
  };

  const submit = handleSubmit((values) =>
    save({
      meetingPoint: values.placeSource === 'OWN' ? toMeetingPoint(values) : null,
      arrivalBufferMinutes: values.bufferSource === 'OWN' ? Number(values.buffer) : null,
    }),
  );

  const placeFields = (
    <>
      <FormField
        label="Nom du lieu"
        id="meeting-point-name"
        placeholder="Parking salle Coubertin"
        maxLength={MEETING_POINT_NAME_MAX_LENGTH}
        error={errors.name?.message}
        {...register('name')}
      />
      <FormField
        label="Adresse"
        id="meeting-point-address"
        placeholder="12 rue de la Salle, 44000 Nantes"
        hint="Une vraie adresse : elle sert à calculer le trajet vers chaque salle."
        maxLength={MEETING_POINT_ADDRESS_MAX_LENGTH}
        error={errors.address?.message}
        {...register('address')}
      />
    </>
  );

  const bufferField = (
    <FormField
      label={isTeam ? 'Minutes avant le match' : 'Arrivée à la salle avant le match'}
      id="meeting-arrival-buffer"
      type="number"
      inputMode="numeric"
      min={0}
      max={MAX_ARRIVAL_BUFFER_MINUTES}
      className="w-24"
      suffix="minutes"
      hint="Les joueurs qui viennent en direct arrivent à cette heure-là."
      error={errors.buffer?.message}
      {...register('buffer')}
    />
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
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 pt-2">
          {errors.root && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}

          {inherited ? (
            <>
              <div className="flex flex-col gap-2">
                <Text variant="eyebrow" id="meeting-place-source">
                  Lieu
                </Text>
                <Controller
                  control={control}
                  name="placeSource"
                  render={({ field }) => (
                    <RadioCardGroup<Source>
                      aria-labelledby="meeting-place-source"
                      tone="choice"
                      indicator
                      value={field.value}
                      onChange={field.onChange}
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
                  )}
                />
                {placeSource === 'OWN' && placeFields}
              </div>
              <div className="flex flex-col gap-2">
                <Text variant="eyebrow" id="meeting-buffer-source">
                  Arrivée avant le match
                </Text>
                <Controller
                  control={control}
                  name="bufferSource"
                  render={({ field }) => (
                    <RadioCardGroup<Source>
                      aria-labelledby="meeting-buffer-source"
                      tone="choice"
                      indicator
                      value={field.value}
                      onChange={field.onChange}
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
                  )}
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
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() =>
                  save({
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
                <Button type="button" variant="ghost">
                  Annuler
                </Button>
              </DialogClose>
              <Button type="submit" loading={isSubmitting}>
                Enregistrer
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
