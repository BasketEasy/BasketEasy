import { Injectable, Logger } from '@nestjs/common';
import type { AuditEventType, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

// A User-Agent is attacker-controlled and unbounded, and nothing reads more
// than the browser/OS prefix.
const USER_AGENT_MAX_LENGTH = 512;

export interface AuditRecordInput {
  type: AuditEventType;
  /**
   * The *acting* account. For an ADMIN_* event that is the admin, never the
   * data subject they acted on — put the subject in
   * `metadata.subjectUserId`, which is what the back-office's audit-log view
   * filters on.
   */
  userId?: string | null;
  actorEmail?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * The one way a security-relevant event reaches `AuditLog`.
 *
 * This exists as a seam rather than scattered `prisma.auditLog.create` calls
 * for the same reason `MailService` does: the back-office is its first
 * caller, but the data-retention spec's auth-event emitters
 * (LOGIN_SUCCESS, REFRESH_TOKEN_REUSE_DETECTED, …) wire into this same
 * method, and the IP/user-agent extraction below should exist once.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Awaited by callers that must not proceed without the record — an
   * ADMIN_PII_VIEWED row has to be written *before* the PII is returned, or
   * a crash between the two loses exactly the evidence the log exists for.
   */
  async record(input: AuditRecordInput, request?: Request): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        type: input.type,
        userId: input.userId ?? null,
        actorEmail: input.actorEmail ?? null,
        ipAddress: request ? clientIpOf(request) : null,
        userAgent: request?.headers['user-agent']?.slice(0, USER_AGENT_MAX_LENGTH) ?? null,
        metadata: input.metadata,
      },
    });
  }

  /**
   * For emitters on a path whose own failure would be worse than a lost
   * audit row — a login must still succeed if the audit insert times out.
   * Never use this for an ADMIN_* event: there the record *is* the point.
   */
  recordAndForget(input: AuditRecordInput, request?: Request): void {
    void this.record(input, request).catch((err: unknown) => {
      this.logger.error(`Failed to write audit log entry ${input.type}`, err as Error);
    });
  }
}

/**
 * The caller's address as the audit log should record it.
 *
 * `X-Forwarded-For` is only consulted when TRUSTED_PROXY is set, because an
 * untrusted client can send that header itself — recording a spoofed address
 * in a security log is worse than recording the proxy's own.
 */
export function clientIpOf(request: Request): string | null {
  if (process.env.TRUSTED_PROXY === 'true') {
    const forwarded = request.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const candidate = first?.split(',')[0]?.trim();
    if (candidate) {
      return normalizeIp(candidate);
    }
  }
  return request.socket?.remoteAddress ? normalizeIp(request.socket.remoteAddress) : null;
}

/**
 * Node reports an IPv4 peer on a dual-stack socket as `::ffff:127.0.0.1`.
 * `net.BlockList` will not match that against an IPv4 subnet, so the mapped
 * prefix is stripped before either storing or allowlist-matching an address.
 */
export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}
