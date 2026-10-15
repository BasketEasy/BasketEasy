import { ApiError, IMPERSONATION_READ_ONLY_MESSAGE, isImpersonationReadOnly } from '../api/client';

const GENERIC_ERROR = 'Une erreur est survenue. Merci de réessayer.';

export function getAccountErrorMessage(err: unknown): string {
  // A write refused during a back-office impersonation, whatever the route.
  if (isImpersonationReadOnly(err)) return IMPERSONATION_READ_ONLY_MESSAGE;
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        return 'Certaines informations saisies sont invalides.';
      case 401:
        return 'Votre session a expiré. Merci de vous reconnecter.';
      default:
        return GENERIC_ERROR;
    }
  }
  return GENERIC_ERROR;
}
