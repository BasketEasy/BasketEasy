/**
 * The step-up token's lifetime. Short on purpose: expiry means re-entering a
 * TOTP code, never a silent refresh, because the point is that a back-office
 * session left open on a shared machine goes cold fast.
 */
export const PLATFORM_TOKEN_TTL_SECONDS = 15 * 60;

/** The claim PlatformAdminGuard requires; an ordinary access token has no `scope`. */
export const PLATFORM_TOKEN_SCOPE = 'platform-admin';

/**
 * Per-account TOTP rate limit. Counted from the ADMIN_LOGIN_FAILURE rows the
 * design already requires be written for every failed attempt, rather than a
 * counter column: those rows survive a restart and are shared across server
 * instances, which an in-memory counter is not.
 */
export const PLATFORM_LOGIN_MAX_ATTEMPTS = 5;
export const PLATFORM_LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * "Locked until manually cleared", expressed in a `DateTime?` column. A lock
 * that expires on its own would be a rate limit an attacker simply waits out;
 * clearing this is `server/scripts/platform-admin.ts unlock`.
 */
export function lockedUntilCleared(now: Date = new Date()): Date {
  const locked = new Date(now.getTime());
  locked.setUTCFullYear(locked.getUTCFullYear() + 100);
  return locked;
}
