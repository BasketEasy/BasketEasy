import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RetentionRunSummary, RetentionStepSummary } from '@basketeasy/types/platform-admin';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUDIT_LOG_RETENTION_MONTHS,
  INACTIVE_ACCOUNT_RETENTION_MONTHS,
  subtractMonths,
} from './retention.constants';

/**
 * The data-retention policy's enforcement.
 *
 * Only the *dry-run* half exists so far, plus `eraseUserAccount` — the two
 * things the back-office needs (see
 * docs/superpowers/specs/2026-09-06-backoffice-implementation-plan.md). The
 * nightly BullMQ repeatable job and the destructive sweep steps land with the
 * retention spec itself; they extend this service rather than duplicating it,
 * which is why `eraseUserAccount` is here and not in PlatformAdminService:
 * the automated sweep and a data officer's manual erasure must remove exactly
 * the same rows, and one implementation is the only way to guarantee that.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates every policy without deleting anything and persists the result.
   *
   * The run is recorded even though nothing changed: a dry run's "what would
   * have happened" is itself the evidence that the policy was evaluated,
   * which RGPD art. 5.2 accountability asks for.
   */
  async dryRun(triggeredByUserId: string | null): Promise<RetentionRunSummary> {
    const now = new Date();

    // allSettled, not all: one failing step must not hide the counts of the
    // others, and each step's error belongs to that step's row in the
    // summary rather than failing the whole run.
    const settled = await Promise.allSettled([
      this.countInactiveAccounts(now),
      this.countExpiredAuditLogs(now),
    ]);

    const stepNames = ['inactive-accounts', 'audit-logs'];
    const steps: RetentionStepSummary[] = settled.map((result, index) => {
      if (result.status === 'fulfilled') {
        return { step: stepNames[index], count: result.value, error: null };
      }
      this.logger.error(`Retention dry-run step ${stepNames[index]} failed`, result.reason);
      return { step: stepNames[index], count: 0, error: toErrorMessage(result.reason) };
    });

    const run = await this.prisma.retentionRun.create({
      // The cast is the standard shape for handing a typed object to a Json
      // column: RetentionStepSummary's `error: string | null` is structurally
      // valid JSON but Prisma's InputJsonValue doesn't admit `null` inside an
      // object literal without it.
      data: {
        dryRun: true,
        triggeredByUserId,
        summary: { steps } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: run.id,
      dryRun: run.dryRun,
      ranAt: run.ranAt.toISOString(),
      triggeredByUserId: run.triggeredByUserId,
      steps,
    };
  }

  async listRuns(limit: number): Promise<RetentionRunSummary[]> {
    const runs = await this.prisma.retentionRun.findMany({
      orderBy: { ranAt: 'desc' },
      take: limit,
    });

    return runs.map((run) => ({
      id: run.id,
      dryRun: run.dryRun,
      ranAt: run.ranAt.toISOString(),
      triggeredByUserId: run.triggeredByUserId,
      steps: parseSteps(run.summary),
    }));
  }

  private countInactiveAccounts(now: Date): Promise<number> {
    return this.prisma.user.count({
      where: { lastActiveAt: { lt: subtractMonths(now, INACTIVE_ACCOUNT_RETENTION_MONTHS) } },
    });
  }

  private countExpiredAuditLogs(now: Date): Promise<number> {
    return this.prisma.auditLog.count({
      where: { createdAt: { lt: subtractMonths(now, AUDIT_LOG_RETENTION_MONTHS) } },
    });
  }

  /**
   * Removes one account, keeping everything the club owns.
   *
   * Rule 2 (delete inactive accounts) and rule 3 (keep stats forever) only
   * coexist because `Player.userId` is nullable: a roster entry whose account
   * is gone becomes the same never-claimed entry the app already supports
   * everywhere, so "Jean Dupont, 14 points" still renders on the stats screen
   * after Jean's account is erased.
   *
   * `ClubMembership` and `RefreshToken` are deleted explicitly. Their FKs are
   * `ON DELETE RESTRICT` (Prisma's default for a required relation — see
   * migrations/20260807143740_add_auth_tables), so without this the
   * `user.delete` below fails outright. Everything else pointing at User is
   * either `CASCADE` (tokens, notifications, push subscriptions, TeamAdmin)
   * or `SET NULL` (Player, ScoresheetExtraction.reviewedBy), and needs
   * nothing here. The `player.updateMany` is still explicit rather than
   * leaning on that `SET NULL`: it is the single most load-bearing effect of
   * this method, and it returns the count the caller reports back.
   *
   * The caller supplies the transaction so an erasure and its audit row
   * commit together — an erasure with no audit trail is the exact gap the
   * audit log exists to close.
   */
  async eraseUserAccount(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<{ unlinkedPlayerCount: number }> {
    const { count: unlinkedPlayerCount } = await tx.player.updateMany({
      where: { userId },
      data: { userId: null },
    });
    await tx.clubMembership.deleteMany({ where: { userId } });
    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });

    return { unlinkedPlayerCount };
  }
}

function toErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * `summary` is a Json column, so a row written by an older (or a future)
 * version of the sweep is not guaranteed to carry `steps` — treat anything
 * that isn't the expected shape as no steps at all rather than indexing into
 * it, the same rule `asParsedScoresheetData` applies to `parsedData`.
 */
function parseSteps(summary: Prisma.JsonValue): RetentionStepSummary[] {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return [];
  const steps = (summary as Record<string, unknown>).steps;
  if (!Array.isArray(steps)) return [];

  return steps.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const { step, count, error } = entry as Record<string, unknown>;
    if (typeof step !== 'string' || typeof count !== 'number') return [];
    return [{ step, count, error: typeof error === 'string' ? error : null }];
  });
}
