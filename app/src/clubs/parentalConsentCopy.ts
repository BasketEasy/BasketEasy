import type { User } from '@basketeasy/types/auth';

/**
 * The attestation itself, shared by the create form and the record-later
 * dialog so the two never end up claiming subtly different things — this is
 * the sentence the club is on the hook for.
 *
 * It names *who signs* ("le représentant légal"), because an admin reading
 * "l'autorisation parentale écrite" alone has no way to tell whether they are
 * confirming a document exists or being asked to produce one here.
 */
export const CONSENT_ATTESTATION_LABEL =
  'J’atteste détenir l’autorisation parentale signée par le représentant légal de ce joueur.';

/**
 * What the document actually is, and what this screen does with it.
 *
 * Three questions an admin asks in front of this control, answered in order:
 * *which* form (their own — the licence file's, or any signed note), where it
 * lives (with the club), and what Kluvo stores (the attestation, not the
 * paper). The first version said only "le formulaire signé reste conservé par
 * le club", which implied a Kluvo form that does not exist.
 */
export const CONSENT_EXPLAINER =
  'Il n’y a pas de formulaire à remplir ici. Le club doit détenir une autorisation écrite ' +
  'signée par le représentant légal — celle du dossier de licence FFBB, ou tout écrit signé ' +
  'autorisant la pratique du basket. Ce document reste conservé par le club : Kluvo n’en ' +
  'garde que la trace (qui atteste le détenir, et à quelle date).';

/** Disambiguates the attester field: the club's side of the paper, not the parent's. */
export const CONSENT_ATTESTER_HINT =
  'La personne du club qui confirme détenir l’autorisation — vous, par défaut. Ce n’est pas le nom du parent.';

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
