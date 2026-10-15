import { z } from 'zod';
import {
  ADMIN_REASON_MAX_LENGTH,
  ADMIN_REASON_MIN_LENGTH,
} from '@basketeasy/types/platform-admin-actions';
import type { AdminActionResult } from '@basketeasy/types/platform-admin-actions';
import { toast } from '@basketeasy/ui/toast-store';
import { ApiError } from '../../api/client';
import { SUPPORT_ACTION_LABELS } from '../shared/adminFormat';

// Shared by every support-action form: the same bounds as the server's
// ReasonDto, so a reason the form accepts is never refused for its length.
export const reasonSchema = z
  .string()
  .trim()
  .min(ADMIN_REASON_MIN_LENGTH, `Motif requis (${ADMIN_REASON_MIN_LENGTH} caractères minimum)`)
  .max(ADMIN_REASON_MAX_LENGTH, `Motif trop long (${ADMIN_REASON_MAX_LENGTH} caractères maximum)`);

/**
 * A refusal from the actions API is already a French sentence naming the
 * rule (« C’est le dernier admin du club… »), so a 4xx is shown as sent.
 * Anything else is an outage, and says that nothing was changed.
 */
export function adminActionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return error.message;
  }
  return 'L’action a échoué. Rien n’a été modifié.';
}

/** Toasts the outcome of a completed action; the dialog is gone by then. */
export function toastActionDone(result: AdminActionResult) {
  toast({
    variant: 'success',
    title: SUPPORT_ACTION_LABELS[result.action],
    description: 'L’action est enregistrée dans le journal d’audit.',
  });
}
