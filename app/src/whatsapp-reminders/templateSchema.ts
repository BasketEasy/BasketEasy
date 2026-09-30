import { z } from 'zod';
import {
  WHATSAPP_TEMPLATE_ERROR_MESSAGES,
  validateTemplate,
} from '@basketeasy/types/whatsapp-reminder';
import { offsetError } from './reminderOffset';

// An empty template is « the default », which the server stores as null.
export const templateSchema = z
  .object({
    reminderTemplate: z.string().superRefine((value, ctx) => {
      if (value.trim() === '') return;
      const result = validateTemplate(value);
      if (!result.ok) {
        ctx.addIssue({ code: 'custom', message: WHATSAPP_TEMPLATE_ERROR_MESSAGES[result.code] });
      }
    }),
    reminderEnabled: z.boolean(),
    offsetValue: z.string().min(1, 'Durée requise'),
    offsetUnit: z.enum(['hours', 'days']),
  })
  .superRefine((values, ctx) => {
    const message = offsetError(values.offsetValue, values.offsetUnit);
    if (message) ctx.addIssue({ code: 'custom', message, path: ['offsetValue'] });
  });

export type TemplateFormValues = z.infer<typeof templateSchema>;
