import type { Request } from 'express';
import { clientIpOf, isIpAllowed, normalizeIp } from './client-ip.util';

describe('isIpAllowed', () => {
  it('treats an empty allowlist as unrestricted', () => {
    expect(isIpAllowed([], '198.51.100.4')).toBe(true);
    expect(isIpAllowed([], null)).toBe(true);
  });

  it('matches IPv4 subnets and bare addresses', () => {
    expect(isIpAllowed(['203.0.113.0/24'], '203.0.113.7')).toBe(true);
    expect(isIpAllowed(['203.0.113.0/24'], '203.0.114.7')).toBe(false);
    expect(isIpAllowed(['203.0.113.7'], '203.0.113.7')).toBe(true);
    expect(isIpAllowed(['203.0.113.7'], '203.0.113.8')).toBe(false);
  });

  it('matches IPv6 subnets', () => {
    expect(isIpAllowed(['2001:db8::/32'], '2001:db8::1')).toBe(true);
    expect(isIpAllowed(['2001:db8::/32'], '2001:dba::1')).toBe(false);
  });

  it('accepts a caller matching any one entry', () => {
    expect(isIpAllowed(['203.0.113.0/24', '2001:db8::/32'], '2001:db8::9')).toBe(true);
  });

  it('fails closed when a restriction is configured but the caller has no address', () => {
    // "We could not tell where this came from" is not a reason to let it in.
    expect(isIpAllowed(['203.0.113.0/24'], null)).toBe(false);
  });

  it('fails closed when every configured entry is malformed', () => {
    // A typo'd allowlist must not silently degrade to unrestricted — that is
    // the failure mode where the operator believes they are protected.
    expect(isIpAllowed(['not-an-address', '999.1.1.1/24'], '203.0.113.7')).toBe(false);
  });

  it('still matches an IPv4 caller arriving over a dual-stack socket', () => {
    // Node reports such a peer as ::ffff:203.0.113.7, which BlockList will
    // not match against an IPv4 subnet.
    expect(isIpAllowed(['203.0.113.0/24'], normalizeIp('::ffff:203.0.113.7'))).toBe(true);
  });
});

describe('clientIpOf', () => {
  function buildRequest(ip: string | undefined, remoteAddress?: string): Request {
    return { ip, socket: { remoteAddress } } as unknown as Request;
  }

  it("uses Express's resolved req.ip", () => {
    // Express resolves X-Forwarded-For against `trust proxy` (set in main.ts
    // from TRUSTED_PROXY) and takes the rightmost entry minus the trusted hop
    // count. Parsing the header here instead once took the leftmost — the
    // client-supplied — value, which let anyone name their own apparent IP
    // and satisfy an admin's network restriction.
    expect(clientIpOf(buildRequest('203.0.113.7'))).toBe('203.0.113.7');
  });

  it('strips the IPv4-mapped prefix a dual-stack socket reports', () => {
    expect(clientIpOf(buildRequest('::ffff:203.0.113.7'))).toBe('203.0.113.7');
  });

  it('falls back to the socket peer when Express resolved nothing', () => {
    expect(clientIpOf(buildRequest(undefined, '198.51.100.4'))).toBe('198.51.100.4');
    expect(clientIpOf(buildRequest(undefined, undefined))).toBeNull();
  });
});
