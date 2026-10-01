import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { startParentalConsentRetention } from '../common/parental-consent-retention';
import {
  AUDIT_LOG_RETENTION_MONTHS,
  GEOCODE_CACHE_RETENTION_MONTHS,
  INACTIVE_ACCOUNT_RETENTION_MONTHS,
  MAX_ACCOUNTS_PER_SWEEP,
  subMonths,
} from './retention.constants';

/** How long an expired impersonation session row is kept before the sweep drops it. */
const IMPERSONATION_SESSION_GRACE_MS = 24 * 60 * 60 * 1000;

type RetentionStepName = 'inactiveAccounts' | 'auditLogs' | 'parentalConsents' | 'geocodeCache';

export interface RetentionStepResult {
  status: 'ok' | 'error';
  /** Rows affected, or — in a dry run — rows that would have been affected. */
  count: number;
  /**
   * Rows the step tried and failed to process, having carried on with the
   * rest. `status` stays `'ok'` when this is non-zero: the step ran to
   * completion and the count above is a truthful tally of what it achieved.
   * `status: 'error'` is reserved for a step that did not finish at all.
   */
  failedCount?: number;
  /** The ids behind `failedCount`, so a stuck record is nameable rather than merely counted. */
  failedIds?: string[];
  /**
   * Rows the step deliberately left alone because they stopped qualifying
   * between the candidate query and their own turn — an account that logged
   * back in mid-sweep. Not a failure, and recorded so the run's evidence
   * distinguishes "spared" from "never selected".
   */
  skippedCount?: number;
  error?: string;
}

export type RetentionSweepSummary = Record<RetentionStepName, RetentionStepResult>;

const STEP_ORDER: RetentionStepName[] = [
  'inactiveAccounts',
  'auditLogs',
  'parentalConsents',
  'geocodeCache',
];

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

  async run(dryRun = false, triggeredByUserId?: string): Promise<RetentionSweepSummary> {
    const now = new Date();
    const settled = await Promise.allSettled([
      this.sweepInactiveAccounts(dryRun, now),
      this.sweepAuditLogs(dryRun, now),
      this.sweepExpiredParentalConsents(dryRun, now),
      this.sweepUnusedGeocodes(dryRun, now),
    ]);

    const summary = STEP_ORDER.reduce((acc, step, index) => {
      acc[step] = toStepResult(settled[index]);
      return acc;
    }, {} as RetentionSweepSummary);

    // Persisted whether or not this was a dry run: "what would have happened"
    // is itself the evidence that the policy was evaluated, which RGPD
    // art. 5.2 (accountability) asks for just as much as the deletions are.
    await this.prisma.retentionRun.create({
      data: {
        dryRun,
        ranAt: now,
        triggeredByUserId: triggeredByUserId ?? null,
        summary: summary as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Retention sweep${dryRun ? ' (dry run)' : ''}: ${STEP_ORDER.map(
        (step) =>
          `${step}=${summary[step].status}:${summary[step].count}` +
          (summary[step].failedCount ? `(+${summary[step].failedCount} failed)` : ''),
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
    let skipped = 0;
    const failedIds: string[] = [];
    for (const user of candidates) {
      // One transaction per account rather than one for the batch: a single
      // unexpected constraint failure then costs that one account's erasure,
      // not the whole night's work.
      try {
        await this.prisma.$transaction(async (tx) => {
          // Guarded on the cutoff: the candidate list was read once at the
          // top of the step and up to 500 accounts are erased sequentially
          // behind it, while AuthService and LastActiveInterceptor can write
          // `lastActiveAt` at any moment. An account that logged back in
          // mid-run throws AccountReactivatedError, rolling this transaction
          // back so it comes out of the run completely untouched.
          await this.eraseUserAccount(tx, user.id, now, { inactiveBefore: cutoff });
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
      } catch (err: unknown) {
        if (err instanceof AccountReactivatedError) {
          // Not a failure: the policy declined to erase an account that
          // proved it was active. Next run re-evaluates it from scratch.
          skipped += 1;
          this.logger.log(
            `Retention: skipped account ${user.id} — active again since the sweep started`,
          );
          continue;
        }
        // One account's failure must not abort the loop. Letting it propagate
        // would report the whole step as rejected — with count 0 — even though
        // every account before it in the ordering was already erased and
        // committed, which is the opposite of the accountability evidence the
        // RetentionRun row exists to be. Worse, candidates are selected oldest
        // first, so a deterministically failing account would block every
        // account behind it, every night, forever.
        failedIds.push(user.id);
        this.logger.error(`Retention: failed to erase account ${user.id}: ${errorMessage(err)}`);
      }
    }

    if (skipped > 0) {
      this.logger.log(`Retention: ${skipped} account(s) reactivated mid-sweep and were spared`);
    }
    return {
      status: 'ok',
      count: erased,
      ...(failedIds.length > 0 ? { failedCount: failedIds.length, failedIds } : {}),
      ...(skipped > 0 ? { skippedCount: skipped } : {}),
    };
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
    options: { inactiveBefore?: Date } = {},
  ): Promise<{ unlinkedPlayerCount: number }> {
    const players = await tx.player.findMany({ where: { userId }, select: { id: true } });
    await tx.player.updateMany({ where: { userId }, data: { userId: null } });
    await startParentalConsentRetention(
      tx,
      players.map((player) => player.id),
      now,
    );
    // The sweep passes `inactiveBefore` so "still inactive" is part of the
    // same atomic statement as the deletion. A manual RGPD erasure passes
    // nothing: a named request is honoured however recently the person
    // logged in.
    const { count } = await tx.user.deleteMany({
      where: {
        id: userId,
        ...(options.inactiveBefore ? { lastActiveAt: { lt: options.inactiveBefore } } : {}),
      },
    });
    if (count === 0) {
      // Rolls the caller's transaction back, undoing the unlink and the
      // consent clock above.
      if (options.inactiveBefore) throw new AccountReactivatedError(userId);
      throw new NotFoundException('Compte introuvable');
    }

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
    // Impersonation sessions ride along: a session row is only the "is this
    // token still good" state, dead a day after it expires, and the
    // ADMIN_IMPERSONATION_* audit rows are the record that outlives it (under
    // the 12-month rule just applied). Not counted in this step's figure,
    // which stays "audit rows".
    await this.dropExpiredImpersonationSessions(now);
    return { status: 'ok', count };
  }

  /**
   * A session nobody ended (the tab was closed, or it simply ran out) gets its
   * ADMIN_IMPERSONATION_ENDED row here, with `endReason: 'EXPIRED'` and the
   * real expiry in metadata, so every STARTED row has an ENDED one. Written
   * in the same transaction as the delete, so a row can't be dropped without
   * its record.
   */
  private async dropExpiredImpersonationSessions(now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - IMPERSONATION_SESSION_GRACE_MS);
    await this.prisma.$transaction(async (tx) => {
      const unended = await tx.impersonationSession.findMany({
        where: { expiresAt: { lt: cutoff }, endedAt: null },
        select: {
          id: true,
          actorUserId: true,
          subjectUserId: true,
          expiresAt: true,
          actor: { select: { email: true } },
        },
      });
      if (unended.length > 0) {
        await tx.auditLog.createMany({
          data: unended.map((session) => ({
            type: 'ADMIN_IMPERSONATION_ENDED' as const,
            userId: session.actorUserId,
            actorEmail: session.actor.email,
            metadata: {
              sessionId: session.id,
              subjectUserId: session.subjectUserId,
              endReason: 'EXPIRED',
              expiredAt: session.expiresAt.toISOString(),
            },
          })),
        });
      }
      await tx.impersonationSession.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    });
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

  /**
   * The meeting-point geocode cache: an address nobody has looked up for a
   * year goes. A still-used gym is re-geocoded on its next lookup, so this
   * only ever costs one provider call.
   */
  private async sweepUnusedGeocodes(dryRun: boolean, now: Date): Promise<RetentionStepResult> {
    const where = { lastUsedAt: { lt: subMonths(now, GEOCODE_CACHE_RETENTION_MONTHS) } };
    if (dryRun) {
      return { status: 'ok', count: await this.prisma.geocodedAddress.count({ where }) };
    }
    const { count } = await this.prisma.geocodedAddress.deleteMany({ where });
    return { status: 'ok', count };
  }
}

function toStepResult(settled: PromiseSettledResult<RetentionStepResult>): RetentionStepResult {
  if (settled.status === 'fulfilled') {
    return settled.value;
  }
  return {
    status: 'error',
    count: 0,
    error: errorMessage(settled.reason),
  };
}

/**
 * Thrown inside an erasure transaction when the account's `lastActiveAt` no
 * longer clears the inactivity cutoff — i.e. it was reactivated between the
 * candidate query and its own turn in the loop. Carried as an exception
 * purely so the transaction rolls back; it is caught by the loop and counted
 * as a skip, never as a failure.
 */
class AccountReactivatedError extends Error {
  constructor(readonly userId: string) {
    super(`Account ${userId} became active again before it could be erased`);
    this.name = 'AccountReactivatedError';
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
