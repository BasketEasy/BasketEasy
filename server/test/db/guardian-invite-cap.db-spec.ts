import type { ConfigService } from '@nestjs/config';
import { MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER } from '@basketeasy/types/guardians';
import { GuardiansService } from '../../src/guardians/guardians.service';
import type { AuthService } from '../../src/auth/auth.service';
import type { AccountSecurityService } from '../../src/auth/account-security.service';
import type { AuditService } from '../../src/audit/audit.service';
import { asService, createClub, createUser, prisma, resetDb } from './db';

describe('guardian invite cap under concurrency (Postgres)', () => {
  const service = new GuardiansService(
    asService(prisma),
    { get: () => undefined } as unknown as ConfigService,
    {} as AuthService,
    {} as AccountSecurityService,
    { record: jest.fn() } as unknown as AuditService,
  );

  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it('lets exactly the cap of simultaneous invites through for one player', async () => {
    const club = await createClub();
    const admin = await createUser();
    const player = await prisma.player.create({
      data: { clubId: club.id, firstName: 'Léo', lastName: 'Martin' },
    });
    const attempts = MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER + 3;

    const outcomes = await Promise.allSettled(
      Array.from({ length: attempts }, () => service.createInvite(club.id, player.id, admin.id)),
    );

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(
      MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER,
    );
    expect(await prisma.guardianInvite.count({ where: { playerId: player.id } })).toBe(
      MAX_PENDING_GUARDIAN_INVITES_PER_PLAYER,
    );
  });
});
