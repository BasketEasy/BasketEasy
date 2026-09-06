import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import type { AuditEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** The request-shaped half of an audit entry, extracted once per controller. */
export interface AuditRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEvent {
  type: AuditEventType;
  /** Null for an event about an address with no matching account. */
  userId?: string | null;
  /**
   * Denormalised on purpose — this is what the entry still reads by once the
   * account is deleted and the FK above is set to null.
   */
  actorEmail?: string | null;
  context?: AuditRequestContext;
  metadata?: Prisma.InputJsonValue;
}

// User-Agent headers are attacker-controlled and unbounded; a security log is
// not a place to store a megabyte of them.
const MAX_USER_AGENT_LENGTH = 400;

/**
 * Pulls the two request-derived fields of an audit entry out of an Express
 * request, so no controller reaches into `req.ip`/headers itself.
 */
export function auditContextFrom(req: Request): AuditRequestContext {
  const userAgent = req.get('user-agent');
  return {
    ipAddress: req.ip ?? null,
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}

/**
 * Writes the security-log entries kept for 12 months (CNIL's standard
 * recommendation), swept nightly by RetentionService.
 *
 * Every write is fire-and-forget, the same contract as MailService: an audit
 * row is a side effect of something the caller already did successfully, so a
 * failed insert must never turn a good login into a 500 — and there is
 * nothing a caller could do about it in any case.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  record(event: AuditEvent): void {
    void this.prisma.auditLog
      .create({
        data: {
          type: event.type,
          userId: event.userId ?? null,
          actorEmail: event.actorEmail ?? null,
          ipAddress: event.context?.ipAddress ?? null,
          userAgent: event.context?.userAgent ?? null,
          metadata: event.metadata,
        },
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to write ${event.type} audit entry: ${message}`);
      });
  }
}
