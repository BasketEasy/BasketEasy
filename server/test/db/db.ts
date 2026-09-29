import { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * The Postgres-backed suite (`pnpm --filter @basketeasy/server test:db`).
 *
 * Unit specs mock Prisma, so nothing there can see an FK cascade, a
 * `FOR UPDATE` or a JSON-path filter. These tests run against a real,
 * migrated database named by DATABASE_URL — CI's `test-db` job starts one;
 * locally, `prisma migrate deploy` against any throwaway database. Every
 * table is truncated before each test.
 */
export const prisma = new PrismaClient();

export const asService = (client: PrismaClient) => client as unknown as PrismaService;

export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

let seq = 0;
const next = () => `${Date.now()}-${++seq}`;

export function createUser(email = `u-${next()}@example.org`) {
  return prisma.user.create({ data: { email, passwordHash: 'x' } });
}

export async function createClub(name = `Club ${next()}`) {
  return prisma.club.create({ data: { name } });
}

export async function createTeam(ownerClubId: string, partnerClubIds: string[] = []) {
  return prisma.team.create({
    data: {
      name: `Team ${next()}`,
      category: 'U15',
      gender: 'MEN',
      clubTeams: {
        create: [
          { clubId: ownerClubId, isOwner: true },
          ...partnerClubIds.map((clubId) => ({ clubId, isOwner: false })),
        ],
      },
    },
  });
}
