import {
  lockedUntilCleared,
  MIN_PLATFORM_JWT_SECRET_LENGTH,
  resolvePlatformSecret,
} from './platform-admin.constants';

describe('resolvePlatformSecret', () => {
  it('accepts a secret at or above the floor', () => {
    const secret = 'x'.repeat(MIN_PLATFORM_JWT_SECRET_LENGTH);
    expect(resolvePlatformSecret(secret)).toBe(secret);
  });

  it('treats unset, empty and whitespace as no back-office', () => {
    expect(resolvePlatformSecret(undefined)).toBeNull();
    expect(resolvePlatformSecret('')).toBeNull();
    expect(resolvePlatformSecret('   ')).toBeNull();
  });

  it('treats a too-short secret as no back-office rather than arming one', () => {
    // JWT_ACCESS_SECRET has had this floor since AppModule's validateEnv; the
    // higher-stakes secret must not be the one without it.
    expect(resolvePlatformSecret('x'.repeat(MIN_PLATFORM_JWT_SECRET_LENGTH - 1))).toBeNull();
  });
});

describe('lockedUntilCleared', () => {
  it('is far enough out to mean "until an operator clears it"', () => {
    const now = new Date('2026-09-06T00:00:00.000Z');
    expect(lockedUntilCleared(now).getUTCFullYear()).toBe(2126);
  });
});
