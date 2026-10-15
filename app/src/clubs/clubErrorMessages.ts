import { JERSEY_DUTY_ERROR_CODES } from '@basketeasy/types/jersey-duty';
import { ApiError, IMPERSONATION_READ_ONLY_MESSAGE, isImpersonationReadOnly } from '../api/client';

const GENERIC_ERROR = 'Une erreur est survenue. Merci de réessayer.';

// A refusal the jersey wash routes name with a machine code: worded for the
// reader, whatever the status it travels on.
const JERSEY_DUTY_CODE_MESSAGES: Record<string, string> = {
  [JERSEY_DUTY_ERROR_CODES.LOCKED]:
    'Le match a commencé : seul un·e responsable peut encore changer le lavage.',
  [JERSEY_DUTY_ERROR_CODES.ROTATION_DISABLED]:
    'Le lavage des maillots n’est pas activé pour cette équipe.',
};

/**
 * `overrides` lets a caller replace the message for a specific HTTP status
 * without touching the shared default table below — e.g. the 409 default
 * ("Cette personne est déjà membre du club") is worded for club-membership
 * forms and would read as nonsensical on an unrelated route that happens to
 * 409 for a different reason.
 */
export function getClubErrorMessage(
  err: unknown,
  overrides?: Partial<Record<number, string>>,
): string {
  // A write refused during a back-office impersonation, whatever the route.
  if (isImpersonationReadOnly(err)) return IMPERSONATION_READ_ONLY_MESSAGE;
  if (err instanceof ApiError) {
    const codeMessage = err.code ? JERSEY_DUTY_CODE_MESSAGES[err.code] : undefined;
    if (codeMessage) return codeMessage;
    if (overrides?.[err.status]) {
      return overrides[err.status] as string;
    }
    switch (err.status) {
      case 400:
        return 'Certaines informations saisies sont invalides.';
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return 'Ressource introuvable.';
      case 409:
        return 'Cette personne est déjà membre du club.';
      default:
        return GENERIC_ERROR;
    }
  }
  return GENERIC_ERROR;
}
