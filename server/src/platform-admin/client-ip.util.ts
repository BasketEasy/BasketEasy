import { BlockList, isIPv4 } from 'net';
import type { Request } from 'express';

/**
 * Per-admin network restriction, per the back-office design's Hardening
 * section. `node:net`'s own BlockList does the subnet arithmetic for both
 * address families, so no CIDR dependency is needed.
 *
 * An empty allowlist means unrestricted — the same graceful-degradation
 * convention the optional integration credentials use. A restriction that
 * every deployment had to configure before the back-office worked at all
 * would just get set to 0.0.0.0/0 everywhere.
 */
export function isIpAllowed(allowedCidrs: string[], ip: string | null): boolean {
  if (allowedCidrs.length === 0) return true;
  // A configured allowlist with no resolvable caller address fails closed:
  // "we could not tell where this came from" is not a reason to let it in.
  if (!ip) return false;

  const list = new BlockList();
  let hasUsableRule = false;
  for (const entry of allowedCidrs) {
    if (addRule(list, entry)) {
      hasUsableRule = true;
    }
  }
  // Every rule was malformed. Fails closed for the same reason as above,
  // rather than silently degrading to "unrestricted".
  if (!hasUsableRule) return false;

  try {
    return list.check(ip, isIPv4(ip) ? 'ipv4' : 'ipv6');
  } catch {
    return false;
  }
}

/**
 * Whether an allowlist entry is a usable address or CIDR. `isIpAllowed`
 * silently skips a malformed entry, so the CLI checks each one up front: a
 * typo would otherwise narrow a restriction, or lock an admin out, unseen.
 */
export function isValidCidrRule(entry: string): boolean {
  return addRule(new BlockList(), entry);
}

function addRule(list: BlockList, entry: string): boolean {
  const trimmed = entry.trim();
  if (!trimmed) return false;

  try {
    const [address, prefix] = trimmed.split('/');
    const family = isIPv4(address) ? 'ipv4' : 'ipv6';
    if (prefix === undefined) {
      list.addAddress(address, family);
    } else {
      list.addSubnet(address, Number(prefix), family);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The caller's address, for the audit log and the per-admin CIDR allowlist.
 *
 * Defers entirely to Express's `req.ip`, which resolves X-Forwarded-For
 * against the `trust proxy` setting configured in main.ts from TRUSTED_PROXY.
 *
 * This used to parse the header itself and took the leftmost entry, which was
 * backwards and exploitable: a proxy *appends* the peer it saw, so the
 * leftmost value is whatever the client sent — meaning anyone could name
 * their own apparent IP and satisfy an admin's network restriction. Express
 * takes the rightmost entry minus the trusted hop count, which is the correct
 * one. Do not reintroduce hand-rolled parsing here.
 */
export function clientIpOf(request: Request): string | null {
  const ip = request.ip ?? request.socket?.remoteAddress;
  return ip ? normalizeIp(ip) : null;
}

/**
 * Node reports an IPv4 peer on a dual-stack socket as `::ffff:127.0.0.1`.
 * `net.BlockList` will not match that against an IPv4 subnet, so the mapped
 * prefix is stripped before either storing or allowlist-matching an address.
 */
export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}
