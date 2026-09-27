import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MyGuardiansService } from './my-guardians.service';
import { PrismaService } from '../prisma/prisma.service';

const MINOR_BIRTH = new Date('2015-05-01T00:00:00.000Z');
const ADULT_BIRTH = new Date('1990-05-01T00:00:00.000Z');

const slot = (id: string, teamId: string, name: string) => ({
  id,
  teamId,
  team: { name },
});

describe('MyGuardiansService', () => {
  let service: MyGuardiansService;
  let prisma: {
    clubMembership: { count: jest.Mock };
    teamAdmin: { count: jest.Mock };
    player: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
    playerGuardian: { findMany: jest.Mock; findUnique: jest.Mock; deleteMany: jest.Mock };
    event: { findMany: jest.Mock };
    eventRsvp: { findMany: jest.Mock };
    parentalConsent: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      clubMembership: { count: jest.fn().mockResolvedValue(0) },
      teamAdmin: { count: jest.fn().mockResolvedValue(0) },
      player: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
      playerGuardian: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ playerId: 'child-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      event: { findMany: jest.fn().mockResolvedValue([]) },
      eventRsvp: { findMany: jest.fn().mockResolvedValue([]) },
      parentalConsent: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const module = await Test.createTestingModule({
      providers: [MyGuardiansService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(MyGuardiansService);
  });

  describe('getPersonas', () => {
    it('has no « Moi » persona for a guardian-only user', async () => {
      prisma.playerGuardian.findMany.mockResolvedValue([
        {
          player: {
            id: 'child-1',
            firstName: 'Léo',
            lastName: 'Martin',
            clubId: 'club-1',
            club: { name: 'ASBC' },
            teamPlayers: [slot('tp-leo', 'team-1', 'U11')],
          },
        },
      ]);

      const result = await service.getPersonas('parent-1');

      expect(result.self).toBeNull();
      expect(result.children).toEqual([
        {
          playerId: 'child-1',
          firstName: 'Léo',
          lastName: 'Martin',
          clubId: 'club-1',
          clubName: 'ASBC',
          teams: [{ teamId: 'team-1', teamName: 'U11' }],
          pendingCount: 0,
        },
      ]);
    });

    it('counts each persona’s unanswered events in two reads for everyone', async () => {
      prisma.clubMembership.count.mockResolvedValue(1);
      prisma.player.findMany.mockResolvedValue([
        { id: 'me-player', teamPlayers: [slot('tp-me', 'team-sen', 'Seniors')] },
      ]);
      prisma.playerGuardian.findMany.mockResolvedValue([
        {
          player: {
            id: 'child-2',
            firstName: 'Emma',
            lastName: 'Martin',
            clubId: 'club-1',
            club: { name: 'ASBC' },
            teamPlayers: [slot('tp-emma', 'team-u13', 'U13')],
          },
        },
        {
          player: {
            id: 'child-1',
            firstName: 'Léo',
            lastName: 'Martin',
            clubId: 'club-1',
            club: { name: 'ASBC' },
            teamPlayers: [slot('tp-leo', 'team-u11', 'U11')],
          },
        },
      ]);
      prisma.event.findMany.mockResolvedValue([
        { id: 'e1', teamId: 'team-sen' },
        { id: 'e2', teamId: 'team-u11' },
        { id: 'e3', teamId: 'team-u11' },
        { id: 'e4', teamId: 'team-u13' },
      ]);
      prisma.eventRsvp.findMany.mockResolvedValue([{ teamPlayerId: 'tp-leo', eventId: 'e2' }]);

      const result = await service.getPersonas('parent-1');

      expect(result.self).toEqual({ pendingCount: 1, playerIds: ['me-player'] });
      expect(result.children.map((c) => [c.firstName, c.pendingCount])).toEqual([
        ['Emma', 1],
        ['Léo', 1],
      ]);
      expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('children', () => {
    it('404s a child the caller does not guard', async () => {
      prisma.playerGuardian.findUnique.mockResolvedValue(null);

      await expect(service.getChild('parent-1', 'child-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.updateChild('parent-1', 'child-1', { firstName: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.player.update).not.toHaveBeenCalled();
    });

    it('shows co-guardians by name only, never the caller', async () => {
      prisma.player.findUniqueOrThrow.mockResolvedValue({
        id: 'child-1',
        firstName: 'Léo',
        lastName: 'Martin',
        birthDate: MINOR_BIRTH,
        gender: 'MEN',
        clubId: 'club-1',
        club: { name: 'ASBC' },
        teamPlayers: [slot('tp-leo', 'team-1', 'U11')],
      });
      prisma.playerGuardian.findMany.mockResolvedValue([
        { user: { firstName: 'Marc', lastName: 'Martin' } },
      ]);

      const result = await service.getChild('parent-1', 'child-1');

      expect(prisma.playerGuardian.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { playerId: 'child-1', userId: { not: 'parent-1' } },
          select: { user: { select: { firstName: true, lastName: true } } },
        }),
      );
      expect(result.coGuardians).toEqual([{ firstName: 'Marc', lastName: 'Martin' }]);
      expect(result.isMinor).toBe(true);
    });

    it('updates only the four profile fields', async () => {
      prisma.player.findUniqueOrThrow.mockResolvedValue({
        id: 'child-1',
        firstName: 'Léo',
        lastName: 'Martin',
        birthDate: null,
        gender: null,
        clubId: 'club-1',
        club: { name: 'ASBC' },
        teamPlayers: [],
      });

      await service.updateChild('parent-1', 'child-1', {
        firstName: 'Léon',
        birthDate: '2015-05-01',
      });

      expect(prisma.player.update).toHaveBeenCalledWith({
        where: { id: 'child-1' },
        data: {
          firstName: 'Léon',
          lastName: undefined,
          gender: undefined,
          birthDate: new Date('2015-05-01'),
        },
      });
    });

    it('stops following only the caller’s own link', async () => {
      await service.stopFollowing('parent-1', 'child-1');
      expect(prisma.playerGuardian.deleteMany).toHaveBeenCalledWith({
        where: { playerId: 'child-1', userId: 'parent-1' },
      });
    });
  });

  describe('a player’s own guardians', () => {
    it('404s a player that is not the caller', async () => {
      prisma.player.findFirst.mockResolvedValue(null);

      await expect(service.listMyGuardians('user-1', 'player-9')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lets an adult remove a parent', async () => {
      prisma.player.findFirst.mockResolvedValue({ birthDate: ADULT_BIRTH });

      await service.removeMyGuardian('user-1', 'player-1', 'parent-1');

      expect(prisma.playerGuardian.deleteMany).toHaveBeenCalledWith({
        where: { playerId: 'player-1', userId: 'parent-1' },
      });
    });

    it('does not let a minor remove a parent', async () => {
      prisma.player.findFirst.mockResolvedValue({ birthDate: MINOR_BIRTH });

      await expect(
        service.removeMyGuardian('user-1', 'player-1', 'parent-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.playerGuardian.deleteMany).not.toHaveBeenCalled();
    });
  });
});
