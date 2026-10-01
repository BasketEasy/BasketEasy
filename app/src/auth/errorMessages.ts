// Maps API errors to French, user-facing copy. The backend's error messages
// (auth.service.ts: 'Invalid credentials', 'Email already in use', etc.) are
// English identifiers, not product copy — per CLAUDE.md's French-first
// convention, they must not be shown to users directly. Keyed on HTTP status
// rather than message text so it doesn't silently break if the backend's
// wording changes.
import { ApiError, IMPERSONATION_READ_ONLY_MESSAGE, isImpersonationReadOnly } from '../api/client';

const GENERIC_ERROR = 'Une erreur est survenue. Merci de réessayer.';

export function getAuthErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        return 'Certaines informations saisies sont invalides.';
      case 401:
        return 'Adresse e-mail ou mot de passe incorrect.';
      case 409:
        return 'Cette adresse e-mail est déjà utilisée.';
      default:
        return GENERIC_ERROR;
    }
  }
  return GENERIC_ERROR;
}

/**
 * The verification/reset flows, whose 400 means something specific: the link
 * itself is spent or expired, not that a field was mistyped. Telling a
 * visitor "certaines informations sont invalides" when they clicked a
 * day-old e-mail link sends them looking for a typo that isn't there, so
 * these get their own map rather than an override on the one above.
 */
export function getAccountSecurityErrorMessage(err: unknown): string {
  // A write refused during a back-office impersonation, whatever the route.
  if (isImpersonationReadOnly(err)) return IMPERSONATION_READ_ONLY_MESSAGE;
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        return 'Ce lien est invalide ou a expiré. Demandez-en un nouveau.';
      case 429:
        return 'Trop de demandes. Merci de patienter quelques minutes.';
      default:
        return GENERIC_ERROR;
    }
  }
  return GENERIC_ERROR;
}
