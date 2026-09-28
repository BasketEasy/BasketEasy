/**
 * Turns the TRUSTED_PROXY env var into Express's `trust proxy` setting.
 *
 * This exists because getting the client's address from `X-Forwarded-For` by
 * hand is a trap. A proxy *appends* the peer it saw to the right of the
 * header, so the leftmost value is whatever the client sent — reading it is
 * how an attacker picks their own apparent IP. The correct value is the
 * rightmost entry minus the number of proxies you actually run, which is
 * precisely what Express computes once `trust proxy` is set. Nothing in this
 * codebase should parse that header itself.
 *
 * Accepted values:
 *   unset / 'false' / ''  → trust nothing; `req.ip` is the socket peer.
 *   a positive integer    → that many trusted hops in front of the API.
 *   anything else         → passed to Express as a trusted-proxy list
 *                           (comma-separated IPs/CIDRs, or 'loopback').
 *
 * `true` is deliberately NOT honoured as Express's "trust every hop": that
 * setting makes the leftmost — client-controlled — value win, which is the
 * exact spoofable configuration this helper exists to prevent. It is mapped
 * to a single hop instead, the overwhelmingly common deployment.
 */
export const DEFAULT_TRUSTED_HOPS = 1;

export type TrustProxySetting = false | number | string;

export function resolveTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = raw?.trim();
  if (!value || value === 'false' || value === '0') {
    return false;
  }
  if (value === 'true') {
    return DEFAULT_TRUSTED_HOPS;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}
