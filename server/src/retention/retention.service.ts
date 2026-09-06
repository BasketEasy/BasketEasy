import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { startParentalConsentRetention } from '../common/parental-consent-retention';
import {
  AUDIT_LOG_RETENTION_MONTHS,
  INACTIVE_ACCOUNT_RETENTION_MONTHS,
  MAX_ACCOUNTS_PER_SWEEP,
  subMonths,
} from './retention.constants';

export type RetentionStepName = 'inactiveAccounts' | 'auditLogs' | 'parentalConsents';

export interface RetentionStepResult {
  status: 'ok' | 'error';
  /** Rows affected, or — in a dry run — rows that would have been affected. */
  count: number;
  error?: string;
}

export type RetentionSweepSummary = Record<RetentionStepName, RetentionStepResult>;

const STEP_ORDER: RetentionStepName[] = ['inactiveAccounts', 'auditLogs', 'parentalConsents'];

/**
 * Every retention rule that application code can enforce, run as one nightly
 * sweep (see docs/superpowers/specs/2026-09-06-data-retention-policy-design.md).
 *
 * Backup rotation, the sixth rule, is deliberately absent: it is set on the
 * Postgres backup tool and the R2 bucket lifecycle, not in business logic.
 *
 * Each step is independent and idempotent — re-running the sweep after a
 * partial failure re-does only what is still expired — and one failing step
 * never cancels the others, because "audit logs couldn't be pruned" is no
 * reason to leave inactive accounts standing.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(dryRun = false): Promise<RetentionSweepSummary> {
    const now = new Date();
    const settled = await Promise.allSettled([
      this.sweepInactiveAccounts(dryRun, now),
      this.sweepAuditLogs(dryRun, now),
      this.sweepExpiredParentalConsents(dryRun, now),
    ]);

    const summary = STEP_ORDER.reduce((acc, step, index) => {
      acc[step] = toStepResult(settled[index]);
      return acc;
    }, {} as RetentionSweepSummary);

    // Persisted whether or not this was a dry run: "what would have happened"
    // is itself the evidence that the policy was evaluated, which RGPD
    // art. 5.2 (accountability) asks for just as much as the deletions are.
    await this.prisma.retentionRun.create({
      data: { dryRun, ranAt: now, summary: summary as unknown as Prisma.InputJsonValue },
    });

    this.logger.log(
      `Retention sweep${dryRun ? ' (dry run)' : ''}: ${STEP_ORDER.map(
        (step) => `${step}=${summary[step].status}:${summary[step].count}`,
      ).join(' ')}`,
    );
    return summary;
  }

  /**
   * Rule 2 — an account with no activity for 12 months is erased.
   *
   * Erasure must not take the club's history with it (rule 3 keeps stats
   * forever), so the linked Player rows are unlinked rather than deleted:
   * `Player.userId = null` is the state a roster entry has already been in
   * since invites existed, so the roster, its TeamPlayer rows and every
   * MatchPlayerStat survive untouched. Everything that hangs off User
   * directly (memberships, refresh tokens, notifications, push
   * subscriptions, both token tables) cascades at the database level.
   */
  private async sweepInactiveAccounts(dryRun: boolean, now: Date): Promise<RetentionStepResult> {
    const cutoff = subMonths(now, INACTIVE_ACCOUNT_RETENTION_MONTHS);
    const candidates = await this.prisma.user.findMany({
      where: { lastActiveAt: { lt: cutoff } },
      select: { id: true, email: true },
      orderBy: { lastActiveAt: 'asc' },
      take: MAX_ACCOUNTS_PER_SWEEP,
    });

    if (dryRun) {
      return { status: 'ok', count: candidates.length };
    }

    let erased = 0;
    for (const user of candidates) {
      // One transaction per account rather than one for the batch: a single
      // unexpected constraint failure then costs that one account's erasure,
      // not the whole night's work.
      await this.prisma.$transaction(async (tx) => {
        await this.eraseUserAccount(tx, user.id, now);
        // The account's last session ending, from the security log's point of
        // view — deliberately not a new AuditEventType: extending that enum
        // belongs to the back-office spec, and `metadata.reason` already says
        // precisely what happened.
        await tx.auditLog.create({
          data: {
            type: 'LOGOUT',
            actorEmail: user.email,
            metadata: { reason: 'inactivity_12mo_erasure' },
          },
        });
      });
      erased += 1;
    }

    return { status: 'ok', count: erased };
  }

  /**
   * Erases one account, keeping everything the club owns. Extracted from the
   * sweep above because the back-office's manual erasure — a named RGPD
   * request handled *before* the 12-month clock fires — has to remove exactly
   * the same rows and start the same consent clocks. Two implementations of
   * "erase an account" is how the manual path quietly drifts out of
   * compliance with the automated one.
   *
   * The caller supplies the transaction so an erasure and whatever the caller
   * must record about it commit together.
   *
   * Returns the number of roster entries left standing with `userId` cleared
   * — the back-office reports it back, since "your club history survives" is
   * the thing a data officer is asked about most.
   */
  async eraseUserAccount(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date = new Date(),
  ): Promise<{ unlinkedPlayerCount: number }> {
    const players = await tx.player.findMany({ where: { userId }, select: { id: true } });
    await tx.player.updateMany({ where: { userId }, data: { userId: null } });
    await startParentalConsentRetention(
      tx,
      players.map((player) => player.id),
      now,
    );
    await tx.user.delete({ where: { id: userId } });

    return { unlinkedPlayerCount: players.length };
  }

  /**
   * The sweep's run history, behind the back-office's
   * `GET /admin/retention/runs`. Read-only: this is the evidence that the
   * policy actually executes, which RGPD art. 5.2 asks for and which nobody
   * could otherwise see without a psql session.
   */
  listRuns(limit: number) {
    return this.prisma.retentionRun.findMany({ orderBy: { ranAt: 'desc' }, take: limit });
  }

  /** Rule 4 — security logs are kept 12 months. */
  private async sweepAuditLogs(dryRun: boolean, now: Date): Promise<RetentionStepResult> {
    const where = { createdAt: { lt: subMonths(now, AUDIT_LOG_RETENTION_MONTHS) } };
    if (dryRun) {
      return { status: 'ok', count: await this.prisma.auditLog.count({ where }) };
    }
    const { count } = await this.prisma.auditLog.deleteMany({ where });
    return { status: 'ok', count };
  }

  /**
   * Rule 6 — a consent proof is deleted five years after the clock started.
   * Rows with `retentionExpiresAt: null` are the active ones and are never
   * matched here: consent for a minor still on a roster must not expire out
   * from under them.
   */
  private async sweepExpiredParentalConsents(
    dryRun: boolean,
    now: Date,
  ): Promise<RetentionStepResult> {
    const where = { retentionExpiresAt: { lt: now } };
    if (dryRun) {
      return { status: 'ok', count: await this.prisma.parentalConsent.count({ where }) };
    }
    const { count } = await this.prisma.parentalConsent.deleteMany({ where });
    return { status: 'ok', count };
  }
}

function toStepResult(settled: PromiseSettledResult<RetentionStepResult>): RetentionStepResult {
  if (settled.status === 'fulfilled') {
    return settled.value;
  }
  const reason: unknown = settled.reason;
  return {
    status: 'error',
    count: 0,
    error: reason instanceof Error ? reason.message : String(reason),
  };
}
