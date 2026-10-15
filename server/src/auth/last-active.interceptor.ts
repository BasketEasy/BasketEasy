import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from './decorators/current-user.decorator';

/**
 * How stale `User.lastActiveAt` is allowed to get before a request refreshes
 * it. One hour: the value only ever feeds a 12-month cutoff, so it needs to
 * be right to within a day, and writing on every request would put an UPDATE
 * on the user's row in front of every authenticated read.
 */
export const LAST_ACTIVE_WRITE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Refreshes `User.lastActiveAt` — the one signal RetentionService reads to
 * decide an account is inactive — on authenticated requests, debounced.
 *
 * Registered globally (APP_INTERCEPTOR) rather than route by route, because
 * "any authenticated request counts as activity" is the rule and enumerating
 * the routes it applies to would go stale the first time one is added. On an
 * unauthenticated request it costs one property read and does nothing.
 *
 * The debounce map is per-process, so N server instances write at most N
 * times an hour for one very busy user. That is accepted rather than moving
 * the counter to Redis: an activity ping must not start depending on the
 * queue being reachable, and the imprecision is measured in seconds against
 * a twelve-month threshold.
 */
@Injectable()
export class LastActiveInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LastActiveInterceptor.name);
  private readonly lastWrittenAt = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const userId = request.user?.id;
    // A back-office impersonation is staff viewing, not the subject being
    // active: counting it would reset the clock the retention sweep reads.
    if (userId && !request.user?.impersonation) {
      this.touch(userId);
    }
    return next.handle();
  }

  private touch(userId: string): void {
    const now = Date.now();
    const written = this.lastWrittenAt.get(userId);
    if (written !== undefined && now - written < LAST_ACTIVE_WRITE_INTERVAL_MS) {
      return;
    }

    // Recorded before the write resolves, so a burst of concurrent requests
    // from one user produces one UPDATE rather than one per request.
    this.lastWrittenAt.set(userId, now);
    this.evictExpired(now);

    void this.prisma.user
      .update({ where: { id: userId }, data: { lastActiveAt: new Date(now) } })
      .catch((err: unknown) => {
        // Let the next request retry, and never fail a request that already
        // succeeded over an activity ping.
        this.lastWrittenAt.delete(userId);
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to refresh lastActiveAt for ${userId}: ${message}`);
      });
  }

  /**
   * Keeps the map bounded on a long-running instance: an entry older than the
   * window can only ever produce a write on its next read anyway, so holding
   * it buys nothing.
   */
  private evictExpired(now: number): void {
    for (const [id, at] of this.lastWrittenAt) {
      if (now - at >= LAST_ACTIVE_WRITE_INTERVAL_MS) {
        this.lastWrittenAt.delete(id);
      }
    }
  }
}
