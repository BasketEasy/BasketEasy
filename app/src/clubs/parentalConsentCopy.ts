import type { User } from '@basketeasy/types/auth';

/**
 * The attestation itself, shared by the create form and the record-later
 * dialog so the two never end up claiming subtly different things — this is
 * the sentence the club is on the hook for.
 *
 * It names *who signs*, because "l'autorisation parentale" alone leaves an
 * admin unsure whether they are confirming a document exists or being asked
 * to produce one here.
 */
export const CONSENT_ATTESTATION_LABEL =
  'J’atteste détenir l’autorisation signée du représentant légal.';

/**
 * Which document, and where it lives. Two facts, because those are the two
 * that change what the reader does; everything else the checkbox below
 * already says. An earlier draft spelled all of it out and ran to four lines
 * of prose above a single tick box.
 */
export const CONSENT_EXPLAINER =
  'Le club conserve l’autorisation signée du représentant légal (dossier de licence FFBB ou ' +
  'écrit libre). Rien à téléverser ici.';

/** Disambiguates the attester field: the club's side of the paper, not the parent's. */
export const CONSENT_ATTESTER_HINT = 'Vous, ou un autre responsable du club. Pas le parent.';

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
