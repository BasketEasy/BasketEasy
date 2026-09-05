import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AccountSecurityService } from './account-security.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { hashToken } from '../common/token-hash';

describe('AccountSecurityService', () => {
  let service: AccountSecurityService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    emailVerificationToken: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    passwordResetToken: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    refreshToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mail: {
    sendVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
    sendAndForget: jest.Mock;
  };

  const unverifiedUser = {
    id: 'user-1',
    email: 'theo.dupont@example.com',
    emailVerifiedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      emailVerificationToken: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn(),
      },
      passwordResetToken: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      // Both forms are used: the array form for confirmEmail, the interactive
      // form for resetPassword's claim-then-write.
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.resolve([]),
      ),
    };
    mail = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      // The real sendAndForget takes a thunk and swallows its rejection;
      // invoking it here keeps the assertion on the underlying send.
      sendAndForget: jest.fn((send: () => Promise<void>) => {
        void send();
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountSecurityService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = module.get<AccountSecurityService>(AccountSecurityService);
  });

  describe('sendVerificationEmail', () => {
    it('stores only the hash of the token and e-mails the raw value', async () => {
      prisma.user.findUnique.mockResolvedValue(unverifiedUser);

      await service.sendVerificationEmail('user-1');

      const created = prisma.emailVerificationToken.create.mock.calls[0][0].data;
      const sentToken = mail.sendVerificationEmail.mock.calls[0][1];
      expect(sentToken).toEqual(expect.any(String));
      expect(created.tokenHash).toBe(hashToken(sentToken));
      // The raw token must never be persisted — a leaked database is not a
      // set of working account-takeover links.
      expect(created.tokenHash).not.toBe(sentToken);
      expect(created.email).toBe(unverifiedUser.email);
    });

    it('sends nothing for an already-verified address', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...unverifiedUser, emailVerifiedAt: new Date() });

      await service.sendVerificationEmail('user-1');

      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
      expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('sends nothing when a token was issued within the throttle window', async () => {
      prisma.user.findUnique.mockResolvedValue(unverifiedUser);
      prisma.emailVerificationToken.findFirst.mockResolvedValue({ id: 'recent' });

      await service.sendVerificationEmail('user-1');

      expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmEmail', () => {
    const validToken = {
      id: 'token-1',
      userId: 'user-1',
      email: 'theo.dupont@example.com',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-1', email: 'theo.dupont@example.com', emailVerifiedAt: null },
    };

    it('consumes the token and marks the address verified', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(validToken);

      await service.confirmEmail('raw-token');

      expect(prisma.emailVerificationToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashToken('raw-token') } }),
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.emailVerificationToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'token-1' } }),
      );
    });

    it('rejects an unknown token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue(null);

      await expect(service.confirmEmail('nope')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an already-consumed token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        ...validToken,
        consumedAt: new Date(),
      });

      await expect(service.confirmEmail('raw-token')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an expired token', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        ...validToken,
        expiresAt: new Date(Date.now() - 1),
      });

      await expect(service.confirmEmail('raw-token')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to verify when the account address changed after the link was sent', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        ...validToken,
        user: { ...validToken.user, email: 'nouvelle.adresse@example.com' },
      });

      await expect(service.confirmEmail('raw-token')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('requestPasswordReset', () => {
    it('issues a token and e-mails it for a known address', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'theo.dupont@example.com' });

      await service.requestPasswordReset('theo.dupont@example.com');

      const created = prisma.passwordResetToken.create.mock.calls[0][0].data;
      const sentToken = mail.sendPasswordResetEmail.mock.calls[0][1];
      expect(created.tokenHash).toBe(hashToken(sentToken));
    });

    it('resolves silently for an unknown address, revealing nothing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      // The absence of a throw is the assertion: a reset form that answered
      // differently for a known and an unknown address would be a
      // user-enumeration oracle.
      await expect(service.requestPasswordReset('inconnu@example.com')).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('still does throttle-shaped, hash-shaped, and write-shaped work for an unknown address (issue #143)', async () => {
      // Otherwise the known/unknown paths differ by exactly the DB round
      // trips, hashing, and the create() write the real path does — a timing
      // side-channel that reveals which addresses have accounts even though
      // both answer 204.
      prisma.user.findUnique.mockResolvedValue(null);

      await service.requestPasswordReset('inconnu@example.com');

      expect(prisma.passwordResetToken.findFirst).toHaveBeenCalledTimes(1);
      const dummyLookup = prisma.passwordResetToken.findFirst.mock.calls[0][0];
      // A dummy hash of a random token, never the address itself or a value
      // that could collide with a real stored token.
      expect(dummyLookup.where.tokenHash).toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));

      // A write against the same table the real create() would hit,
      // targeting an id that can never match a real row.
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledTimes(1);
      const dummyWrite = prisma.passwordResetToken.updateMany.mock.calls[0][0];
      expect(dummyWrite.where.id).toEqual(expect.stringMatching(/^[0-9a-f]{32}$/));

      // And still no row is actually created or e-mail sent for it.
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const validToken = {
      id: 'reset-1',
      userId: 'user-1',
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('hashes the new password and revokes every outstanding session', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validToken);

      await service.resetPassword('raw-token', 'nouveau-mot-de-passe');

      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'user-1' });
      expect(updateArgs.data.passwordHash).not.toBe('nouveau-mot-de-passe');
      expect(await argon2.verify(updateArgs.data.passwordHash, 'nouveau-mot-de-passe')).toBe(true);

      // The point of the flow: whoever may have known the old password loses
      // their live sessions too.
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects an expired token without touching the password', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        ...validToken,
        expiresAt: new Date(Date.now() - 1),
      });

      await expect(
        service.resetPassword('raw-token', 'nouveau-mot-de-passe'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects the loser of a race for the same link', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(validToken);
      // Another request claimed the row between the read and the write.
      prisma.passwordResetToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.resetPassword('raw-token', 'nouveau-mot-de-passe'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
