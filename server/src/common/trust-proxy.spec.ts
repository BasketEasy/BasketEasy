import { DEFAULT_TRUSTED_HOPS, resolveTrustProxy } from './trust-proxy';

describe('resolveTrustProxy', () => {
  it('trusts nothing when unset or explicitly disabled', () => {
    expect(resolveTrustProxy(undefined)).toBe(false);
    expect(resolveTrustProxy('')).toBe(false);
    expect(resolveTrustProxy('  ')).toBe(false);
    expect(resolveTrustProxy('false')).toBe(false);
    expect(resolveTrustProxy('0')).toBe(false);
  });

  it('reads an explicit hop count', () => {
    expect(resolveTrustProxy('1')).toBe(1);
    expect(resolveTrustProxy('2')).toBe(2);
  });

  it("maps 'true' to one hop rather than Express's trust-everything", () => {
    // Express's literal `true` makes the leftmost — client-supplied — value
    // of X-Forwarded-For win, which is exactly the spoofable configuration.
    expect(resolveTrustProxy('true')).toBe(DEFAULT_TRUSTED_HOPS);
  });

  it('passes a proxy list through untouched', () => {
    expect(resolveTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
    expect(resolveTrustProxy('loopback, 172.18.0.0/16')).toBe('loopback, 172.18.0.0/16');
  });
});
