import {
  decryptTotpSecret,
  encryptTotpSecret,
  resolveTotpEncryptionKey,
} from './totp-secret-crypto';

const KEY = Buffer.alloc(32, 1);
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP secret encryption at rest', () => {
  it('round-trips, and never stores the secret in clear', () => {
    const stored = encryptTotpSecret(SECRET, KEY, 'user-1');

    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain(SECRET);
    expect(decryptTotpSecret(stored, KEY, 'user-1')).toBe(SECRET);
  });

  it('uses a fresh IV per encryption', () => {
    expect(encryptTotpSecret(SECRET, KEY, 'user-1')).not.toBe(
      encryptTotpSecret(SECRET, KEY, 'user-1'),
    );
  });

  it('refuses a ciphertext copied onto another admin row', () => {
    // userId is the GCM additional data.
    const stored = encryptTotpSecret(SECRET, KEY, 'user-1');
    expect(decryptTotpSecret(stored, KEY, 'user-2')).toBeNull();
  });

  it('refuses a wrong key, a tampered value and a legacy plaintext secret', () => {
    const stored = encryptTotpSecret(SECRET, KEY, 'user-1');
    const [version, iv, tag, ciphertext] = stored.split('.');
    const flipped = Buffer.from(ciphertext, 'base64url');
    flipped[0] ^= 1;

    expect(decryptTotpSecret(stored, Buffer.alloc(32, 2), 'user-1')).toBeNull();
    expect(
      decryptTotpSecret([version, iv, tag, flipped.toString('base64url')].join('.'), KEY, 'user-1'),
    ).toBeNull();
    expect(decryptTotpSecret(SECRET, KEY, 'user-1')).toBeNull();
    expect(decryptTotpSecret('v1.not.valid', KEY, 'user-1')).toBeNull();
  });

  describe('resolveTotpEncryptionKey', () => {
    it('accepts exactly 32 bytes of base64', () => {
      expect(resolveTotpEncryptionKey(KEY.toString('base64'))).toEqual(KEY);
    });

    it.each([undefined, '', 'short', Buffer.alloc(16).toString('base64')])(
      'treats %p as unset',
      (raw) => {
        expect(resolveTotpEncryptionKey(raw)).toBeNull();
      },
    );
  });
});
