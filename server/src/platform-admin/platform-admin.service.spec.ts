import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PlatformAdminService } from './platform-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RetentionService } from '../retention/retention.service';
import { PLATFORM_TOKEN_SCOPE, PLATFORM_LOGIN_MAX_ATTEMPTS } from './platform-admin.constants';
import { hotp, totpCounterAt } from './totp.util';
import { encryptTotpSecret } from './totp-secret-crypto';

const SECRET = 'platform-secret-that-is-long-enough-for-hs256';
// RFC 4226's test secret, base32.
const TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const TOTP_KEY = Buffer.alloc(32, 7);

function configValue(key: string): string | undefined {
  if (key === 'PLATFORM_TOTP_ENCRYPTION_KEY') return TOTP_KEY.toString('base64');
  return SECRET;
}

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
    platformAdmin: { findUnique: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
    auditLog: { count: jest.Mock; create: jest.Mock; findMany: jest.Mock };
    user: { count: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    player: { findMany: jest.Mock };
    scoresheetExtraction: { findMany: jest.Mock };
    eventRsvp: { findMany: jest.Mock };
    parentalConsent: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };

  const grant = {
    userId: 'admin-1',
    role: 'DATA_OFFICER' as const,
    totpSecret: encryptTotpSecret(TOTP_SECRET, TOTP_KEY, 'admin-1'),
    allowedCidrs: [] as string[],
    lockedUntil: null as Date | null,
    lastUsedTotpCounter: null as number | null,
  };
  let config: { get: jest.Mock };

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
    config = { get: jest.fn(configValue) };
    prisma = {
      platformAdmin: {
        findUnique: jest.fn().mockResolvedValue({ ...grant }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
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
      eventRsvp: { findMany: jest.fn().mockResolvedValue([]) },
      parentalConsent: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      // The transaction client is the same mock: what matters is which calls
      // the service makes through it, not isolation.
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => unknown) => Promise.resolve(fn(prisma))),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        PlatformAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: AuditService, useValue: audit },
        { provide: RetentionService, useValue: retention },
      ],
    }).compile();

    service = module.get(PlatformAdminService);
    jwt = module.get(JwtService);
  });

  describe('login', () => {
    function auditRows(type: string) {
      return prisma.auditLog.create.mock.calls
        .map(([arg]) => arg.data)
        .filter((data) => data.type === type);
    }

    it('mints a scoped, account-bound step-up token for a valid code', async () => {
      const result = await service.login('admin-1', 'dpo@kluvo.net', currentCode(), buildRequest());

      const payload = await jwt.verifyAsync(result.platformAccessToken, { secret: SECRET });
      expect(payload).toMatchObject({ sub: 'admin-1', scope: PLATFORM_TOKEN_SCOPE });
      expect(result.role).toBe('DATA_OFFICER');
      expect(auditRows('ADMIN_LOGIN_SUCCESS')).toEqual([
        expect.objectContaining({ userId: 'admin-1', metadata: { role: 'DATA_OFFICER' } }),
      ]);
    });

    it('evaluates the attempt under a row lock on the grant', async () => {
      // Serialises concurrent guesses, so each sees the failures the previous
      // one committed and the lockout lands on exactly the fifth.
      await service.login('admin-1', 'dpo@kluvo.net', currentCode(), buildRequest());

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [sql] = prisma.$queryRaw.mock.calls[0] as [TemplateStringsArray];
      expect(sql.join('?')).toContain('FOR UPDATE');
    });

    it('records the accepted step and refuses the same code a second time', async () => {
      const code = currentCode();
      await service.login('admin-1', 'dpo@kluvo.net', code, buildRequest());

      const [[update]] = prisma.platformAdmin.update.mock.calls;
      const acceptedStep = update.data.lastUsedTotpCounter;
      expect(acceptedStep).toBe(totpCounterAt(new Date()));

      prisma.platformAdmin.findUnique.mockResolvedValue({
        ...grant,
        lastUsedTotpCounter: acceptedStep,
      });
      await expect(
        service.login('admin-1', 'dpo@kluvo.net', code, buildRequest()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auditRows('ADMIN_LOGIN_FAILURE')).toEqual([
        expect.objectContaining({ metadata: { reason: 'replayed_code' } }),
      ]);
    });

    it('refuses an older still-valid code once a newer one was accepted', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue({
        ...grant,
        lastUsedTotpCounter: totpCounterAt(new Date()) + 1,
      });

      await expect(
        service.login('admin-1', 'dpo@kluvo.net', currentCode(), buildRequest()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong code and audits the failure', async () => {
      await expect(
        service.login('admin-1', 'dpo@kluvo.net', '000000', buildRequest()),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(auditRows('ADMIN_LOGIN_FAILURE')).toEqual([
        expect.objectContaining({ userId: 'admin-1', metadata: { reason: 'bad_code' } }),
      ]);
      // Written through the transaction and committed despite the refusal:
      // the service returns out of the transaction before throwing.
      expect(prisma.platformAdmin.update).not.toHaveBeenCalled();
    });

    it('answers a non-admin exactly as it answers a wrong code', async () => {
      // Otherwise the endpoint tells an attacker whose account they stole
      // whether it is worth continuing.
      prisma.platformAdmin.findUnique.mockResolvedValue(null);

      await expect(
        service.login('nobody-1', 'x@kluvo.net', currentCode(), buildRequest()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(auditRows('ADMIN_LOGIN_FAILURE')).toEqual([
        expect.objectContaining({ metadata: { reason: 'no_grant' } }),
      ]);
    });

    it('throttles any caller past the limit, without writing another row', async () => {
      // Bounds what one logged-in account can write to the security log.
      prisma.platformAdmin.findUnique.mockResolvedValue(null);
      prisma.auditLog.count.mockResolvedValue(PLATFORM_LOGIN_MAX_ATTEMPTS);

      const attempt = service.login('nobody-1', 'x@kluvo.net', '000000', buildRequest());

      await expect(attempt).rejects.toBeInstanceOf(HttpException);
      await expect(attempt).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('locks the grant on the failure that reaches the limit', async () => {
      prisma.auditLog.count
        .mockResolvedValueOnce(PLATFORM_LOGIN_MAX_ATTEMPTS - 1)
        .mockResolvedValueOnce(PLATFORM_LOGIN_MAX_ATTEMPTS);

      await expect(
        service.login('admin-1', 'dpo@kluvo.net', '000000', buildRequest()),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const [[call]] = prisma.platformAdmin.update.mock.calls;
      expect(call.where).toEqual({ userId: 'admin-1' });
      // "Until manually cleared" — a lock that expired on its own would be a
      // rate limit an attacker waits out.
      expect(call.data.lockedUntil.getUTCFullYear()).toBeGreaterThan(
        new Date().getUTCFullYear() + 50,
      );
    });

    it('does not lock while the failures stay under the limit', async () => {
      prisma.auditLog.count.mockResolvedValue(PLATFORM_LOGIN_MAX_ATTEMPTS - 2);

      await expect(
        service.login('admin-1', 'dpo@kluvo.net', '000000', buildRequest()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.platformAdmin.update).not.toHaveBeenCalled();
    });

    it('refuses a locked grant without spending an attempt', async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue({
        ...grant,
        lockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(
        service.login('admin-1', 'dpo@kluvo.net', currentCode(), buildRequest()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it("will not even test the code from outside an allowlisted admin's network", async () => {
      prisma.platformAdmin.findUnique.mockResolvedValue({
        ...grant,
        allowedCidrs: ['203.0.113.0/24'],
      });

      await expect(
        service.login('admin-1', 'dpo@kluvo.net', currentCode(), buildRequest('198.51.100.9')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(auditRows('ADMIN_LOGIN_FAILURE')).toEqual([
        expect.objectContaining({ metadata: { reason: 'ip_not_allowed' } }),
      ]);
    });

    it('fails closed on a secret that does not decrypt, without locking the grant', async () => {
      // A plaintext value from before encryption, a wrong key, or a row
      // copied from another admin: all an operator problem, fixed by re-granting.
      for (const totpSecret of [
        TOTP_SECRET,
        encryptTotpSecret(TOTP_SECRET, Buffer.alloc(32, 9), 'admin-1'),
        encryptTotpSecret(TOTP_SECRET, TOTP_KEY, 'someone-else'),
      ]) {
        prisma.platformAdmin.findUnique.mockResolvedValue({ ...grant, totpSecret });
        prisma.auditLog.count.mockResolvedValue(PLATFORM_LOGIN_MAX_ATTEMPTS - 1);

        await expect(
          service.login('admin-1', 'dpo@kluvo.net', currentCode(), buildRequest()),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
      expect(auditRows('ADMIN_LOGIN_FAILURE')).toHaveLength(3);
      expect(
        auditRows('ADMIN_LOGIN_FAILURE').every(
          (row) => row.metadata.reason === 'secret_unreadable',
        ),
      ).toBe(true);
      expect(prisma.platformAdmin.update).not.toHaveBeenCalled();
    });

    it('is off (503) without a usable encryption key', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'PLATFORM_TOTP_ENCRYPTION_KEY' ? 'too-short' : SECRET,
      );

      await expect(
        service.login('admin-1', 'dpo@kluvo.net', currentCode(), buildRequest()),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
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

    it('refuses to erase another platform admin', async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: 'ops@kluvo.net',
        platformAdmin: { userId: 'admin-2' },
      });

      await expect(
        service.eraseUser('admin-1', 'dpo@kluvo.net', 'admin-2', 'a valid reason', buildRequest()),
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
      teamAdmins: [],
      guardianOf: [],
      guardianInvitesAccepted: [],
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
        {
          // A reset link staff sent: the subject's userId, not their act.
          type: 'PASSWORD_RESET_REQUESTED',
          userId: SUBJECT,
          actorEmail: 'jean@example.org',
          ipAddress: null,
          metadata: { requestedByStaff: true },
          createdAt: new Date('2026-09-02T08:00:00.000Z'),
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
        {
          type: 'PASSWORD_RESET_REQUESTED',
          createdAt: '2026-09-02T08:00:00.000Z',
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
      expect(result.notice.omissions).toHaveLength(4);
    });

    function playerWithRsvp(rsvp: Record<string, unknown>) {
      return {
        club: { name: 'ASC Nantes' },
        firstName: 'Léo',
        lastName: 'Martin',
        birthDate: new Date('2014-05-01T00:00:00.000Z'),
        gender: null,
        licenseNumber: null,
        licenseType: null,
        nationalId: null,
        createdAt: new Date('2024-01-05T09:00:00.000Z'),
        teamPlayers: [
          {
            team: { name: 'U13 M', clubTeams: [{ club: { name: 'ASC Nantes' } }] },
            role: 'PLAYER',
            createdAt: new Date('2024-01-06T09:00:00.000Z'),
            rsvps: [
              {
                status: 'GOING',
                travelMode: 'DIRECT',
                respondedAt: new Date('2025-03-10T20:00:00.000Z'),
                event: { startsAt: new Date('2025-03-14T18:00:00.000Z') },
                ...rsvp,
              },
            ],
            convocations: [],
            matchStats: [],
            votesCast: [],
            uploadedScoresheets: [],
            jerseysAssignedEvents: [],
            ballsAssignedEvents: [],
          },
        ],
      };
    }

    it('flags an answer a parent gave for the subject without naming the parent (art. 15.4)', async () => {
      mockSubject();
      prisma.player.findMany.mockResolvedValue([
        playerWithRsvp({ respondedByUserId: 'guardian-user-42' }),
      ]);

      const result = await service.exportUser(
        'admin-1',
        'dpo@kluvo.net',
        SUBJECT,
        'a valid reason',
        buildRequest(),
      );

      expect(result.playerRecords[0].rosterEntries[0].rsvps).toEqual([
        {
          eventStartsAt: '2025-03-14T18:00:00.000Z',
          status: 'GOING',
          travelMode: 'DIRECT',
          respondedAt: '2025-03-10T20:00:00.000Z',
          respondedBy: 'SOMEONE_ELSE',
        },
      ]);
      expect(JSON.stringify(result)).not.toContain('guardian-user-42');
    });

    it("tells the subject's own answers apart from unknown responders", async () => {
      mockSubject();
      prisma.player.findMany.mockResolvedValue([
        playerWithRsvp({ respondedByUserId: SUBJECT }),
        playerWithRsvp({ respondedByUserId: null }),
      ]);

      const result = await service.exportUser(
        'admin-1',
        'dpo@kluvo.net',
        SUBJECT,
        'a valid reason',
        buildRequest(),
      );

      expect(result.playerRecords.map((p) => p.rosterEntries[0].rsvps[0].respondedBy)).toEqual([
        'SELF',
        'UNKNOWN',
      ]);
    });

    it("lists a parent's own guardian activity, naming the child but nothing else of theirs", async () => {
      mockSubject({
        guardianOf: [
          {
            createdAt: new Date('2026-09-28T08:00:00.000Z'),
            player: { firstName: 'Léo', lastName: 'Martin', club: { name: 'ASC Nantes' } },
          },
        ],
        guardianInvitesAccepted: [
          {
            acceptedAt: new Date('2026-09-28T08:00:00.000Z'),
            player: { firstName: 'Léo' },
          },
        ],
      });
      prisma.eventRsvp.findMany.mockResolvedValue([
        {
          status: 'NOT_GOING',
          travelMode: 'MEETING_POINT',
          respondedAt: new Date('2026-09-29T19:00:00.000Z'),
          event: { startsAt: new Date('2026-10-04T14:00:00.000Z') },
          teamPlayer: { player: { firstName: 'Léo' } },
        },
      ]);

      const result = await service.exportUser(
        'admin-1',
        'dpo@kluvo.net',
        SUBJECT,
        'a valid reason',
        buildRequest(),
      );

      expect(result.guardian).toEqual({
        children: [
          {
            firstName: 'Léo',
            lastName: 'Martin',
            clubName: 'ASC Nantes',
            linkedAt: '2026-09-28T08:00:00.000Z',
          },
        ],
        invitesAccepted: [{ childFirstName: 'Léo', acceptedAt: '2026-09-28T08:00:00.000Z' }],
        answersGivenForOthers: [
          {
            childFirstName: 'Léo',
            eventStartsAt: '2026-10-04T14:00:00.000Z',
            status: 'NOT_GOING',
            travelMode: 'MEETING_POINT',
            respondedAt: '2026-09-29T19:00:00.000Z',
          },
        ],
      });
      // The subject's own roster slots are already under playerRecords; the
      // query must not count them twice as "for someone else".
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            respondedByUserId: SUBJECT,
            teamPlayer: {
              player: { OR: [{ userId: null }, { userId: { not: SUBJECT } }] },
            },
          },
        }),
      );
    });

    it('lists parental consents given and received without the minor’s birth date or the attester', async () => {
      mockSubject();
      prisma.parentalConsent.findMany
        .mockResolvedValueOnce([
          {
            source: 'GUARDIAN_IN_APP',
            club: { name: 'ASC Nantes' },
            playerFirstName: 'Léo',
            playerLastName: 'Martin',
            playerBirthDate: new Date('2014-05-01T00:00:00.000Z'),
            attestedByName: 'Jean Dupont',
            consentGivenAt: new Date('2026-09-28T08:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            source: 'STAFF_ATTESTATION',
            club: { name: 'ASC Nantes' },
            playerFirstName: 'Jean',
            playerLastName: 'Dupont',
            playerBirthDate: new Date('1990-01-01T00:00:00.000Z'),
            attestedByName: 'Marie Coach',
            consentGivenAt: new Date('2004-09-01T08:00:00.000Z'),
          },
        ]);

      const result = await service.exportUser(
        'admin-1',
        'dpo@kluvo.net',
        SUBJECT,
        'a valid reason',
        buildRequest(),
      );

      expect(result.parentalConsents).toEqual({
        given: [
          {
            source: 'GUARDIAN_IN_APP',
            clubName: 'ASC Nantes',
            minorFirstName: 'Léo',
            minorLastName: 'Martin',
            consentGivenAt: '2026-09-28T08:00:00.000Z',
          },
        ],
        aboutThisPerson: [
          {
            source: 'STAFF_ATTESTATION',
            clubName: 'ASC Nantes',
            consentGivenAt: '2004-09-01T08:00:00.000Z',
          },
        ],
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('2014-05-01');
      expect(serialized).not.toContain('Marie Coach');
    });

    it('includes team-level manager grants and which child a notification is about', async () => {
      mockSubject({
        teamAdmins: [
          { createdAt: new Date('2025-08-01T08:00:00.000Z'), team: { name: 'Seniors M' } },
        ],
        notifications: [
          {
            type: 'EVENT_MEETING_FIXED',
            title: 'RDV fixé',
            body: 'Samedi 13:15 au gymnase',
            subjectFirstName: 'Léo',
            createdAt: new Date('2026-10-01T08:00:00.000Z'),
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

      expect(result.teamAdminGrants).toEqual([
        { teamName: 'Seniors M', grantedAt: '2025-08-01T08:00:00.000Z' },
      ]);
      expect(result.notifications[0]).toEqual({
        type: 'EVENT_MEETING_FIXED',
        title: 'RDV fixé',
        body: 'Samedi 13:15 au gymnase',
        aboutFirstName: 'Léo',
        createdAt: '2026-10-01T08:00:00.000Z',
      });
    });
  });

  describe('listAuditLog', () => {
    const dpo = { id: 'admin-1', email: 'dpo@kluvo.net' };
    const list = (filter: Parameters<PlatformAdminService['listAuditLog']>[1]) =>
      service.listAuditLog(dpo, filter, 1, 25, buildRequest());
    const userClause = {
      OR: [
        { userId: 'user-9' },
        { metadata: { path: ['subjectUserId'], equals: 'user-9' } },
        { metadata: { path: ['disclosedUserIds'], array_contains: ['user-9'] } },
      ],
    };
    const playerClause = {
      OR: [
        { metadata: { path: ['subjectPlayerId'], equals: 'player-3' } },
        { metadata: { path: ['disclosedPlayerIds'], array_contains: ['player-3'] } },
      ],
    };

    it('matches rows the account acted as, was acted on, or was shown in', async () => {
      // Filtering on either alone answers only half of "who accessed this
      // person's data".
      await list({ subjectUserId: 'user-9' });

      expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual(userClause);
    });

    it('lists everything when no subject is given', async () => {
      await list({});
      expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({});
    });

    it('finds views of a player record, which may have no account', async () => {
      await list({ subjectPlayerId: 'player-3' });
      expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual(playerClause);
    });

    it('narrows by both subjects when both are given', async () => {
      await list({ subjectUserId: 'user-9', subjectPlayerId: 'player-3' });
      expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
        AND: [userClause, playerClause],
      });
    });

    it('records the read itself before answering', async () => {
      await list({ subjectUserId: 'user-9' });

      expect(audit.recordAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ADMIN_PII_LISTED',
          userId: 'admin-1',
          metadata: { view: 'audit-log', filters: { subjectUserId: 'user-9', page: 1 } },
        }),
      );
      expect(audit.recordAndWait.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.auditLog.findMany.mock.invocationCallOrder[0],
      );
    });
  });
});
