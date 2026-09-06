import type { User } from '@basketeasy/types/auth';

/**
 * The attestation itself, shared by the create form and the record-later
 * dialog so the two never end up claiming subtly different things — this is
 * the sentence the club is on the hook for.
 */
export const CONSENT_ATTESTATION_LABEL =
  'J’atteste avoir recueilli l’autorisation parentale écrite pour ce joueur mineur.';

/**
 * Prefill for "who attests": the signed-in admin, since they are usually but
 * not always the person who collected the paper form — hence a free-text
 * field rather than just their user id.
 */
export function defaultAttesterName(user: Pick<User, 'firstName' | 'lastName'> | null): string {
  if (!user) {
    return '';
  }
  return [user.firstName, user.lastName].filter(Boolean).join(' ');
}
