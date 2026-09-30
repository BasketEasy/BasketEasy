import { z } from 'zod';
import {
  WHATSAPP_TEMPLATE_ERROR_MESSAGES,
  validateTemplate,
} from '@basketeasy/types/whatsapp-reminder';

// An empty template is « the default », which the server stores as null.
export const templateSchema = z.object({
  reminderTemplate: z.string().superRefine((value, ctx) => {
    if (value.trim() === '') return;
    const result = validateTemplate(value);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: WHATSAPP_TEMPLATE_ERROR_MESSAGES[result.code] });
    }
  }),
});

export type TemplateFormValues = z.infer<typeof templateSchema>;
