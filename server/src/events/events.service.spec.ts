import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
      count: jest.Mock;
    };
    $transaction: jest.Mock;
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
        count: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('listEvents', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.listEvents('club-1', 'team-1', {})).rejects.toThrow(NotFoundException);
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it('lists events for the team ordered by start time by default', async () => {
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
      prisma.event.count.mockResolvedValue(1);

      const result = await service.listEvents('club-1', 'team-1', {});

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        orderBy: { startsAt: 'asc' },
        skip: 0,
        take: 25,
      });
      expect(prisma.event.count).toHaveBeenCalledWith({ where: { teamId: 'team-1' } });
      expect(result).toEqual({
        items: [
          {
            id: 'event-1',
            teamId: 'team-1',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
            notes: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      });
    });

    it('filters by from/to date range', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      await service.listEvents('club-1', 'team-1', {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T00:00:00.000Z',
      });

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teamId: 'team-1',
            startsAt: {
              gte: new Date('2026-01-01T00:00:00.000Z'),
              lte: new Date('2026-01-31T00:00:00.000Z'),
            },
          },
        }),
      );
    });

    it('filters by search on location or notes', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      await service.listEvents('club-1', 'team-1', { search: 'gymnase' });

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            teamId: 'team-1',
            OR: [
              { location: { contains: 'gymnase', mode: 'insensitive' } },
              { notes: { contains: 'gymnase', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('sorts descending when requested', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      await service.listEvents('club-1', 'team-1', { sortOrder: 'desc' });

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { startsAt: 'desc' } }),
      );
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

    it('creates a single event for the team when no recurrence is given', async () => {
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

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.event.create).toHaveBeenCalledWith({
        data: {
          teamId: 'team-1',
          startsAt: new Date('2026-01-05T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('event-1');
    });

    it('creates one event per week through the recurrence end date, inclusive', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockImplementation(({ data }: { data: { startsAt: Date } }) =>
        Promise.resolve({
          id: `event-${data.startsAt.toISOString()}`,
          teamId: 'team-1',
          startsAt: data.startsAt,
          location: 'Gymnase A',
          notes: null,
          createdAt: new Date('2026-01-01'),
        }),
      );

      const result = await service.createEvent('club-1', 'team-1', {
        startsAt: '2026-01-05T18:00:00.000Z',
        location: 'Gymnase A',
        recurrence: { frequency: 'WEEKLY', until: '2026-01-19T18:00:00.000Z' },
      });

      expect(prisma.event.create).toHaveBeenCalledTimes(3);
      expect(result.map((e) => e.startsAt)).toEqual([
        '2026-01-05T18:00:00.000Z',
        '2026-01-12T18:00:00.000Z',
        '2026-01-19T18:00:00.000Z',
      ]);
    });

    it('throws BadRequestException when the recurrence end date is before the start date', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });

      await expect(
        service.createEvent('club-1', 'team-1', {
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
          recurrence: { frequency: 'WEEKLY', until: '2026-01-01T18:00:00.000Z' },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
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
