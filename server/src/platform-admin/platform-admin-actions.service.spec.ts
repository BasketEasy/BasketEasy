import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PlatformAdminActionsService } from './platform-admin-actions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountSecurityService } from '../auth/account-security.service';
import { ScoresheetsService } from '../scoresheets/scoresheets.service';

// Concurrency (two staff demoting a two-admin club at once) relies on the
// SELECT … FOR UPDATE in assertNotLastAdmin; it was exercised against a real
// Postgres while this was written. These tests pin the rules and the
// "change and audit row together, or neither" contract.

const DAY = 24 * 60 * 60 * 1000;
const actor = { id: 'admin-1', email: 'support@kluvo.net', role: 'SUPPORT' as const };
const request = {
  headers: { 'user-agent': 'jest' },
  socket: { remoteAddress: '203.0.113.7' },
} as unknown as Request;

describe('PlatformAdminActionsService', () => {
  let service: PlatformAdminActionsService;
  let order: string[];
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    clubMembership: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
      delete: jest.Mock;
    };
    player: { findUnique: jest.Mock; updateMany: jest.Mock };
    team: { findUnique: jest.Mock };
    teamAdmin: { findUnique: jest.Mock; create: jest.Mock; deleteMany: jest.Mock };
    clubTeam: { findMany: jest.Mock; updateMany: jest.Mock; update: jest.Mock };
    eventScoresheet: { findUnique: jest.Mock };
    guardianInvite: { deleteMany: jest.Mock };
    playerGuardian: { deleteMany: jest.Mock };
    parentalConsent: { updateMany: jest.Mock; create: jest.Mock };
    auditLog: { create: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let accountSecurity: { sendVerificationEmail: jest.Mock; requestPasswordReset: jest.Mock };
  let scoresheets: { enqueueOcr: jest.Mock };

  beforeEach(async () => {
    order = [];
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      clubMembership: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(2),
        delete: jest.fn(),
      },
      player: { findUnique: jest.fn(), updateMany: jest.fn() },
      team: { findUnique: jest.fn().mockResolvedValue({ id: 'team-1' }) },
      teamAdmin: { findUnique: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
      clubTeam: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
      eventScoresheet: { findUnique: jest.fn() },
      guardianInvite: { deleteMany: jest.fn() },
      playerGuardian: { deleteMany: jest.fn() },
      parentalConsent: { updateMany: jest.fn(), create: jest.fn() },
      auditLog: {
        create: jest.fn().mockImplementation(async () => {
          order.push('audit');
          return { id: 'log-1' };
        }),
      },
      $queryRaw: jest.fn(),
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => unknown) => Promise.resolve(fn(prisma))),
    };
    accountSecurity = {
      sendVerificationEmail: jest.fn().mockImplementation(async () => order.push('email')),
      requestPasswordReset: jest.fn().mockImplementation(async () => order.push('email')),
    };
    scoresheets = { enqueueOcr: jest.fn().mockImplementation(async () => order.push('enqueue')) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAdminActionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountSecurityService, useValue: accountSecurity },
        { provide: ScoresheetsService, useValue: scoresheets },
      ],
    }).compile();
    service = module.get(PlatformAdminActionsService);
  });

  describe('accounts', () => {
    it('records the reason with the change, through the same transaction', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-9',
        email: 'a@b.fr',
        emailVerifiedAt: null,
      });

      const result = await service.markEmailVerified(
        actor,
        'user-9',
        'Vérifié par téléphone',
        request,
      );

      expect(result).toEqual({ action: 'MARK_EMAIL_VERIFIED', auditLogId: 'log-1' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          type: 'ADMIN_SUPPORT_ACTION',
          userId: 'admin-1',
          actorEmail: 'support@kluvo.net',
          ipAddress: '203.0.113.7',
          userAgent: 'jest',
          metadata: {
            action: 'MARK_EMAIL_VERIFIED',
            reason: 'Vérifié par téléphone',
            subjectUserId: 'user-9',
          },
        },
        select: { id: true },
      });
    });

    it('refuses an address already verified, and writes nothing', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-9',
        email: 'a@b.fr',
        emailVerifiedAt: new Date(),
      });

      await expect(
        service.resendVerification(actor, 'user-9', 'Relance demandée', request),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      expect(accountSecurity.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('audits an e-mail before sending it, never after', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-9',
        email: 'a@b.fr',
        emailVerifiedAt: null,
      });

      await service.resendVerification(actor, 'user-9', 'Relance demandée', request);

      expect(order).toEqual(['audit', 'email']);
    });

    it('sends the ordinary reset link to the account address', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-9',
        email: 'a@b.fr',
        emailVerifiedAt: null,
      });

      await service.sendPasswordReset(actor, 'user-9', 'Mot de passe oublié', request);

      expect(accountSecurity.requestPasswordReset).toHaveBeenCalledWith(
        'a@b.fr',
        expect.anything(),
      );
    });

    it('refuses to revoke the acting admin’s own sessions', async () => {
      await expect(
        service.revokeSessions(actor, 'admin-1', 'Test sur soi-même', request),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('memberships', () => {
    it('refuses to demote the last admin of a club', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.$queryRaw.mockResolvedValue([{ id: 'm-1' }]);

      await expect(
        service.changeClubRole(
          actor,
          'club-1',
          'user-9',
          'MEMBER',
          'Demande du président',
          request,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.clubMembership.update).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('records the role before and after', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });

      await service.changeClubRole(
        actor,
        'club-1',
        'user-9',
        'ADMIN',
        'Nouveau président',
        request,
      );

      expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({
        action: 'CHANGE_CLUB_ROLE',
        clubId: 'club-1',
        before: { role: 'MEMBER' },
        after: { role: 'ADMIN' },
      });
    });

    it('removes a member the product’s way: roster entries unlinked, not deleted', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });

      await service.removeMembership(actor, 'club-1', 'user-9', 'Doublon de compte', request);

      expect(prisma.player.updateMany).toHaveBeenCalledWith({
        where: { clubId: 'club-1', userId: 'user-9' },
        data: { userId: null },
      });
      expect(prisma.clubMembership.delete).toHaveBeenCalled();
    });
  });

  describe('teams', () => {
    it('only makes a member of a linked club a team manager', async () => {
      prisma.clubMembership.findFirst.mockResolvedValue(null);

      await expect(
        service.addTeamAdmin(actor, 'team-1', 'user-9', 'Nouvel entraîneur', request),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.teamAdmin.create).not.toHaveBeenCalled();
    });

    it('transfers ownership only to a club already linked', async () => {
      prisma.clubTeam.findMany.mockResolvedValue([{ clubId: 'club-1', isOwner: true }]);

      await expect(
        service.transferTeamOwnership(actor, 'team-1', 'club-9', 'Fusion d’entente', request),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('flips the owner flag and records who owned it before', async () => {
      prisma.clubTeam.findMany.mockResolvedValue([
        { clubId: 'club-1', isOwner: true },
        { clubId: 'club-2', isOwner: false },
      ]);

      await service.transferTeamOwnership(actor, 'team-1', 'club-2', 'Fusion d’entente', request);

      expect(prisma.clubTeam.updateMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        data: { isOwner: false },
      });
      expect(prisma.clubTeam.update).toHaveBeenCalledWith({
        where: { clubId_teamId: { clubId: 'club-2', teamId: 'team-1' } },
        data: { isOwner: true },
      });
      expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({
        before: { ownerClubId: 'club-1' },
        after: { ownerClubId: 'club-2' },
      });
    });
  });

  describe('scoresheets', () => {
    it('never re-reads a confirmed sheet', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        id: 'sheet-1',
        eventId: 'event-1',
        status: 'CONFIRMED',
        uploadedAt: new Date(),
      });

      await expect(
        service.retryOcr(actor, 'sheet-1', 'Club bloqué', request),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(scoresheets.enqueueOcr).not.toHaveBeenCalled();
    });

    it('leaves a read in progress alone, but retries one stuck for over an hour', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        id: 'sheet-1',
        eventId: 'event-1',
        status: 'QUEUED',
        uploadedAt: new Date(),
      });
      await expect(
        service.retryOcr(actor, 'sheet-1', 'Club bloqué', request),
      ).rejects.toBeInstanceOf(ConflictException);

      prisma.eventScoresheet.findUnique.mockResolvedValue({
        id: 'sheet-1',
        eventId: 'event-1',
        status: 'QUEUED',
        uploadedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      });
      await service.retryOcr(actor, 'sheet-1', 'Club bloqué', request);
      expect(order).toEqual(['audit', 'enqueue']);
    });
  });

  describe('guardians and consent', () => {
    it('404s a guardian link that does not exist, without an audit row', async () => {
      prisma.playerGuardian.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.removeGuardian(actor, 'player-1', 'user-9', 'Lien créé par erreur', request),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('refuses a consent for an adult', async () => {
      prisma.player.findUnique.mockResolvedValue({
        id: 'player-1',
        clubId: 'club-1',
        firstName: 'Nicolas',
        lastName: 'Bernard',
        birthDate: new Date(Date.now() - 30 * 365 * DAY),
      });
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Camille',
        lastName: 'Staff',
        email: 'support@kluvo.net',
      });

      await expect(
        service.recordParentalConsent(
          actor,
          'player-1',
          'Parent',
          'Papier',
          'Demande du club',
          request,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records a minor’s consent as Kluvo staff, naming who gave it and how', async () => {
      prisma.player.findUnique.mockResolvedValue({
        id: 'player-1',
        clubId: 'club-1',
        firstName: 'Léo',
        lastName: 'Bernard',
        birthDate: new Date(Date.now() - 12 * 365 * DAY),
      });
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Camille',
        lastName: 'Staff',
        email: 'support@kluvo.net',
      });

      await service.recordParentalConsent(
        actor,
        'player-1',
        'Nicolas Bernard, père',
        'formulaire papier',
        'Club sans accès à l’app',
        request,
      );

      expect(prisma.parentalConsent.create.mock.calls[0][0].data).toMatchObject({
        source: 'PLATFORM_STAFF',
        attestedByUserId: 'admin-1',
        attestedByName: 'Camille Staff (Kluvo) — Nicolas Bernard, père, formulaire papier',
      });
    });
  });
});
