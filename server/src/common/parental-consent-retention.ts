import type { Prisma } from '@prisma/client';

/**
 * How long a parental-consent attestation is kept once the thing it documents
 * is gone: five years, the civil liability limitation period (art. 2224 Code
 * civil). The clock deliberately starts at *deletion*, not at creation — the
 * rule is "compte/joueur + 5 ans", so there is nothing to prescribe against
 * until the player or the account it belonged to goes away.
 */
const PARENTAL_CONSENT_RETENTION_YEARS = 5;

export function parentalConsentRetentionExpiry(from: Date = new Date()): Date {
  const expiry = new Date(from);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + PARENTAL_CONSENT_RETENTION_YEARS);
  return expiry;
}

/**
 * Starts the five-year clock on every consent record still attached to these
 * players, skipping any that is already ticking (a second deletion event must
 * not extend a clock that started earlier).
 *
 * Called from both paths that can end a player's link: a club removing them
 * from its roster (ClubsService.deletePlayer) and the retention sweep erasing
 * the account they were linked to (RetentionService).
 */
export async function startParentalConsentRetention(
  tx: Prisma.TransactionClient,
  playerIds: string[],
  now: Date = new Date(),
): Promise<number> {
  if (playerIds.length === 0) {
    return 0;
  }
  const { count } = await tx.parentalConsent.updateMany({
    where: { playerId: { in: playerIds }, retentionExpiresAt: null },
    data: { retentionExpiresAt: parentalConsentRetentionExpiry(now) },
  });
  return count;
}
