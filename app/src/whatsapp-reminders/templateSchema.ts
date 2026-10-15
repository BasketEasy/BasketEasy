import { z } from 'zod';
import {
  WHATSAPP_TEMPLATE_ERROR_MESSAGES,
  validateTemplate,
  type EventShareType,
} from '@basketeasy/types/whatsapp-reminder';
import { offsetError } from './reminderOffset';

// An empty template is « the default », which the server stores as null. A
// cancellation is the one template whose link is optional (validateTemplate).
const template = (type: EventShareType) =>
  z.string().superRefine((value, ctx) => {
    if (value.trim() === '') return;
    const result = validateTemplate(value, type);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: WHATSAPP_TEMPLATE_ERROR_MESSAGES[result.code] });
    }
  });

export const templateSchema = z
  .object({
    reminderTemplate: template('REMINDER'),
    updateTemplate: template('UPDATE'),
    cancellationTemplate: template('CANCELLATION'),
    reminderEnabled: z.boolean(),
    offsetValue: z.string().min(1, 'Durée requise'),
    offsetUnit: z.enum(['hours', 'days']),
  })
  .superRefine((values, ctx) => {
    const message = offsetError(values.offsetValue, values.offsetUnit);
    if (message) ctx.addIssue({ code: 'custom', message, path: ['offsetValue'] });
  });

export type TemplateFormValues = z.infer<typeof templateSchema>;
