import { GUARDIAN_INVITE_REFUSED_CODE } from '@basketeasy/types/guardians';
import { PARENTAL_CONSENT_REQUIRED_CODE } from '@basketeasy/types/parental-consent';
import { ApiError } from '../api/client';
import { isInviteAlreadyAccepted } from '../invites/inviteErrorMessages';

const GENERIC_ERROR = 'Une erreur est survenue. Merci de réessayer.';

/** The one refusal that belongs on the consent checkbox rather than the form. */
export function isConsentRequired(err: unknown): boolean {
  return err instanceof ApiError && err.code === PARENTAL_CONSENT_REQUIRED_CODE;
}

export function getGuardianInviteErrorMessage(err: unknown): string {
  if (isInviteAlreadyAccepted(err)) {
    return 'Ce lien a déjà été utilisé par un autre compte.';
  }
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        // The service's own refusals (already 4 parents, following oneself)
        // are finished French sentences and say so with a code; any other
        // 400 is class-validator's English, never shown to a parent.
        return err.code === GUARDIAN_INVITE_REFUSED_CODE
          ? err.message
          : 'Certaines informations saisies sont invalides.';
      case 404:
        return "Ce lien n'est plus valide ou a expiré.";
      case 409:
        return 'Cette adresse e-mail est déjà utilisée : connectez-vous avec « J’ai déjà un compte ».';
      default:
        return GENERIC_ERROR;
    }
  }
  return GENERIC_ERROR;
}
