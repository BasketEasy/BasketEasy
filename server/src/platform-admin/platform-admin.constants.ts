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
 * clearing this is `server/src/cli/platform-admin.ts unlock`.
 */
export function lockedUntilCleared(now: Date = new Date()): Date {
  const locked = new Date(now.getTime());
  locked.setUTCFullYear(locked.getUTCFullYear() + 100);
  return locked;
}

/**
 * Floor on PLATFORM_JWT_SECRET, mirroring AppModule's check on
 * JWT_ACCESS_SECRET. It cannot live in `validateEnv` — that would make the
 * back-office mandatory rather than opt-in — so it is enforced where the
 * secret is read instead.
 *
 * A secret set but too short is treated exactly like an unset one: the
 * back-office is off. Failing closed is the only safe reading of a
 * misconfiguration on the one surface where a forged token would open every
 * club's roster at once, and it is strictly better than the alternative,
 * which is an *armed* back-office behind a guessable signing key.
 */
export const MIN_PLATFORM_JWT_SECRET_LENGTH = 32;

/**
 * The single reader of PLATFORM_JWT_SECRET. Returns null when the
 * back-office should not exist for this deployment — unset, or set to
 * something too weak to sign with.
 */
export function resolvePlatformSecret(secret: string | undefined): string | null {
  if (!secret || secret.trim().length < MIN_PLATFORM_JWT_SECRET_LENGTH) {
    return null;
  }
  return secret;
}
