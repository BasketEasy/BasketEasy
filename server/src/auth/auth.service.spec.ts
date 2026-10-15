import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let audit: { record: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    audit = { record: jest.fn() };
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'JWT_ACCESS_SECRET' ? 'access-secret' : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('creates a user with a hashed password and returns a token pair', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        firstName: null,
        lastName: null,
        avatarUrl: null,
        emailVerifiedAt: null,
        emailNotificationsEnabled: true,
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register('a@b.com', 'password123');

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.email).toBe('a@b.com');
      expect(createArgs.data.passwordHash).not.toBe('password123');
      expect(await argon2.verify(createArgs.data.passwordHash, 'password123')).toBe(true);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'a@b.com',
        firstName: null,
        lastName: null,
        avatarUrl: null,
        emailVerified: false,
        emailNotificationsEnabled: true,
        memberships: [],
      });
    });

    it('throws ConflictException when the email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.register('a@b.com', 'password123')).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException (not a raw 500) when two concurrent registrations race on the same email', async () => {
      // findUnique sees no existing row (the race window), but the create()
      // itself loses to a concurrent registration and hits Prisma's unique
      // constraint on User.email.
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`email`)',
          {
            code: 'P2002',
            clientVersion: '6.19.3',
          },
        ),
      );

      await expect(service.register('a@b.com', 'password123')).rejects.toThrow(ConflictException);
    });

    it('rethrows unrelated errors from user.create unchanged', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unrelated = new Error('database is on fire');
      prisma.user.create.mockRejectedValue(unrelated);

      await expect(service.register('a@b.com', 'password123')).rejects.toThrow(unrelated);
    });
  });

  describe('login', () => {
    it('returns a token pair for correct credentials', async () => {
      const passwordHash = await argon2.hash('password123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash,
        firstName: null,
        lastName: null,
        avatarUrl: null,
        emailVerifiedAt: null,
        emailNotificationsEnabled: true,
        memberships: [],
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login('a@b.com', 'password123');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'a@b.com',
        firstName: null,
        lastName: null,
        avatarUrl: null,
        emailVerified: false,
        emailNotificationsEnabled: true,
        memberships: [],
      });
    });

    it('records the sign-in and refreshes the activity clock', async () => {
      const passwordHash = await argon2.hash('password123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash,
        firstName: null,
        lastName: null,
        avatarUrl: null,
        emailVerifiedAt: null,
        emailNotificationsEnabled: true,
        memberships: [],
      });
      prisma.refreshToken.create.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});

      await service.login('a@b.com', 'password123', { ipAddress: '10.0.0.1', userAgent: 'jest' });

      expect(audit.record).toHaveBeenCalledWith({
        type: 'LOGIN_SUCCESS',
        userId: 'user-1',
        actorEmail: 'a@b.com',
        context: { ipAddress: '10.0.0.1', userAgent: 'jest' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastActiveAt: expect.any(Date) },
      });
    });

    it('records a failure against an unknown address with no user attached', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login('nobody@b.com', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'LOGIN_FAILURE',
          userId: null,
          actorEmail: 'nobody@b.com',
        }),
      );
    });

    it('records a failure against a known address with the user attached', async () => {
      const passwordHash = await argon2.hash('password123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash,
        memberships: [],
      });

      await expect(service.login('a@b.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'LOGIN_FAILURE', userId: 'user-1' }),
      );
    });

    it('throws UnauthorizedException for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login('nobody@b.com', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      const passwordHash = await argon2.hash('password123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash,
        memberships: [],
      });

      await expect(service.login('a@b.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('refresh', () => {
    it('rotates a valid token: revokes the old row and issues a new pair in the same family', async () => {
      const now = new Date();
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: 'hash-1',
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60),
        revokedAt: null,
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh('raw-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ familyId: 'family-1', userId: 'user-1' }),
        }),
      );
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it('throws UnauthorizedException when the token is unknown', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('unknown')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the token is expired', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() - 1000),
        revokedAt: null,
      });

      await expect(service.refresh('raw-token')).rejects.toThrow(UnauthorizedException);
    });

    it('revokes the whole family and throws when a token revoked long ago is reused', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: new Date(Date.now() - 60 * 1000),
      });
      // CAS claim on the (already-revoked) row matches nothing.
      prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
      // Family-wide revoke.
      prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 3 });

      await expect(service.refresh('raw-token')).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 'rt-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenNthCalledWith(2, {
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REFRESH_TOKEN_REUSE_DETECTED',
          userId: 'user-1',
          metadata: { familyId: 'family-1' },
        }),
      );
    });

    it('issues a fresh token pair instead of logging out when two concurrent requests race on the same token', async () => {
      // Simulates two tabs (or a tab plus an installed PWA) restoring a
      // session at once: the row is still unrevoked when read, but the CAS
      // claim loses because the other request claimed it a moment earlier.
      // This must NOT revoke the family or log the user out — that was the
      // bug reported ("leave the page and come back and I'm logged out").
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: null,
      });
      prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh('raw-token');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ familyId: 'family-1', userId: 'user-1' }),
        }),
      );
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
    });

    it('revokes the family for a token already revoked at read time, however recently', async () => {
      // The regression this pins: a token rotated away one second ago and
      // presented again is indistinguishable, by timing alone, from a stolen
      // token replayed immediately after the legitimate client rotated it.
      // Reuse detection is a fail-secure control, so recency buys nothing —
      // this must kill the family rather than mint a fresh pair.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: new Date(Date.now() - 1000),
      });
      prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 2 });

      await expect(service.refresh('raw-token')).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenNthCalledWith(2, {
        where: { familyId: 'family-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REFRESH_TOKEN_REUSE_DETECTED' }),
      );
    });

    it('does not log a lost race as a reuse — a client racing itself is not a security event', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: null,
      });
      prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      prisma.refreshToken.create.mockResolvedValue({});

      await service.refresh('raw-token');

      expect(audit.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REFRESH_TOKEN_REUSE_DETECTED' }),
      );
    });

    it('throws UnauthorizedException when the CAS claim succeeds but the owning user no longer exists', async () => {
      // The refresh-token row is valid and the CAS claim on it succeeds, but
      // the user it belongs to was deleted in the interim.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'deleted-user',
        familyId: 'family-1',
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: null,
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refresh('raw-token')).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'deleted-user' } });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the presented token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt-1', revokedAt: null });
      prisma.refreshToken.update.mockResolvedValue({});

      await service.logout('raw-token');

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('does nothing when the token is unknown', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.logout('unknown')).resolves.toBeUndefined();
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('records the sign-out when a session was actually revoked', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
      });
      prisma.refreshToken.update.mockResolvedValue({});

      await service.logout('raw-token');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'LOGOUT', userId: 'user-1' }),
      );
    });
  });

  describe('me', () => {
    it('returns the user with their club memberships', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'Alex',
        lastName: 'Dupont',
        avatarUrl: 'https://example.com/avatar.png',
        emailVerifiedAt: new Date('2026-09-01T10:00:00.000Z'),
        emailNotificationsEnabled: true,
        memberships: [{ clubId: 'club-1', role: 'ADMIN' }],
      });

      const result = await service.me('user-1');

      expect(result).toEqual({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'Alex',
        lastName: 'Dupont',
        avatarUrl: 'https://example.com/avatar.png',
        // A confirmed address is projected as a boolean, never the timestamp.
        emailVerified: true,
        emailNotificationsEnabled: true,
        memberships: [{ clubId: 'club-1', role: 'ADMIN' }],
      });
    });

    it('throws UnauthorizedException when the user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.me('gone')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('updateProfile', () => {
    it('updates the user and returns the same User shape as me()', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'Alex',
        lastName: 'Dupont',
        avatarUrl: null,
        emailVerifiedAt: null,
        emailNotificationsEnabled: false,
        memberships: [{ clubId: 'club-1', role: 'ADMIN' }],
      });

      const result = await service.updateProfile('user-1', {
        firstName: 'Alex',
        lastName: 'Dupont',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { firstName: 'Alex', lastName: 'Dupont' },
        include: { memberships: true },
      });
      expect(result).toEqual({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'Alex',
        lastName: 'Dupont',
        avatarUrl: null,
        emailVerified: false,
        emailNotificationsEnabled: false,
        memberships: [{ clubId: 'club-1', role: 'ADMIN' }],
      });
    });

    it('allows clearing the avatar by passing null', async () => {
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        firstName: null,
        lastName: null,
        avatarUrl: null,
        emailVerifiedAt: null,
        emailNotificationsEnabled: true,
        memberships: [],
      });

      const result = await service.updateProfile('user-1', { avatarUrl: null });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { avatarUrl: null },
        include: { memberships: true },
      });
      expect(result.avatarUrl).toBeNull();
    });
  });
});
