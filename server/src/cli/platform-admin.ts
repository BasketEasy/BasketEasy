/* eslint-disable no-console */
/**
 * Out-of-band provisioning for platform-admin grants.
 *
 * There is deliberately no "promote to admin" button anywhere in the product
 * and no in-app TOTP enrollment screen: an enrollment screen is a
 * self-service path to arming a grant, and the back-office design says grants
 * are provisioned out-of-band only. This script is that band — it needs
 * DATABASE_URL, i.e. an operator with shell access to the server.
 *
 * Compiled with the rest of `src`, so it ships in the server image. In
 * production, run it inside the running container, where DATABASE_URL and
 * PLATFORM_TOTP_ENCRYPTION_KEY are already set:
 *   docker compose exec server node server/dist/cli/platform-admin.js list
 *   docker compose exec server node server/dist/cli/platform-admin.js grant <email> <SUPPORT|DATA_OFFICER> [cidr,cidr|none]
 *   docker compose exec server node server/dist/cli/platform-admin.js unlock <email>
 *   docker compose exec server node server/dist/cli/platform-admin.js revoke <email>
 * In development, from server/: `pnpm exec ts-node src/cli/platform-admin.ts <command> ...`.
 *
 * `grant` prints the otpauth:// URI once. It is not stored anywhere else and
 * cannot be re-read afterwards — re-run `grant` to rotate the secret.
 * Re-running it keeps the grant's network allowlist unless a new one is
 * passed (`none` clears it): rotating a secret must not silently lift a
 * restriction. Every entry is validated first.
 *
 * `grant`, `revoke` and `unlock` each write an ADMIN_GRANT_CHANGED audit row
 * (actor `cli:<os user>`), so the highest-privilege change in the system
 * leaves the same in-app trace as a support action.
 *
 * `grant` also needs PLATFORM_TOTP_ENCRYPTION_KEY, the same value the server
 * runs with: the secret is written encrypted under it (totp-secret-crypto.ts).
 * A grant written under a different key simply fails to verify, so after
 * rotating that key every admin is re-granted.
 */
import { userInfo } from 'os';
import { PlatformRole, PrismaClient } from '@prisma/client';
import { buildOtpAuthUri, generateTotpSecret } from '../platform-admin/totp.util';
import { encryptTotpSecret, resolveTotpEncryptionKey } from '../platform-admin/totp-secret-crypto';
import { isValidCidrRule } from '../platform-admin/client-ip.util';

/** What the commands need from Prisma; a PrismaClient in production, a mock in the spec. */
type Db = Pick<PrismaClient, 'user' | 'platformAdmin' | 'auditLog' | '$transaction'>;
type Log = (line: string) => void;

export async function runCli(
  db: Db,
  argv: string[],
  env: NodeJS.ProcessEnv,
  log: Log = console.log,
): Promise<void> {
  const [command, ...args] = argv;

  switch (command) {
    case 'list':
      return list(db, log);
    case 'grant':
      return grant(db, env, log, args[0], args[1], args[2]);
    case 'unlock':
      return unlock(db, log, args[0]);
    case 'revoke':
      return revoke(db, log, args[0]);
    default:
      throw new Error(`Unknown command ${command ?? '(none)'}. See the header of this file.`);
  }
}

async function list(db: Db, log: Log): Promise<void> {
  const admins = await db.platformAdmin.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (admins.length === 0) {
    log('No platform admins.');
    return;
  }

  for (const admin of admins) {
    const locked = admin.lockedUntil && admin.lockedUntil > new Date() ? ' LOCKED' : '';
    const cidrs = admin.allowedCidrs.length > 0 ? ` cidrs=${admin.allowedCidrs.join(',')}` : '';
    // A grant with no secret cannot mint a step-up token, so it is inert
    // rather than dangerous — but it is worth seeing in the list.
    const armed = admin.totpSecret ? '' : ' NOT-ARMED';
    log(`${admin.user.email}\t${admin.role}${cidrs}${locked}${armed}`);
  }
}

/**
 * `undefined` = keep what the grant has; `none` = clear it; otherwise a
 * comma-separated list, every entry of which must parse.
 */
export function parseCidrArg(cidrList: string | undefined): string[] | undefined {
  if (cidrList === undefined) return undefined;
  if (cidrList.trim() === 'none') return [];
  const entries = cidrList
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const invalid = entries.filter((entry) => !isValidCidrRule(entry));
  if (invalid.length > 0 || entries.length === 0) {
    throw new Error(
      `Invalid network allowlist entr${invalid.length > 1 ? 'ies' : 'y'}: ${invalid.join(', ') || cidrList}. ` +
        'Use addresses or CIDRs (203.0.113.0/24), or `none` to clear.',
    );
  }
  return entries;
}

async function grant(
  db: Db,
  env: NodeJS.ProcessEnv,
  log: Log,
  email: string | undefined,
  role: string | undefined,
  cidrList?: string,
): Promise<void> {
  requireArg(email, 'email');
  if (!isPlatformRole(role)) {
    throw new Error(`role must be one of ${Object.values(PlatformRole).join(', ')}`);
  }
  const allowedCidrs = parseCidrArg(cidrList);

  const key = resolveTotpEncryptionKey(env.PLATFORM_TOTP_ENCRYPTION_KEY);
  if (!key) {
    throw new Error(
      "PLATFORM_TOTP_ENCRYPTION_KEY must be set to the server's value (32 bytes, base64).",
    );
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`No account with email ${email}`);
  }

  const plainSecret = generateTotpSecret();
  const totpSecret = encryptTotpSecret(plainSecret, key, user.id);

  const saved = await db.$transaction(async (tx) => {
    const grantRow = await tx.platformAdmin.upsert({
      where: { userId: user.id },
      // Re-granting rotates the secret rather than accumulating rows: the
      // @unique on userId means one grant per account, and rotation is the
      // remedy for a secret that may have leaked. The allowlist is only
      // touched when one was passed.
      create: { userId: user.id, role, totpSecret, allowedCidrs: allowedCidrs ?? [] },
      update: {
        role,
        totpSecret,
        lockedUntil: null,
        lastUsedTotpCounter: null,
        ...(allowedCidrs !== undefined ? { allowedCidrs } : {}),
      },
      select: { allowedCidrs: true },
    });
    await tx.auditLog.create({
      data: grantAuditRow('grant', user.id, email, { role, allowedCidrs: grantRow.allowedCidrs }),
    });
    return grantRow;
  });

  log(`Granted ${role} to ${email}.`);
  log(
    saved.allowedCidrs.length > 0
      ? `Network allowlist: ${saved.allowedCidrs.join(', ')}`
      : 'Network allowlist: none (any address).',
  );
  log('Enroll this in an authenticator app now — it is not shown again:');
  log(buildOtpAuthUri(plainSecret, email));
}

async function unlock(db: Db, log: Log, email: string | undefined): Promise<void> {
  requireArg(email, 'email');
  const count = await db.$transaction(async (tx) => {
    const result = await tx.platformAdmin.updateMany({
      where: { user: { email } },
      data: { lockedUntil: null },
    });
    await recordIfGranted(tx, result.count, 'unlock', email);
    return result.count;
  });
  log(count === 0 ? `No grant for ${email}.` : `Unlocked ${email}.`);
}

async function revoke(db: Db, log: Log, email: string | undefined): Promise<void> {
  requireArg(email, 'email');
  const count = await db.$transaction(async (tx) => {
    const result = await tx.platformAdmin.deleteMany({ where: { user: { email } } });
    await recordIfGranted(tx, result.count, 'revoke', email);
    return result.count;
  });
  log(count === 0 ? `No grant for ${email}.` : `Revoked ${email}.`);
}

async function recordIfGranted(
  tx: Parameters<Parameters<Db['$transaction']>[0]>[0],
  count: number,
  command: 'unlock' | 'revoke',
  email: string,
): Promise<void> {
  if (count === 0) return;
  const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    await tx.auditLog.create({ data: grantAuditRow(command, user.id, email) });
  }
}

function grantAuditRow(
  command: 'grant' | 'unlock' | 'revoke',
  subjectUserId: string,
  subjectEmail: string,
  details: { role?: PlatformRole; allowedCidrs?: string[] } = {},
) {
  return {
    type: 'ADMIN_GRANT_CHANGED' as const,
    userId: null,
    actorEmail: `cli:${operatorName()}`,
    metadata: { command, subjectUserId, subjectEmail, ...details },
  };
}

function operatorName(): string {
  try {
    return userInfo().username;
  } catch {
    return 'unknown';
  }
}

function requireArg(value: string | undefined, name: string): asserts value is string {
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
}

function isPlatformRole(value: string | undefined): value is PlatformRole {
  return value !== undefined && Object.values(PlatformRole).includes(value as PlatformRole);
}

// Only when run as a script, so the spec can import the commands.
if (require.main === module) {
  const prisma = new PrismaClient();
  runCli(prisma, process.argv.slice(2), process.env)
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
