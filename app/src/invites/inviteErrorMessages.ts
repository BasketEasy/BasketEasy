import { INVITE_ALREADY_ACCEPTED_CODE } from '@basketeasy/types/player-invites';
import { ApiError } from '../api/client';

const GENERIC_ERROR = 'Une erreur est survenue. Merci de réessayer.';

/**
 * True for the one invite error case that gets its own message + a link to
 * /login rather than the generic invalid/expired copy — see
 * INVITE_ALREADY_ACCEPTED_CODE for why only this case is distinguished.
 */
export function isInviteAlreadyAccepted(err: unknown): boolean {
  return err instanceof ApiError && err.code === INVITE_ALREADY_ACCEPTED_CODE;
}

export function getInviteErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        return 'Certaines informations saisies sont invalides.';
      case 404:
        return "Cette invitation n'est plus valide ou a expiré.";
      case 409:
        return 'Cette adresse e-mail est déjà utilisée, ou ce joueur est déjà lié à un compte.';
      default:
        return GENERIC_ERROR;
    }
  }
  return GENERIC_ERROR;
}
