import {
  base32Decode,
  buildOtpAuthUri,
  generateTotpSecret,
  hotp,
  totpCounterAt,
  verifyTotp,
} from './totp.util';

// RFC 4226 Appendix D — the ASCII secret "12345678901234567890", base32
// GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ.
const RFC4226_SECRET_ASCII = '12345678901234567890';
const RFC4226_SECRET_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('base32Decode', () => {
  it('round-trips the RFC 4226 test secret', () => {
    expect(base32Decode(RFC4226_SECRET_BASE32).toString('ascii')).toBe(RFC4226_SECRET_ASCII);
  });

  it('accepts lowercase, padding and whitespace', () => {
    expect(base32Decode(' gezdgnbv gy3tqojq gezdgnbvgy3tqojq ====').toString('ascii')).toBe(
      RFC4226_SECRET_ASCII,
    );
  });

  it('rejects a character outside the alphabet instead of skipping it', () => {
    // Silently skipping would mean a secret corrupted in transit still
    // decodes to *something*, and nobody notices until codes stop matching.
    expect(() => base32Decode('GEZDGNBV1GY3TQOJQ')).toThrow(/unexpected character/);
    expect(() => base32Decode('')).toThrow(/empty/);
  });
});

describe('hotp (RFC 4226 Appendix D)', () => {
  // The published 6-digit HOTP values for counters 0..9.
  const vectors = [
    '755224',
    '287082',
    '359152',
    '969429',
    '338314',
    '254676',
    '287922',
    '162583',
    '399871',
    '520489',
  ];

  it.each(vectors.map((code, counter) => [counter, code]))(
    'counter %i produces %s',
    (counter, expected) => {
      expect(hotp(Buffer.from(RFC4226_SECRET_ASCII, 'ascii'), counter as number)).toBe(expected);
    },
  );
});

describe('verifyTotp (RFC 6238 Appendix B)', () => {
  // RFC 6238's SHA-1 vectors, truncated to the 6 digits this implementation
  // emits (the RFC tabulates 8).
  const vectors: [number, string][] = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ];

  it.each(vectors)('accepts the code for T=%i', (epochSeconds, code) => {
    expect(verifyTotp(RFC4226_SECRET_BASE32, code, new Date(epochSeconds * 1000), 0)).toBe(true);
  });

  it('accepts a code one step early or late but not two', () => {
    const now = new Date(1111111109 * 1000);
    const secret = Buffer.from(RFC4226_SECRET_ASCII, 'ascii');
    const counter = totpCounterAt(now);

    expect(verifyTotp(RFC4226_SECRET_BASE32, hotp(secret, counter - 1), now)).toBe(true);
    expect(verifyTotp(RFC4226_SECRET_BASE32, hotp(secret, counter + 1), now)).toBe(true);
    expect(verifyTotp(RFC4226_SECRET_BASE32, hotp(secret, counter + 2), now)).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    const now = new Date(1111111109 * 1000);
    expect(verifyTotp(RFC4226_SECRET_BASE32, '', now)).toBe(false);
    expect(verifyTotp(RFC4226_SECRET_BASE32, '12345', now)).toBe(false);
    expect(verifyTotp(RFC4226_SECRET_BASE32, '08180a', now)).toBe(false);
    // A corrupted secret must fail closed, not throw a 500 out of the guard.
    expect(verifyTotp('not base32!', '081804', now)).toBe(false);
  });
});

describe('generateTotpSecret', () => {
  it('produces a decodable 160-bit secret', () => {
    const secret = generateTotpSecret();
    expect(base32Decode(secret)).toHaveLength(20);
    expect(secret).not.toBe(generateTotpSecret());
  });
});

describe('buildOtpAuthUri', () => {
  it('encodes issuer and account into a label an authenticator accepts', () => {
    const uri = buildOtpAuthUri('GEZDGNBVGY3TQOJQ', 'dpo@kluvo.net');
    expect(uri).toContain('otpauth://totp/Kluvo:dpo%40kluvo.net?');
    expect(uri).toContain('secret=GEZDGNBVGY3TQOJQ');
    expect(uri).toContain('period=30');
    expect(uri).toContain('digits=6');
  });
});
