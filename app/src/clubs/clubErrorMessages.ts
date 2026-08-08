import { ApiError } from '../api/client';

const GENERIC_ERROR = 'Une erreur est survenue. Merci de réessayer.';

export function getClubErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
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
