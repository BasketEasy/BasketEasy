import { GUEST_RSVP_CLOSED_CODE } from '@basketeasy/types/guest-links';
import { ApiError } from '../api/client';

export function getGuestErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === GUEST_RSVP_CLOSED_CODE) {
      return 'Les réponses sont closes pour cet événement.';
    }
    if (err.status === 429) {
      return 'Trop de réponses en peu de temps. Réessayez dans quelques minutes.';
    }
    if (err.status === 404) {
      return "Ce lien n'est plus actif. Demandez le nouveau lien à votre coach.";
    }
  }
  return 'Une erreur est survenue. Merci de réessayer.';
}
