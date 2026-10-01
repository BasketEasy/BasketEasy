import { Controller, useForm } from 'react-hook-form';
import { SelectField } from '@basketeasy/ui/select-field';
import { NOBODY } from './assignOptions';
import { useJerseyDutyAssign } from './useJerseyDutyMutations';

interface AssignFormValues {
  teamPlayerId: string;
}

/**
 * « Assigner quelqu'un d'autre »: one inline field that submits on change.
 * Single field, reversible, so no dialog (CLAUDE.md « Modals vs. inline »).
 */
export function JerseyAssignField({
  clubId,
  teamId,
  eventId,
  label,
  options,
}: {
  clubId: string;
  teamId: string;
  eventId: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  const { mutateAsync: assign, isPending } = useJerseyDutyAssign(clubId, teamId, eventId);
  const { control, reset } = useForm<AssignFormValues>({ defaultValues: { teamPlayerId: '' } });

  return (
    <Controller
      control={control}
      name="teamPlayerId"
      render={({ field }) => (
        <SelectField
          label={label}
          placeholder="Choisir dans l’effectif"
          options={options}
          value={field.value}
          disabled={isPending}
          onValueChange={(value) => {
            field.onChange(value);
            assign({ teamPlayerId: value === NOBODY ? null : value })
              .catch(() => undefined)
              .finally(() => reset({ teamPlayerId: '' }));
          }}
        />
      )}
    />
  );
}
