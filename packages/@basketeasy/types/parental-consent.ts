// Parental consent for a minor on a club roster.
//
// The "easiest possible" version, per
// docs/decisions/rgpd-and-backoffice.md: a club
// staff member attests that the written authorisation was obtained, at the
// moment the player is added. It is not an e-signature. A parent accepting a
// guardian invite for a minor records their own consent through the same
// table (source GUARDIAN_IN_APP) — see ./guardians.

import type { ParentalConsentSource } from './guardians';

/** Legal majority in France; the age at which no consent record is required. */
export const MINOR_AGE_YEARS = 18;

export interface ParentalConsent {
  id: string;
  /** Null once the player it documented has been deleted — the record outlives them. */
  playerId: string | null;
  /** Null once the club itself has been deleted — the record outlives it too. */
  clubId: string | null;
  /** Identity snapshot taken at consent time, kept even after playerId goes null. */
  playerFirstName: string;
  playerLastName: string;
  playerBirthDate: string;
  attestedByName: string;
  attestedByUserId: string | null;
  /** A staff attestation, or the parent confirming it while accepting a guardian invite. */
  source: ParentalConsentSource;
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
  const eighteenth = eighteenthBirthday(born);
  return on < eighteenth;
}

/**
 * The instant someone born on `born` turns eighteen, in UTC.
 *
 * `setUTCFullYear(y + 18)` on its own is wrong for a 29 February birth date:
 * the target year is not a leap year, and `Date` silently rolls the
 * nonexistent 29 February forward to 1 March — pushing the cutoff a day late,
 * so a club could not register such a player as an adult on what everyone
 * involved considers their birthday. French practice treats the last day of
 * February as the anniversary in a non-leap year, so the day is clamped to
 * the target month's length instead of being allowed to overflow. Year, month
 * and day are set in one call, which never passes through an invalid
 * intermediate date.
 */
function eighteenthBirthday(born: Date): Date {
  const year = born.getUTCFullYear() + MINOR_AGE_YEARS;
  const month = born.getUTCMonth();
  // Day 0 of the following month is the last day of this one.
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const eighteenth = new Date(born);
  eighteenth.setUTCFullYear(year, month, Math.min(born.getUTCDate(), lastDayOfMonth));
  return eighteenth;
}
