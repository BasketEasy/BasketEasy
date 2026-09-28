import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Encryption at rest for `PlatformAdmin.totpSecret`.
 *
 * A TOTP shared secret is a password in all but name: anyone holding it
 * generates valid codes. Stored in clear, a database dump or a leaked backup
 * would hand out the second factor alongside everything else, so the column
 * holds AES-256-GCM ciphertext under PLATFORM_TOTP_ENCRYPTION_KEY, which lives
 * in the environment and never in the database.
 *
 * The owning `userId` is the GCM additional data: a ciphertext copied onto
 * another admin's row fails authentication instead of arming that row with
 * someone else's secret.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>`, each part base64url. The version prefix
 * leaves room to rotate the scheme without guessing what an old row holds.
 */

const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * The single reader of PLATFORM_TOTP_ENCRYPTION_KEY: 32 bytes, base64. Returns
 * null when unset or malformed, which the caller treats like an unset
 * PLATFORM_JWT_SECRET: the back-office is off rather than armed with secrets
 * it cannot protect. Generate one with `openssl rand -base64 32`.
 */
export function resolveTotpEncryptionKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const key = Buffer.from(raw.trim(), 'base64');
  return key.length === KEY_BYTES ? key : null;
}

export function encryptTotpSecret(secret: string, key: Buffer, userId: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(userId, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/**
 * Null on anything that doesn't decrypt: a wrong key, a tampered or
 * transplanted row, or a legacy plaintext value. All of them fail closed; the
 * remedy for each is re-running `platform-admin.ts grant`.
 */
export function decryptTotpSecret(stored: string, key: Buffer, userId: string): string | null {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const [iv, tag, ciphertext] = parts.slice(1).map((part) => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(userId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
