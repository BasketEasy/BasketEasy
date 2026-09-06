import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PlatformAdminService } from './platform-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RetentionService } from '../retention/retention.service';
import { PLATFORM_TOKEN_SCOPE, PLATFORM_LOGIN_MAX_ATTEMPTS } from './platform-admin.constants';
import { hotp, totpCounterAt } from './totp.util';

const SECRET = 'platform-secret-that-is-long-enough-for-hs256';
// RFC 4226's test secret, base32.
const TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

function currentCode(): string {
  return hotp(Buffer.from('12345678901234567890', 'ascii'), totpCounterAt(new Date()));
}

function buildRequest(remoteAddress = '203.0.113.7'): Request {
  return {
    headers: { 'user-agent': 'jest' },
    socket: { remoteAddress },
  } as unknown as Request;
}

describe('PlatformAdminService', () => {
  let service: PlatformAdminService;
  let jwt: JwtService;
  let audit: { record: jest.Mock; recordAndWait: jest.Mock };
  let retention: { eraseUserAccount: jest.Mock; run: jest.Mock; listRuns: jest.Mock };
  let prisma: {
    platformAdmin: { findUnique: jest.Mock; updateMany: jest.Mock };
    auditLog: { count: jest.Mock; create: jest.Mock; findMany: jest.Mock };
    user: { count: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    player: { findMany: jest.Mock };
    scoresheetExtraction: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  const grant = {
    userId: 'admin-1',
    role: 'DATA_OFFICER' as const,
    totpSecret: TOTP_SECRET,
    allowedCidrs: [] as string[],
    lockedUntil: null as Date | null,
  };

  beforeEach(async () => {
    audit = {
      record: jest.fn(),
      recordAndWait: jest.fn().mockResolvedValue(undefined),
    };
    retention = {
      eraseUserAccount: jest.fn().mockResolvedValue({ unlinkedPlayerCount: 2 }),
      run: jest.fn().mockResolvedValue({}),
      listRuns: jest.fn().mockResolvedValue([]),
    };
    prisma = {
      platformAdmin: {
        findUnique: jest.fn().mockResolvedValue({ ...grant }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      player: { findMany: jest.fn().mockResolvedValue([]) },
      scoresheetExtraction: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
        Promise.resolve(
          fn({
            auditLog: prisma.auditLog,
          }),
        ),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        PlatformAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(SECRET) } },
        { provide: AuditService, useValue: audit },
        { provide: RetentionService, useValue: retention },
      ],
    }).compile();

    service = module.get(PlatformAdminService);
    jwt = module.get(JwtService);
  });

  describe('login', () => {
    it('mints a scoped, account-bound step-up token for a valid code', async () => {
      const result = await service.login('admin-1', 'dpo@kluvo.net', currentCode(), buildRequest());

      const payload = await jwt.verifyAsync(result.platformAccessToken, { secret: SECRET });
      expect(payload).toMatchObject({ sub: 'admin-1', scope: PLATFORM_TOKEN_SCOPE });
      expect(result.role).toBe('DATA_OFFICER');
      expect(audit.recordAndWait).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ADMIN_LOGIN_SUCCESS', userId: 'admin-1' }),
      );
    });

    it('rejects a wrong code and audits the failure', async () => {
      await expect(
        service.login('admin-1', 'dpo@kluvo.net', '000000', buildRequest()),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(audit.recordAndWait).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ADMIN_LOGIN_FAILURE', metadata: { reason: 'bad_code' } }),
      );
    });

    it('answers a non-admin exactly as it answers a wrong code', async () => {
      // Otherwise the endpoint tells an attacker whose account they stole
      // whether it is worth continuing.
      prisma.platformAdmin.findUnique.mockResolvedValue(null);

      await expect(
        service.login('nobody-1', 'x@kluvo.net', currentCode(), buildRequest()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('locks the grant once the failures in the window reach the limit', async () => {
      prisma.auditLog.count.mockResolvedValue(PLATFORM_LOGIN_MAX_ATTEMPTS);

      await expect(
        service.login('admin-1', 'dpo@kluvo.net', '000000', buildRequest()),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const [[call]] = prisma.platformAdmin.updateMany.mock.calls;
      expect(call.where).toEqual({ userId: 'admin-1' });
      // "Until manually cleared" — a lock that expired on its own would be a
      // rate limit an attacker waits out.
      expect(call.data.lockedUntil.getUTCFullYear()).toBeGreaterThan(
        new Date().getUTCFullYear() + 50,
      );
    });

    it('does not lock while the failures stay under the limit', async () => {
      prisma.auditLog.count.mockResolvedValue(PLATFORM_LOGIN_MAX_ATTEMPTS - 1);

      await expect(
        service.login('admin-1', 'dpo@kluvo.net', '000000', buildRequest()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.platformAdmin.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a locked grant without spending an attempt', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue({
        ...grant,
        lockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(
        service.login('admin-1', 'dpo@kluvo.net', currentCode(), buildRequest()),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("will not even test the code from outside an allowlisted admin's network", async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue({
        ...grant,
        allowedCidrs: ['203.0.113.0/24'],
      });

      await expect(
        service.login('admin-1', 'dpo@kluvo.net', currentCode(), buildRequest('198.51.100.9')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(audit.recordAndWait).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { reason: 'ip_not_allowed' } }),
      );
    });
  });

  describe('listInactiveSoonUsers', () => {
    it('returns the domain only, never the address or a name', async () => {
      const lastActiveAt = new Date(Date.now() - 350 * 24 * 60 * 60 * 1000);
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'user-9',
          email: 'jean.dupont@example.org',
          lastActiveAt,
          _count: { memberships: 2 },
        },
      ]);

      const result = await service.listInactiveSoonUsers(1, 25);

      expect(result.items[0]).toEqual({
        id: 'user-9',
        emailDomain: 'example.org',
        lastActiveAt: lastActiveAt.toISOString(),
        daysUntilErasure: expect.any(Number),
        clubCount: 2,
      });
      expect(JSON.stringify(result)).not.toContain('jean.dupont');
    });

    it('includes accounts already past the cutoff, with a negative countdown', async () => {
      const lastActiveAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-9', email: 'a@b.fr', lastActiveAt, _count: { memberships: 0 } },
      ]);

      const result = await service.listInactiveSoonUsers(1, 25);

      expect(result.items[0].daysUntilErasure).toBeLessThan(0);
    });
  });

  describe('getUserDetail', () => {
    const subject = {
      id: 'user-9',
      email: 'jean@example.org',
      firstName: 'Jean',
      lastName: 'Dupont',
      emailVerifiedAt: new Date(),
      lastActiveAt: new Date(),
      createdAt: new Date(),
      memberships: [{ role: 'MEMBER', club: { id: 'club-1', name: 'BC Nantes' } }],
      linkedPlayers: [
        { id: 'p-1', firstName: 'Jean', lastName: 'Dupont', club: { name: 'BC Nantes' } },
      ],
    };

    it('writes ADMIN_PII_VIEWED naming the subject before returning the profile', async () => {
      prisma.user.findUnique.mockResolvedValue(subject);

      const detail = await service.getUserDetail(
        'admin-1',
        'dpo@kluvo.net',
        'user-9',
        buildRequest(),
      );

      expect(detail.email).toBe('jean@example.org');
      expect(detail.emailVerified).toBe(true);
      expect(audit.recordAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ADMIN_PII_VIEWED',
          // The acting admin on the row; the subject in metadata.
          userId: 'admin-1',
          metadata: { subjectUserId: 'user-9', subjectEmail: 'jean@example.org' },
          // The stricter back-office IP resolution, not Express's req.ip:
          // the same value gates the per-admin network allowlist.
          context: { ipAddress: '203.0.113.7', userAgent: 'jest' },
        }),
      );
    });

    it('does not audit a view of an account that does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getUserDetail('admin-1', 'dpo@kluvo.net', 'ghost', buildRequest()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.recordAndWait).not.toHaveBeenCalled();
    });
  });

  describe('eraseUser', () => {
    it('erases through RetentionService and records the reason in the same transaction', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'jean@example.org' });

      const result = await service.eraseUser(
        'admin-1',
        'dpo@kluvo.net',
        'user-9',
        'DSAR erasure request #42 received 2026-09-01',
        buildRequest(),
      );

      expect(result).toEqual({ erasedUserId: 'user-9', unlinkedPlayerCount: 2 });
      expect(retention.eraseUserAccount).toHaveBeenCalledWith(expect.anything(), 'user-9');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'ADMIN_USER_ERASED',
          userId: 'admin-1',
          metadata: expect.objectContaining({
            subjectUserId: 'user-9',
            // Denormalised: the row has to still say whose data was erased
            // once the account no longer exists.
            subjectEmail: 'jean@example.org',
            reason: 'DSAR erasure request #42 received 2026-09-01',
          }),
        }),
      });
    });

    it('refuses to erase the acting admin, which would revoke the grant mid-request', async () => {
      await expect(
        service.eraseUser('admin-1', 'dpo@kluvo.net', 'admin-1', 'a valid reason', buildRequest()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(retention.eraseUserAccount).not.toHaveBeenCalled();
    });

    it('404s on an unknown account rather than writing an erasure row', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.eraseUser('admin-1', 'dpo@kluvo.net', 'ghost', 'a valid reason', buildRequest()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('exportUser', () => {
    const SUBJECT = 'user-9';

    const subjectAccount = {
      id: SUBJECT,
      email: 'jean@example.org',
      firstName: 'Jean',
      lastName: 'Dupont',
      avatarUrl: null,
      emailVerifiedAt: new Date('2025-01-02T00:00:00.000Z'),
      emailNotificationsEnabled: true,
      lastActiveAt: new Date('2025-09-20T10:00:00.000Z'),
      createdAt: new Date('2024-01-05T09:00:00.000Z'),
      memberships: [
        {
          role: 'MEMBER',
          createdAt: new Date('2024-01-05T09:00:00.000Z'),
          club: { name: 'ASC Nantes' },
        },
      ],
      notifications: [],
      pushSubscriptions: [],
    };

    function mockSubject(overrides: Record<string, unknown> = {}) {
      prisma.user.findUnique.mockResolvedValue({ ...subjectAccount, ...overrides });
    }

    it('records the reason on an ADMIN_EXPORT_GENERATED row, not ADMIN_PII_VIEWED', async () => {
      // The two are different disclosures with different scopes; folding one
      // into the other makes a DPO's "who saw what" filter wrong both ways.
      mockSubject();

      const result = await service.exportUser(
        'admin-1',
        'dpo@kluvo.net',
        SUBJECT,
        'Demande d’accès RGPD #7',
        buildRequest(),
      );

      expect(result.subjectUserId).toBe(SUBJECT);
      expect(result.account.email).toBe('jean@example.org');
      expect(audit.recordAndWait).toHaveBeenCalledTimes(1);
      expect(audit.recordAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ADMIN_EXPORT_GENERATED',
          userId: 'admin-1',
          metadata: {
            subjectUserId: SUBJECT,
            subjectEmail: 'jean@example.org',
            reason: 'Demande d’accès RGPD #7',
          },
        }),
      );
    });

    it('404s on an unknown account without writing an audit row', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.exportUser('admin-1', 'dpo@kluvo.net', 'ghost', 'a valid reason', buildRequest()),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.recordAndWait).not.toHaveBeenCalled();
    });

    it('lists a vote without the player it named (art. 15.4)', async () => {
      // Peer voting is anonymous by construction. The subject's own vote is
      // theirs; who they named is a statement about another player.
      mockSubject();
      prisma.player.findMany.mockResolvedValue([
        {
          club: { name: 'ASC Nantes' },
          firstName: 'Jean',
          lastName: 'Dupont',
          birthDate: null,
          gender: null,
          licenseNumber: null,
          licenseType: null,
          nationalId: null,
          createdAt: new Date('2024-01-05T09:00:00.000Z'),
          teamPlayers: [
            {
              team: { name: 'Seniors M', clubTeams: [{ club: { name: 'ASC Nantes' } }] },
              role: 'PLAYER',
              createdAt: new Date('2024-01-06T09:00:00.000Z'),
              rsvps: [],
              convocations: [],
              matchStats: [],
              votesCast: [
                {
                  category: 'WORST',
                  createdAt: new Date('2025-03-14T20:00:00.000Z'),
                  votedTeamPlayerId: 'tp-victim',
                  event: { startsAt: new Date('2025-03-14T18:00:00.000Z') },
                },
              ],
              uploadedScoresheets: [],
              jerseysAssignedEvents: [{ startsAt: new Date('2025-03-14T18:00:00.000Z') }],
              ballsAssignedEvents: [],
            },
          ],
        },
      ]);

      const result = await service.exportUser(
        'admin-1',
        'dpo@kluvo.net',
        SUBJECT,
        'a valid reason',
        buildRequest(),
      );

      const roster = result.playerRecords[0].rosterEntries[0];
      expect(roster.votesCast).toEqual([
        {
          eventStartsAt: '2025-03-14T18:00:00.000Z',
          category: 'WORST',
          castAt: '2025-03-14T20:00:00.000Z',
        },
      ]);
      expect(JSON.stringify(result)).not.toContain('tp-victim');
      // Logistics duties are processing about this person, so they are in.
      expect(roster.logisticsAssignments).toEqual([
        { eventStartsAt: '2025-03-14T18:00:00.000Z', duty: 'JERSEYS' },
      ]);
    });

    it('dates an admin action on the subject without naming the admin (art. 15.4)', async () => {
      mockSubject();
      prisma.auditLog.findMany.mockResolvedValue([
        {
          type: 'LOGIN_SUCCESS',
          userId: SUBJECT,
          actorEmail: 'jean@example.org',
          ipAddress: '203.0.113.7',
          createdAt: new Date('2025-09-20T10:00:00.000Z'),
        },
        {
          type: 'ADMIN_PII_VIEWED',
          userId: 'admin-1',
          actorEmail: 'dpo@kluvo.net',
          ipAddress: '198.51.100.2',
          createdAt: new Date('2026-09-01T08:00:00.000Z'),
        },
      ]);

      const result = await service.exportUser(
        'admin-1',
        'dpo@kluvo.net',
        SUBJECT,
        'a valid reason',
        buildRequest(),
      );

      expect(result.securityLog).toEqual([
        {
          type: 'LOGIN_SUCCESS',
          createdAt: '2025-09-20T10:00:00.000Z',
          ipAddress: '203.0.113.7',
          actedByThisPerson: true,
        },
        {
          type: 'ADMIN_PII_VIEWED',
          createdAt: '2026-09-01T08:00:00.000Z',
          // The subject learns their data was accessed, not by whom.
          ipAddress: null,
          actedByThisPerson: false,
        },
      ]);
      expect(JSON.stringify(result.securityLog)).not.toContain('dpo@kluvo.net');
      expect(JSON.stringify(result.securityLog)).not.toContain('198.51.100.2');
    });

    it('lists a push subscription without its endpoint or keys', async () => {
      // endpoint + p256dh + auth together are a live capability to push to
      // that browser, not a description of the person.
      mockSubject({
        pushSubscriptions: [
          {
            endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
            p256dh: 'p256dh-key',
            auth: 'auth-key',
            userAgent: 'Firefox/141',
            createdAt: new Date('2025-06-01T09:00:00.000Z'),
          },
        ],
      });

      const result = await service.exportUser(
        'admin-1',
        'dpo@kluvo.net',
        SUBJECT,
        'a valid reason',
        buildRequest(),
      );

      expect(result.pushSubscriptions).toEqual([
        { userAgent: 'Firefox/141', createdAt: '2025-06-01T09:00:00.000Z' },
      ]);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('fcm.googleapis.com');
      expect(serialized).not.toContain('p256dh-key');
      expect(serialized).not.toContain('auth-key');
    });

    it('carries a notice naming each deliberate omission', async () => {
      // An omission a recipient can't see reads as an oversight.
      mockSubject();

      const result = await service.exportUser(
        'admin-1',
        'dpo@kluvo.net',
        SUBJECT,
        'a valid reason',
        buildRequest(),
      );

      expect(result.notice.basis).toContain('article');
      expect(result.notice.omissions).toHaveLength(3);
    });
  });

  describe('listAuditLog', () => {
    it('matches rows the account acted as AND rows it was acted on', async () => {
      // Filtering on either alone answers only half of "who accessed this
      // person's data".
      await service.listAuditLog('user-9', 1, 25);

      expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
        OR: [{ userId: 'user-9' }, { metadata: { path: ['subjectUserId'], equals: 'user-9' } }],
      });
    });

    it('lists everything when no subject is given', async () => {
      await service.listAuditLog(undefined, 1, 25);
      expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({});
    });
  });
});
