/* eslint-disable no-console */
/**
 * Out-of-band provisioning for platform-admin grants.
 *
 * There is deliberately no "promote to admin" button anywhere in the product
 * and no in-app TOTP enrollment screen: an enrollment screen is a
 * self-service path to arming a grant, and the back-office design says grants
 * are provisioned out-of-band only. This script is that band — it needs
 * DATABASE_URL, i.e. an operator who already has database access.
 *
 * Usage (from server/):
 *   pnpm exec ts-node scripts/platform-admin.ts list
 *   pnpm exec ts-node scripts/platform-admin.ts grant <email> <SUPPORT|DATA_OFFICER> [cidr,cidr]
 *   pnpm exec ts-node scripts/platform-admin.ts unlock <email>
 *   pnpm exec ts-node scripts/platform-admin.ts revoke <email>
 *
 * `grant` prints the otpauth:// URI once. It is not stored anywhere else and
 * cannot be re-read afterwards — re-run `grant` to rotate the secret.
 */
import { PlatformRole, PrismaClient } from '@prisma/client';
import { buildOtpAuthUri, generateTotpSecret } from '../src/platform-admin/totp.util';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'list':
      return list();
    case 'grant':
      return grant(args[0], args[1], args[2]);
    case 'unlock':
      return unlock(args[0]);
    case 'revoke':
      return revoke(args[0]);
    default:
      throw new Error(`Unknown command ${command ?? '(none)'}. See the header of this file.`);
  }
}

async function list(): Promise<void> {
  const admins = await prisma.platformAdmin.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (admins.length === 0) {
    console.log('No platform admins.');
    return;
  }

  for (const admin of admins) {
    const locked = admin.lockedUntil && admin.lockedUntil > new Date() ? ' LOCKED' : '';
    const cidrs = admin.allowedCidrs.length > 0 ? ` cidrs=${admin.allowedCidrs.join(',')}` : '';
    // A grant with no secret cannot mint a step-up token, so it is inert
    // rather than dangerous — but it is worth seeing in the list.
    const armed = admin.totpSecret ? '' : ' NOT-ARMED';
    console.log(`${admin.user.email}\t${admin.role}${cidrs}${locked}${armed}`);
  }
}

async function grant(email: string, role: string, cidrList?: string): Promise<void> {
  requireArg(email, 'email');
  if (!isPlatformRole(role)) {
    throw new Error(`role must be one of ${Object.values(PlatformRole).join(', ')}`);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`No account with email ${email}`);
  }

  const totpSecret = generateTotpSecret();
  const allowedCidrs = cidrList
    ? cidrList
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  await prisma.platformAdmin.upsert({
    where: { userId: user.id },
    // Re-granting rotates the secret rather than accumulating rows: the
    // @unique on userId means one grant per account, and rotation is the
    // remedy for a secret that may have leaked.
    create: { userId: user.id, role, totpSecret, allowedCidrs },
    update: { role, totpSecret, allowedCidrs, lockedUntil: null },
  });

  console.log(`Granted ${role} to ${email}.`);
  console.log('Enroll this in an authenticator app now — it is not shown again:');
  console.log(buildOtpAuthUri(totpSecret, email));
}

async function unlock(email: string): Promise<void> {
  requireArg(email, 'email');
  const { count } = await prisma.platformAdmin.updateMany({
    where: { user: { email } },
    data: { lockedUntil: null },
  });
  console.log(count === 0 ? `No grant for ${email}.` : `Unlocked ${email}.`);
}

async function revoke(email: string): Promise<void> {
  requireArg(email, 'email');
  const { count } = await prisma.platformAdmin.deleteMany({ where: { user: { email } } });
  console.log(count === 0 ? `No grant for ${email}.` : `Revoked ${email}.`);
}

function requireArg(value: string | undefined, name: string): asserts value is string {
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
}

function isPlatformRole(value: string | undefined): value is PlatformRole {
  return value !== undefined && Object.values(PlatformRole).includes(value as PlatformRole);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
