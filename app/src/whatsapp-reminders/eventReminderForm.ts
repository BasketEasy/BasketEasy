import { z } from 'zod';
import type { TeamEvent } from '@basketeasy/types/events';
import type {
  WhatsAppReminderChoice,
  WhatsAppReminderFormValues,
} from './EventWhatsAppReminderFields';
import { minutesToParts, offsetError, partsToMinutes } from './reminderOffset';

export const WHATSAPP_REMINDER_DEFAULTS: WhatsAppReminderFormValues = {
  waReminder: 'INHERIT',
  waOffsetValue: '',
  waOffsetUnit: 'days',
};

/** The three reminder fields, to spread into an event form's zod object. */
export const reminderFormShape = {
  waReminder: z.enum(['INHERIT', 'ON', 'OFF']),
  waOffsetValue: z.string(),
  waOffsetUnit: z.enum(['hours', 'days']),
};

/** Adds the offset's range error to the field, the way every other field reports its own. */
export function refineReminderOffset(values: WhatsAppReminderFormValues, ctx: z.RefinementCtx) {
  if (values.waReminder === 'OFF') return;
  const message = offsetError(values.waOffsetValue, values.waOffsetUnit);
  if (message) ctx.addIssue({ code: 'custom', message, path: ['waOffsetValue'] });
}

const OVERRIDE_BY_CHOICE: Record<WhatsAppReminderChoice, boolean | null> = {
  INHERIT: null,
  ON: true,
  OFF: false,
};

/** What the request carries: `null` means « inherit the team », never « leave it ». */
export function toReminderRequestFields(values: WhatsAppReminderFormValues): {
  waReminderOverride: boolean | null;
  waOffsetMinutes: number | null;
} {
  return {
    waReminderOverride: OVERRIDE_BY_CHOICE[values.waReminder],
    waOffsetMinutes:
      values.waReminder === 'OFF'
        ? null
        : partsToMinutes(values.waOffsetValue, values.waOffsetUnit),
  };
}

/** The edit form's starting point. A non-manager's event has no settings: it inherits. */
export function reminderDefaultsFor(event: TeamEvent): WhatsAppReminderFormValues {
  const settings = event.whatsAppSettings;
  const parts = settings?.offsetMinutes != null ? minutesToParts(settings.offsetMinutes) : null;
  return {
    waReminder:
      settings?.override === true ? 'ON' : settings?.override === false ? 'OFF' : 'INHERIT',
    waOffsetValue: parts?.value ?? '',
    waOffsetUnit: parts?.unit ?? 'days',
  };
}
