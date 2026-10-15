import type { Request } from 'express';
import type { AuditRequestContext } from '../audit/audit.service';
import { clientIpOf } from './client-ip.util';

/**
 * The request-shaped half of an audit entry, resolved with the back-office's
 * own stricter IP rule rather than Express's `req.ip`: the same value gates
 * the per-admin network allowlist, so a spoofable one is an access decision
 * made on attacker-supplied input.
 */
export function auditContextOf(request: Request): AuditRequestContext {
  const userAgent = request.headers['user-agent'];
  return {
    ipAddress: clientIpOf(request),
    userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 400) : null,
  };
}
