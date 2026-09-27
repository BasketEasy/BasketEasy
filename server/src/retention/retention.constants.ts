/** RGPD art. 5.1.e: an account is erased after this long with no activity. */
export const INACTIVE_ACCOUNT_RETENTION_MONTHS = 12;

/** CNIL's standard recommendation for connection/security logs. */
export const AUDIT_LOG_RETENTION_MONTHS = 12;

/**
 * A cached geocode nobody has looked up for this long is dropped. It holds a
 * typed address, so it is not kept for the life of the app, and a gym still
 * in use is refreshed by its next lookup long before this.
 */
export const GEOCODE_CACHE_RETENTION_MONTHS = 12;

/**
 * Ceiling on how many accounts one nightly run erases. The first real run
 * after a deployment has been observing in dry-run mode can have a large
 * backlog, and deleting it in one unbounded burst of transactions is how a
 * retention job takes the database down with it. The remainder is simply
 * picked up the next night.
 */
export const MAX_ACCOUNTS_PER_SWEEP = 500;

/** Nightly at 03:15 UTC — off-peak for a French-market app. */
export const RETENTION_SWEEP_CRON = '15 3 * * *';

/**
 * Stable id for the repeatable-job scheduler, so a redeploy (or a second
 * instance booting) upserts the same schedule instead of registering a
 * duplicate.
 */
export const RETENTION_SWEEP_SCHEDULER_ID = 'retention-sweep-nightly';

/**
 * UTC-safe "n months ago". `date-fns` is not a server dependency and this is
 * the only place in the repo that needs one — a four-line helper beats a new
 * runtime dependency. setUTCMonth already normalises an overflowing day
 * (31 March minus 1 month lands on 3 March, not an invalid date), which for a
 * multi-month retention cutoff is a one-day difference nobody can observe.
 */
export function subMonths(from: Date, months: number): Date {
  const result = new Date(from);
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
}
