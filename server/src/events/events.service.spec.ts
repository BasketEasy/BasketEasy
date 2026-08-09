import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: {
    clubTeam: { findUnique: jest.Mock };
    event: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      clubTeam: { findUnique: jest.fn() },
      event: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('listEvents', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.listEvents('club-1', 'team-1')).rejects.toThrow(NotFoundException);
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it('lists events for the team ordered by start time', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'event-1',
          teamId: 'team-1',
          startsAt: new Date('2026-01-05T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
          createdAt: new Date('2026-01-01'),
        },
      ]);

      const result = await service.listEvents('club-1', 'team-1');

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        orderBy: { startsAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: 'event-1',
          teamId: 'team-1',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
          notes: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('createEvent', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(
        service.createEvent('club-1', 'team-1', {
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('creates the event for the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createEvent('club-1', 'team-1', {
        startsAt: '2026-01-05T18:00:00.000Z',
        location: 'Gymnase A',
      });

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: {
          teamId: 'team-1',
          startsAt: new Date('2026-01-05T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
        },
      });
      expect(result.id).toBe('event-1');
    });
  });

  describe('updateEvent', () => {
    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-2' });

      await expect(
        service.updateEvent('club-1', 'team-1', 'event-1', { location: 'Gymnase B' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('updates only the provided fields', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-1' });
      prisma.event.update.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase B',
        notes: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.updateEvent('club-1', 'team-1', 'event-1', {
        location: 'Gymnase B',
      });

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { location: 'Gymnase B' },
      });
      expect(result.location).toBe('Gymnase B');
    });
  });

  describe('deleteEvent', () => {
    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.deleteEvent('club-1', 'team-1', 'event-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.event.delete).not.toHaveBeenCalled();
    });

    it('deletes the event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-1' });

      await service.deleteEvent('club-1', 'team-1', 'event-1');

      expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: 'event-1' } });
    });
  });
});
