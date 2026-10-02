import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PlatformAdminImpersonationService } from '../../src/platform-admin/platform-admin-impersonation.service';
import { asService, createUser, prisma, resetDb } from './db';

const request = { headers: {}, socket: { remoteAddress: '203.0.113.7' } } as unknown as Request;

describe('impersonation start under concurrency (Postgres)', () => {
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
  const config = { get: () => 'a-platform-secret-that-is-long-enough-0123456789abcdef' };
  const service = new PlatformAdminImpersonationService(
    asService(prisma),
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
  );

  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it('leaves one live session when an admin starts two at once', async () => {
    const staff = await createUser('dpo@kluvo.net');
    await prisma.platformAdmin.create({ data: { userId: staff.id, role: 'DATA_OFFICER' } });
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const actor = { userId: staff.id, email: staff.email };

    const outcomes = await Promise.allSettled([
      service.start(actor, a.id, 'Demande de support A', request),
      service.start(actor, b.id, 'Demande de support B', request),
    ]);

    expect(outcomes.every((o) => o.status === 'fulfilled')).toBe(true);
    const live = await prisma.impersonationSession.findMany({
      where: { actorUserId: staff.id, endedAt: null },
    });
    expect(live).toHaveLength(1);
    expect(
      await prisma.impersonationSession.count({
        where: { actorUserId: staff.id, endReason: 'REPLACED' },
      }),
    ).toBe(1);
  });
});
