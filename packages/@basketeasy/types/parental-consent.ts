// Parental consent for a minor on a club roster.
//
// The "easiest possible" version, per
// docs/superpowers/specs/2026-09-06-data-retention-policy-design.md: a club
// staff member attests that the written authorisation was obtained, at the
// moment the player is added. It is not an e-signature, and there is no
// parent-facing flow — those are a follow-up spec, not this one.

/** Legal majority in France; the age at which no consent record is required. */
export const MINOR_AGE_YEARS = 18;

export interface ParentalConsent {
  id: string;
  /** Null once the player it documented has been deleted — the record outlives them. */
  playerId: string | null;
  clubId: string;
  /** Identity snapshot taken at consent time, kept even after playerId goes null. */
  playerFirstName: string;
  playerLastName: string;
  playerBirthDate: string;
  attestedByName: string;
  attestedByUserId: string | null;
  consentGivenAt: string;
  /**
   * When this record is deleted by the retention sweep: five years after the
   * player or the account it belonged to was removed. Null while both are
   * still live — the clock only starts once there is a deletion to count from.
   */
  retentionExpiresAt: string | null;
}

export interface RecordParentalConsentRequest {
  /**
   * Who attests the written authorisation was obtained. Free text rather than
   * just the calling admin's id: the person typing is usually, but not always,
   * the person who collected the form.
   */
  attestedByName: string;
}

/**
 * `ApiError.code` on the 400 returned when a player young enough to need one
 * is created without a consent block, so the frontend can point at the
 * consent field instead of showing a generic failure.
 */
export const PARENTAL_CONSENT_REQUIRED_CODE = 'PARENTAL_CONSENT_REQUIRED';

/**
 * Whether a birth date makes someone a minor, as of `on`.
 *
 * Shared by the create form (which decides whether to show the consent block)
 * and the API (which decides whether to require it), so the two can't disagree
 * about who needs one. Derived every time rather than stored: a flag written
 * at creation is wrong the day after the player's eighteenth birthday.
 */
export function isMinorBirthDate(
  birthDate: string | null | undefined,
  on: Date = new Date(),
): boolean {
  if (!birthDate) {
    return false;
  }
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) {
    return false;
  }
  const eighteenth = new Date(born);
  eighteenth.setUTCFullYear(eighteenth.getUTCFullYear() + MINOR_AGE_YEARS);
  return on < eighteenth;
}
