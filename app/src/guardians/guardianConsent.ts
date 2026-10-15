/** The attestation a parent ticks while accepting an invite for a minor. */
export function guardianConsentLabel(childFirstName: string): string {
  return `J’autorise ${childFirstName} à participer aux activités du club et je confirme être son représentant légal.`;
}

export const GUARDIAN_CONSENT_REQUIRED_MESSAGE =
  'Cochez la case pour donner votre autorisation parentale.';
