import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// RFC 6238 TOTP over RFC 4226 HOTP, implemented here rather than pulled in as
// a dependency. The algorithm is ~60 lines and fully specified, and both RFCs
// publish test vectors — so correctness is *proved* in totp.util.spec.ts
// rather than trusted. Same posture as AppModule's hand-rolled validateEnv,
// which deliberately isn't Joi/zod for one required var.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 6238's default, and what every authenticator app assumes. */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/**
 * Steps either side of "now" that still verify. One step (±30s) is the
 * standard tolerance for phone-vs-server clock skew; widening it multiplies
 * the codes a brute-force attempt can hit.
 */
export const TOTP_SKEW_STEPS = 1;

/** 160 bits, RFC 4226 §4 R6's recommendation for the shared secret. */
const SECRET_BYTES = 20;

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

/**
 * Throws on anything that isn't valid base32 rather than silently skipping
 * unknown characters: a secret that decodes to *something* no matter what is
 * typed is a secret that can be corrupted without anyone noticing until the
 * codes stop matching.
 */
export function base32Decode(input: string): Buffer {
  // Padding and case are both allowed by RFC 4648 and both appear in the
  // wild when a secret is copied out of another authenticator.
  const normalized = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  if (normalized.length === 0) {
    throw new Error('Invalid base32 secret: empty');
  }

  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 secret: unexpected character ${JSON.stringify(char)}`);
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226 §5.3, HMAC-SHA1 + dynamic truncation. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const counterBuf = Buffer.alloc(8);
  // Node's writeBigUInt64BE avoids the >2^32 precision loss a manual
  // high/low split invites; the counter is a step index, not a timestamp,
  // so it stays well inside Number.MAX_SAFE_INTEGER either way.
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', secret).update(counterBuf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

export function totpCounterAt(date: Date): number {
  return Math.floor(date.getTime() / 1000 / TOTP_STEP_SECONDS);
}

/**
 * The time step a code matches, or null. Returning the step rather than a
 * boolean is what makes replay protection possible: the caller records the
 * last accepted step and refuses anything at or before it, so one code works
 * once even though it stays valid for up to ±1 step.
 *
 * Constant-time over the candidate codes: a timing side channel on a
 * six-digit code is a small leak, but this is the one credential standing
 * between a stolen password and every club's roster.
 */
export function matchTotpCounter(
  base32Secret: string,
  code: string,
  now: Date = new Date(),
  skewSteps: number = TOTP_SKEW_STEPS,
): number | null {
  const candidate = code.trim();
  if (!/^\d+$/.test(candidate) || candidate.length !== TOTP_DIGITS) {
    return null;
  }

  let secret: Buffer;
  try {
    secret = base32Decode(base32Secret);
  } catch {
    return null;
  }

  const counter = totpCounterAt(now);
  const actual = Buffer.from(candidate);
  let matched: number | null = null;
  for (let step = -skewSteps; step <= skewSteps; step += 1) {
    const expected = Buffer.from(hotp(secret, counter + step));
    // No early return: every candidate step is compared even after a hit, so
    // the response time doesn't reveal *which* step matched.
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
      matched = counter + step;
    }
  }
  return matched;
}

/**
 * The `otpauth://` enrollment URI, printed by server/src/cli/platform-admin.ts
 * for the operator to paste or render as a QR. There is deliberately no
 * in-app enrollment screen: an enrollment screen is a self-service path to
 * arming a grant, and the design says grants are provisioned out-of-band.
 */
export function buildOtpAuthUri(secret: string, accountEmail: string, issuer = 'Kluvo'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountEmail)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
