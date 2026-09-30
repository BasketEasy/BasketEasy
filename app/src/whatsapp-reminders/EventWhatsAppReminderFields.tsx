import { Controller, type Control } from 'react-hook-form';
import { FormField } from '@basketeasy/ui/form-field';
import { SelectField } from '@basketeasy/ui/select-field';
import { Text } from '@basketeasy/ui/text';
import { describeOffset, OFFSET_UNIT_OPTIONS, type OffsetUnit } from './reminderOffset';
import { useTeamWhatsAppSettings } from './useTeamWhatsAppSettings';

export type WhatsAppReminderChoice = 'INHERIT' | 'ON' | 'OFF';

/** The three form fields any event form carries for its reminder. */
export interface WhatsAppReminderFormValues {
  waReminder: WhatsAppReminderChoice;
  waOffsetValue: string;
  waOffsetUnit: OffsetUnit;
}

/** « Rappel WhatsApp » — inherit / on / off, and how long before when it is not off. */
export function EventWhatsAppReminderFields<T extends WhatsAppReminderFormValues>({
  clubId,
  teamId,
  control,
  idPrefix,
  offsetError,
  watchedChoice,
}: {
  clubId: string;
  teamId: string;
  control: Control<T>;
  idPrefix: string;
  offsetError?: string;
  watchedChoice: WhatsAppReminderChoice;
}) {
  // The one place a form's generic value type meets this component's own three fields.
  const fields = control as unknown as Control<WhatsAppReminderFormValues>;
  const { data: team } = useTeamWhatsAppSettings(clubId, teamId);
  const teamOffset = team ? describeOffset(team.defaultOffsetMinutes) : null;
  const inheritLabel = team
    ? `Comme l'équipe (${team.reminderEnabled ? `activé, ${teamOffset}` : 'désactivé'})`
    : "Comme l'équipe";

  return (
    <div className="flex flex-col gap-2">
      <Controller
        control={fields}
        name="waReminder"
        render={({ field }) => (
          <SelectField
            label="Rappel WhatsApp"
            id={`${idPrefix}-wa-reminder`}
            options={[
              { value: 'INHERIT', label: inheritLabel },
              { value: 'ON', label: 'Activé' },
              { value: 'OFF', label: 'Désactivé' },
            ]}
            value={field.value}
            onValueChange={(value) => field.onChange(value as WhatsAppReminderChoice)}
          />
        )}
      />
      {watchedChoice !== 'OFF' && (
        <div className="flex flex-wrap items-start gap-2">
          <Controller
            control={fields}
            name="waOffsetValue"
            render={({ field }) => (
              <FormField
                label="Me rappeler"
                id={`${idPrefix}-wa-offset`}
                inputMode="decimal"
                placeholder={teamOffset ? `${teamOffset} (par défaut)` : 'par défaut'}
                error={offsetError}
                containerClassName="min-w-0 flex-1"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
          <Controller
            control={fields}
            name="waOffsetUnit"
            render={({ field }) => (
              <SelectField
                label="Unité de durée"
                hideLabel
                id={`${idPrefix}-wa-offset-unit`}
                options={OFFSET_UNIT_OPTIONS}
                value={field.value}
                onValueChange={(value) => field.onChange(value as OffsetUnit)}
              />
            )}
          />
        </div>
      )}
      <Text variant="meta" size="xs">
        Les gestionnaires de l’équipe reçoivent une notification pour partager le message dans le
        groupe WhatsApp. Le lien de réponse est activé au besoin.
      </Text>
    </div>
  );
}
