import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
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
import { StorageService } from '../storage/storage.service';

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
    player: { findUnique: jest.Mock; updateMany: jest.Mock; count: jest.Mock };
    team: { findUnique: jest.Mock; deleteMany: jest.Mock };
    teamAdmin: { findUnique: jest.Mock; create: jest.Mock; deleteMany: jest.Mock };
    clubTeam: { findMany: jest.Mock; updateMany: jest.Mock; update: jest.Mock; count: jest.Mock };
    eventScoresheet: { findUnique: jest.Mock; findMany: jest.Mock };
    club: { create: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
    guardianInvite: { deleteMany: jest.Mock };
    playerGuardian: { deleteMany: jest.Mock };
    parentalConsent: { updateMany: jest.Mock; create: jest.Mock };
    auditLog: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let accountSecurity: {
    sendVerificationEmail: jest.Mock;
    requestPasswordReset: jest.Mock;
    isVerificationThrottled: jest.Mock;
    isPasswordResetThrottled: jest.Mock;
  };
  let scoresheets: { enqueueOcr: jest.Mock };
  let storage: { deleteObject: jest.Mock };

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
      player: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      team: {
        findUnique: jest.fn().mockResolvedValue({ id: 'team-1' }),
        deleteMany: jest.fn().mockImplementation(async () => order.push('delete-teams')),
      },
      teamAdmin: { findUnique: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
      clubTeam: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      eventScoresheet: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      club: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn().mockImplementation(async () => order.push('delete-club')),
      },
      guardianInvite: { deleteMany: jest.fn() },
      playerGuardian: { deleteMany: jest.fn() },
      parentalConsent: { updateMany: jest.fn(), create: jest.fn() },
      auditLog: {
        create: jest.fn().mockImplementation(async () => {
          order.push('audit');
          return { id: 'log-1' };
        }),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => unknown) => Promise.resolve(fn(prisma))),
    };
    accountSecurity = {
      sendVerificationEmail: jest.fn().mockImplementation(async () => order.push('email')),
      requestPasswordReset: jest.fn().mockImplementation(async () => order.push('email')),
      isVerificationThrottled: jest.fn().mockResolvedValue(false),
      isPasswordResetThrottled: jest.fn().mockResolvedValue(false),
    };
    scoresheets = { enqueueOcr: jest.fn().mockImplementation(async () => order.push('enqueue')) };
    storage = { deleteObject: jest.fn().mockImplementation(async () => order.push('storage')) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAdminActionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccountSecurityService, useValue: accountSecurity },
        { provide: ScoresheetsService, useValue: scoresheets },
        { provide: StorageService, useValue: storage },
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

      // Staff-origin: no request context, so the subject's own reset row
      // never carries the staff member's IP.
      expect(accountSecurity.requestPasswordReset).toHaveBeenCalledWith('a@b.fr', undefined, {
        byStaff: true,
      });
    });

    it('refuses a throttled e-mail before writing a row that would claim it was sent', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-9',
        email: 'a@b.fr',
        emailVerifiedAt: null,
      });
      accountSecurity.isVerificationThrottled.mockResolvedValue(true);
      accountSecurity.isPasswordResetThrottled.mockResolvedValue(true);

      for (const run of [
        () => service.resendVerification(actor, 'user-9', 'Relance demandée', request),
        () => service.sendPasswordReset(actor, 'user-9', 'Mot de passe oublié', request),
      ]) {
        await expect(run()).rejects.toMatchObject({ status: 429 });
      }
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      expect(accountSecurity.sendVerificationEmail).not.toHaveBeenCalled();
      expect(accountSecurity.requestPasswordReset).not.toHaveBeenCalled();
    });

    it('never lets staff act on their own account', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'support@kluvo.net',
        emailVerifiedAt: null,
      });
      const self = 'admin-1';
      const attempts = [
        () => service.markEmailVerified(actor, self, 'Vérifié par téléphone', request),
        () => service.resendVerification(actor, self, 'Relance demandée', request),
        () => service.sendPasswordReset(actor, self, 'Mot de passe oublié', request),
        () => service.changeClubRole(actor, 'club-1', self, 'ADMIN', 'Promotion demandée', request),
        () => service.removeMembership(actor, 'club-1', self, 'Départ du club', request),
        () => service.addTeamAdmin(actor, 'team-1', self, 'Coach remplaçant', request),
        () => service.removeTeamAdmin(actor, 'team-1', self, 'Coach remplaçant', request),
        () =>
          service.createClub(
            actor,
            { name: 'BC Test', firstAdminUserId: self },
            'Nouveau club créé',
            request,
          ),
      ];
      for (const attempt of attempts) {
        await expect(attempt()).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses to revoke the acting admin’s own sessions', async () => {
      await expect(
        service.revokeSessions(actor, 'admin-1', 'Test sur soi-même', request),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('club creation', () => {
    const data = {
      name: 'Saint-Herblain BC',
      ffbbClubCode: 'PDL0044051',
      firstAdminUserId: 'user-9',
    };

    it('creates the club with its first ADMIN and one audit row, together', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-9',
        email: 'c@x.fr',
        emailVerifiedAt: null,
      });
      prisma.club.create.mockResolvedValue({
        id: 'club-9',
        name: data.name,
        ffbbClubCode: data.ffbbClubCode,
      });

      const result = await service.createClub(
        actor,
        data,
        'Demande du comité 44, ticket #830',
        request,
      );

      expect(prisma.club.create).toHaveBeenCalledWith({
        data: {
          name: data.name,
          ffbbClubCode: data.ffbbClubCode,
          memberships: { create: { userId: 'user-9', role: 'ADMIN' } },
        },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({
        action: 'CLUB_CREATED',
        clubId: 'club-9',
        subjectUserId: 'user-9',
      });
      expect(result).toEqual({ action: 'CLUB_CREATED', auditLogId: 'log-1', clubId: 'club-9' });
    });

    it('refuses an unknown first admin and writes nothing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.createClub(actor, data, 'raison assez longue', request)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.club.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('turns a duplicate FFBB code into a 409 and writes no audit row', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-9',
        email: 'c@x.fr',
        emailVerifiedAt: null,
      });
      prisma.club.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.createClub(actor, data, 'raison assez longue', request)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
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
      // A stuck sheet's leftover job is replaced, or BullMQ ignores the add.
      expect(scoresheets.enqueueOcr).toHaveBeenCalledWith('sheet-1', { replaceStale: true });
    });

    it('rolls the audit row back when the queue is unreachable', async () => {
      prisma.eventScoresheet.findUnique.mockResolvedValue({
        id: 'sheet-1',
        eventId: 'event-1',
        status: 'FAILED',
        uploadedAt: new Date(),
      });
      scoresheets.enqueueOcr.mockRejectedValue(new Error('redis down'));

      await expect(service.retryOcr(actor, 'sheet-1', 'Club bloqué', request)).rejects.toThrow(
        'redis down',
      );
      // Enqueued inside the transaction callback, so the row's write fails
      // with it rather than committing on its own.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(scoresheets.enqueueOcr).toHaveBeenCalledWith('sheet-1', { replaceStale: false });
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

  describe('deleteClub', () => {
    // Two reads: the club's owned links, then the partner links on those teams.
    const arrange = (ownedIds: string[], partnered: string[] = []) => {
      prisma.clubTeam.findMany
        .mockResolvedValueOnce(ownedIds.map((teamId) => ({ teamId })))
        .mockResolvedValueOnce(partnered.map((teamId) => ({ teamId })));
    };

    beforeEach(() => {
      prisma.club.findUnique.mockResolvedValue({ name: 'BC Nantes', ffbbClubCode: 'PDL0044001' });
      arrange(['team-1', 'team-2']);
      prisma.clubTeam.count.mockResolvedValue(1);
      prisma.player.count.mockResolvedValue(12);
      prisma.parentalConsent.updateMany.mockResolvedValue({ count: 3 });
      prisma.eventScoresheet.findMany.mockResolvedValue([
        { storageKey: 'sheets/a.jpg' },
        { storageKey: 'sheets/b.pdf' },
      ]);
    });

    it('deletes the owned teams and the club with its audit row, then the files', async () => {
      const result = await service.deleteClub(actor, 'club-1', 'Club fermé, ticket #42', request);

      expect(result).toEqual({ action: 'CLUB_DELETED', auditLogId: 'log-1' });
      expect(prisma.clubTeam.findMany).toHaveBeenCalledWith({
        where: { clubId: 'club-1', isOwner: true },
        select: { teamId: true },
      });
      // The owned Team rows are locked before partners are looked up, so a
      // partner link added concurrently can't slip in after the check.
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.clubTeam.findMany.mock.invocationCallOrder[1],
      );
      expect(prisma.clubTeam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { teamId: { in: ['team-1', 'team-2'] }, clubId: { not: 'club-1' } },
        }),
      );
      expect(prisma.team.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['team-1', 'team-2'] } },
      });
      expect(prisma.club.delete).toHaveBeenCalledWith({ where: { id: 'club-1' } });
      expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toEqual({
        action: 'CLUB_DELETED',
        reason: 'Club fermé, ticket #42',
        clubId: 'club-1',
        before: {
          name: 'BC Nantes',
          ffbbClubCode: 'PDL0044001',
          ownedTeamCount: 2,
          partnerOnTeamCount: 1,
          playerCount: 12,
          parentalConsentsKept: 3,
          scoresheetFileCount: 2,
        },
      });
      expect(storage.deleteObject.mock.calls.map(([key]) => key)).toEqual([
        'sheets/a.jpg',
        'sheets/b.pdf',
      ]);
      expect(order).toEqual(['delete-teams', 'delete-club', 'audit', 'storage', 'storage']);
      expect(prisma.auditLog.update).not.toHaveBeenCalled();
    });

    it('runs with a timeout sized for a large club, not Prisma’s 5s default', async () => {
      await service.deleteClub(actor, 'club-1', 'Club fermé, ticket #42', request);

      expect(prisma.$transaction.mock.calls[0][1]).toEqual(
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
      expect(prisma.$transaction.mock.calls[0][1].timeout).toBeGreaterThan(5_000);
    });

    it('refuses a club that owns a team shared with another club, and deletes nothing', async () => {
      prisma.clubTeam.findMany.mockReset();
      arrange(['team-1', 'team-ctc'], ['team-ctc']);

      await expect(
        service.deleteClub(actor, 'club-1', 'Club fermé, ticket #42', request),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.team.deleteMany).not.toHaveBeenCalled();
      expect(prisma.club.delete).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('keeps the parental consents: snapshots the club name and starts their clock', async () => {
      await service.deleteClub(actor, 'club-1', 'Club fermé, ticket #42', request);

      expect(prisma.parentalConsent.updateMany).toHaveBeenCalledWith({
        where: { clubId: 'club-1' },
        data: { clubName: 'BC Nantes' },
      });
      expect(prisma.parentalConsent.updateMany).toHaveBeenCalledWith({
        where: { clubId: 'club-1', retentionExpiresAt: null },
        data: { retentionExpiresAt: expect.any(Date) },
      });
    });

    it('still succeeds when storage cleanup fails, and records the keys it left behind', async () => {
      storage.deleteObject.mockImplementation(async (key: string) => {
        if (key === 'sheets/b.pdf') throw new Error('R2 down');
      });
      prisma.auditLog.findUnique.mockResolvedValue({ metadata: { action: 'CLUB_DELETED' } });

      await expect(
        service.deleteClub(actor, 'club-1', 'Club fermé, ticket #42', request),
      ).resolves.toEqual({ action: 'CLUB_DELETED', auditLogId: 'log-1' });
      expect(prisma.auditLog.update).toHaveBeenCalledWith({
        where: { id: 'log-1' },
        data: { metadata: { action: 'CLUB_DELETED', failedStorageKeys: ['sheets/b.pdf'] } },
      });
    });

    it('refuses an unknown club, and deletes nothing', async () => {
      prisma.club.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteClub(actor, 'club-x', 'Club fermé, ticket #42', request),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.team.deleteMany).not.toHaveBeenCalled();
      expect(prisma.club.delete).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
      expect(storage.deleteObject).not.toHaveBeenCalled();
    });
  });
});
