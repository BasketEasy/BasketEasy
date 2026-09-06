import { BlockList, isIPv4 } from 'net';

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
