import { ApiError } from '../api/client';

const GENERIC_ERROR = 'Une erreur est survenue. Merci de réessayer.';

export function getAccountErrorMessage(err: unknown): string {
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
