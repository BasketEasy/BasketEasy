/**
 * The retention windows from
 * docs/superpowers/specs/2026-09-06-data-retention-policy-design.md.
 *
 * Months, not milliseconds: "12 months" has to mean the same calendar day a
 * year on, and a fixed 365-day constant drifts across a leap year.
 */
export const INACTIVE_ACCOUNT_RETENTION_MONTHS = 12;
export const AUDIT_LOG_RETENTION_MONTHS = 12;

/**
 * How far ahead of the cutoff an account shows up on the back-office's
 * "expiring soon" list. Wide enough that a club raising a support ticket
 * about a dormant account still has time to be answered before the sweep
 * takes it.
 */
export const INACTIVE_SOON_LEAD_MONTHS = 1;

export function subtractMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
}
