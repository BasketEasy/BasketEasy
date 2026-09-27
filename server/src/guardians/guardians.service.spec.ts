import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  type HttpException,
} from '@nestjs/common';
import { INVITE_ALREADY_ACCEPTED_CODE } from '@basketeasy/types/player-invites';
import { PARENTAL_CONSENT_REQUIRED_CODE } from '@basketeasy/types/parental-consent';
import { GuardiansService } from './guardians.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AccountSecurityService } from '../auth/account-security.service';
import { AuditService } from '../audit/audit.service';

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);
const MINOR_BIRTH = new Date('2015-05-01T00:00:00.000Z');
const ADULT_BIRTH = new Date('1990-05-01T00:00:00.000Z');

function buildInvite(
  overrides: Record<string, unknown> = {},
  player: Record<string, unknown> = {},
) {
  return {
    id: 'invite-1',
    playerId: 'player-1',
    expiresAt: FUTURE,
    acceptedAt: null,
    acceptedByUserId: null,
    ...overrides,
    player: {
      id: 'player-1',
      clubId: 'club-1',
      userId: null,
      firstName: 'Léo',
      lastName: 'Martin',
      birthDate: MINOR_BIRTH,
      club: { name: 'ASBC Rezé' },
      ...player,
    },
  };
}

async function expectCode(promise: Promise<unknown>, type: unknown, code?: string) {
  const err = await promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(type as never);
  if (code) {
    expect((err as HttpException).getResponse()).toMatchObject({ code });
  }
}

describe('GuardiansService', () => {
  let service: GuardiansService;
  let prisma: {
    player: { findUnique: jest.Mock };
    playerGuardian: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    guardianInvite: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
    parentalConsent: { findMany: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
    teamPlayer: { findMany: jest.Mock };
    user: { update: jest.Mock; findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
  };
  let authService: { register: jest.Mock; me: jest.Mock };
  let accountSecurity: { sendVerificationEmail: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      player: { findUnique: jest.fn().mockResolvedValue({ clubId: 'club-1' }) },
      playerGuardian: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guardianInvite: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: 'invite-1' }),
        update: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      parentalConsent: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      teamPlayer: { findMany: jest.fn().mockResolvedValue([{ team: { name: 'U11 Filles' } }]) },
      user: {
        update: jest.fn(),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ firstName: 'Sophie', lastName: 'Martin', email: 's@x.fr' }),
      },
      $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
    authService = {
      register: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'parent-1' },
      }),
      me: jest.fn().mockResolvedValue({ id: 'parent-1', memberships: [] }),
    };
    accountSecurity = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GuardiansService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => 'https://kluvo.fr' } },
        { provide: AuthService, useValue: authService },
        { provide: AccountSecurityService, useValue: accountSecurity },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(GuardiansService);
  });

  describe('admin', () => {
    it('404s a player of another club', async () => {
      prisma.player.findUnique.mockResolvedValue({ clubId: 'club-2' });

      await expect(service.listForPlayer('club-1', 'player-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lists guardians with their own in-app consent and the live invites', async () => {
      const linkedAt = new Date('2026-09-01T10:00:00.000Z');
      const consentAt = new Date('2026-09-01T10:01:00.000Z');
      prisma.playerGuardian.findMany.mockResolvedValue([
        {
          userId: 'parent-1',
          createdAt: linkedAt,
          user: { firstName: 'Sophie', lastName: 'Martin', email: 's@x.fr' },
        },
        {
          userId: 'parent-2',
          createdAt: linkedAt,
          user: { firstName: null, lastName: null, email: 'p@x.fr' },
        },
      ]);
      prisma.parentalConsent.findMany.mockResolvedValue([
        { attestedByUserId: 'parent-1', consentGivenAt: consentAt },
      ]);
      prisma.guardianInvite.findMany.mockResolvedValue([
        { id: 'invite-2', createdAt: linkedAt, expiresAt: FUTURE },
      ]);

      const result = await service.listForPlayer('club-1', 'player-1');

      expect(result.guardians).toEqual([
        {
          userId: 'parent-1',
          firstName: 'Sophie',
          lastName: 'Martin',
          email: 's@x.fr',
          linkedAt: linkedAt.toISOString(),
          consentGivenAt: consentAt.toISOString(),
        },
        expect.objectContaining({ userId: 'parent-2', consentGivenAt: null }),
      ]);
      expect(result.pendingInvites).toEqual([
        { id: 'invite-2', createdAt: linkedAt.toISOString(), expiresAt: FUTURE.toISOString() },
      ]);
      expect(prisma.guardianInvite.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { playerId: 'player-1', acceptedAt: null, expiresAt: { gt: expect.any(Date) } },
        }),
      );
    });

    it('creates a hashed invite and returns the raw link once', async () => {
      const link = await service.createInvite('club-1', 'player-1', 'admin-1');

      expect(link.url).toBe(`https://kluvo.fr/guardian-invite/${link.token}`);
      const data = prisma.guardianInvite.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ playerId: 'player-1', createdByUserId: 'admin-1' });
      expect(data.tokenHash).not.toBe(link.token);
    });

    it('refuses a fifth guardian and a fifth pending invite', async () => {
      prisma.playerGuardian.count.mockResolvedValue(4);
      await expect(service.createInvite('club-1', 'player-1', 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );

      prisma.playerGuardian.count.mockResolvedValue(0);
      prisma.guardianInvite.count.mockResolvedValue(4);
      await expect(service.createInvite('club-1', 'player-1', 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.guardianInvite.create).not.toHaveBeenCalled();
    });

    it('cancels only a pending invite of this player', async () => {
      prisma.guardianInvite.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.cancelInvite('club-1', 'player-1', 'invite-9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.guardianInvite.deleteMany).toHaveBeenCalledWith({
        where: { id: 'invite-9', playerId: 'player-1', acceptedAt: null },
      });
    });

    it('removes a guardian link and 404s an unknown one', async () => {
      await service.removeGuardian('club-1', 'player-1', 'parent-1');
      expect(prisma.playerGuardian.deleteMany).toHaveBeenCalledWith({
        where: { playerId: 'player-1', userId: 'parent-1' },
      });

      prisma.playerGuardian.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.removeGuardian('club-1', 'player-1', 'parent-9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getPreview', () => {
    it('404s an unknown or expired token, 409s an accepted one', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(null);
      await expect(service.getPreview('t')).rejects.toBeInstanceOf(NotFoundException);

      prisma.guardianInvite.findUnique.mockResolvedValue(buildInvite({ expiresAt: PAST }));
      await expect(service.getPreview('t')).rejects.toBeInstanceOf(NotFoundException);

      prisma.guardianInvite.findUnique.mockResolvedValue(buildInvite({ acceptedAt: new Date() }));
      await expectCode(service.getPreview('t'), ConflictException, INVITE_ALREADY_ACCEPTED_CODE);
    });

    it('requires consent for a minor only', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(buildInvite());
      await expect(service.getPreview('t')).resolves.toEqual({
        playerFirstName: 'Léo',
        playerLastName: 'Martin',
        clubName: 'ASBC Rezé',
        teamNames: ['U11 Filles'],
        requiresConsent: true,
        expiresAt: FUTURE.toISOString(),
      });

      prisma.guardianInvite.findUnique.mockResolvedValue(
        buildInvite({}, { birthDate: ADULT_BIRTH }),
      );
      await expect(service.getPreview('t')).resolves.toMatchObject({ requiresConsent: false });

      prisma.guardianInvite.findUnique.mockResolvedValue(buildInvite({}, { birthDate: null }));
      await expect(service.getPreview('t')).resolves.toMatchObject({ requiresConsent: false });
    });
  });

  describe('acceptAsUser', () => {
    it('links the caller, records their consent for a minor and creates no membership', async () => {
      const invite = buildInvite();
      prisma.guardianInvite.findUnique.mockResolvedValue(invite);

      await expect(service.acceptAsUser('t', 'parent-1', true)).resolves.toEqual({
        playerId: 'player-1',
        clubId: 'club-1',
      });

      expect(prisma.playerGuardian.create).toHaveBeenCalledWith({
        data: { playerId: 'player-1', userId: 'parent-1' },
      });
      expect(prisma.parentalConsent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          playerId: 'player-1',
          clubId: 'club-1',
          playerBirthDate: MINOR_BIRTH,
          attestedByName: 'Sophie Martin',
          attestedByUserId: 'parent-1',
          source: 'GUARDIAN_IN_APP',
        }),
      });
      expect(prisma.guardianInvite.update).toHaveBeenCalledWith({
        where: { id: 'invite-1' },
        data: { acceptedAt: expect.any(Date), acceptedByUserId: 'parent-1' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GUARDIAN_INVITE_ACCEPTED', userId: 'parent-1' }),
      );
      expect(prisma).not.toHaveProperty('clubMembership');
    });

    it('needs no consent for an adult', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(
        buildInvite({}, { birthDate: ADULT_BIRTH }),
      );

      await service.acceptAsUser('t', 'parent-1', undefined);

      expect(prisma.playerGuardian.create).toHaveBeenCalled();
      expect(prisma.parentalConsent.create).not.toHaveBeenCalled();
    });

    it('refuses a minor without consent and writes nothing', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(buildInvite());

      await expectCode(
        service.acceptAsUser('t', 'parent-1', false),
        BadRequestException,
        PARENTAL_CONSENT_REQUIRED_CODE,
      );
      expect(prisma.playerGuardian.create).not.toHaveBeenCalled();
      expect(prisma.parentalConsent.create).not.toHaveBeenCalled();
      expect(prisma.guardianInvite.update).not.toHaveBeenCalled();
    });

    it('refuses an expired link', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(buildInvite({ expiresAt: PAST }));

      await expect(service.acceptAsUser('t', 'parent-1', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('409s a link another account already used', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(
        buildInvite({ acceptedAt: new Date(), acceptedByUserId: 'parent-2' }),
      );

      await expectCode(
        service.acceptAsUser('t', 'parent-1', true),
        ConflictException,
        INVITE_ALREADY_ACCEPTED_CODE,
      );
    });

    it('treats a second accept by the same account as a success', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(
        buildInvite({ acceptedAt: new Date(), acceptedByUserId: 'parent-1', expiresAt: PAST }),
      );

      await expect(service.acceptAsUser('t', 'parent-1', true)).resolves.toEqual({
        playerId: 'player-1',
        clubId: 'club-1',
      });
      expect(prisma.playerGuardian.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refuses the player as their own parent', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(buildInvite({}, { userId: 'parent-1' }));

      await expect(service.acceptAsUser('t', 'parent-1', true)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.playerGuardian.create).not.toHaveBeenCalled();
    });

    it('refuses a fifth guardian', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(buildInvite());
      prisma.playerGuardian.count.mockResolvedValue(4);

      await expect(service.acceptAsUser('t', 'parent-1', true)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.playerGuardian.create).not.toHaveBeenCalled();
    });

    it('does not duplicate an existing link or count it against the cap', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(
        buildInvite({}, { birthDate: ADULT_BIRTH }),
      );
      prisma.playerGuardian.findUnique.mockResolvedValue({ playerId: 'player-1' });
      prisma.playerGuardian.count.mockResolvedValue(4);

      await service.acceptAsUser('t', 'parent-1', undefined);

      expect(prisma.playerGuardian.create).not.toHaveBeenCalled();
      expect(prisma.guardianInvite.update).toHaveBeenCalled();
    });
  });

  describe('acceptWithRegistration', () => {
    const form = {
      firstName: 'Sophie',
      lastName: 'Martin',
      email: 's@x.fr',
      password: 'password1234',
    };

    it('refuses a missing consent before any account is created', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(buildInvite());

      await expectCode(
        service.acceptWithRegistration('t', form),
        BadRequestException,
        PARENTAL_CONSENT_REQUIRED_CODE,
      );
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('registers, names the account, links it and returns a session', async () => {
      prisma.guardianInvite.findUnique.mockResolvedValue(buildInvite());

      const result = await service.acceptWithRegistration('t', { ...form, consent: true });

      expect(authService.register).toHaveBeenCalledWith('s@x.fr', 'password1234');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'parent-1' },
        data: { firstName: 'Sophie', lastName: 'Martin' },
      });
      expect(prisma.playerGuardian.create).toHaveBeenCalled();
      expect(accountSecurity.sendVerificationEmail).toHaveBeenCalledWith('parent-1');
      expect(result).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'parent-1', memberships: [] },
      });
    });
  });
});
