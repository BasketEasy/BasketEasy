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
      deleteMany: jest.Mock;
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
        deleteMany: jest.fn(),
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
          type: 'TRAINING',
          startsAt: new Date('2026-01-05T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
          opponentName: null,
          recurrenceId: null,
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
            type: 'TRAINING',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: null,
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
          type: 'TRAINING',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for a MATCH with no opponentName', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });

      await expect(
        service.createEvent('club-1', 'team-1', {
          type: 'MATCH',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('creates a single event for the team when no recurrence is given, with recurrenceId null', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createEvent('club-1', 'team-1', {
        type: 'TRAINING',
        startsAt: '2026-01-05T18:00:00.000Z',
        location: 'Gymnase A',
      });

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.event.create).toHaveBeenCalledWith({
        data: {
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-05T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
          opponentName: null,
          recurrenceId: null,
        },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('event-1');
      expect(result[0].recurrenceId).toBeNull();
    });

    it('creates a MATCH event with the given opponentName', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'US Saint-Nazaire',
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createEvent('club-1', 'team-1', {
        type: 'MATCH',
        startsAt: '2026-01-05T18:00:00.000Z',
        location: 'Gymnase A',
        opponentName: 'US Saint-Nazaire',
      });

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ opponentName: 'US Saint-Nazaire' }),
      });
      expect(result[0].opponentName).toBe('US Saint-Nazaire');
    });

    it('creates one event per week through the recurrence end date, inclusive, sharing one recurrenceId', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      const recurrenceIds: (string | null)[] = [];
      prisma.event.create.mockImplementation(
        ({ data }: { data: { startsAt: Date; recurrenceId: string | null } }) => {
          recurrenceIds.push(data.recurrenceId);
          return Promise.resolve({
            id: `event-${data.startsAt.toISOString()}`,
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: data.startsAt,
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: data.recurrenceId,
            createdAt: new Date('2026-01-01'),
          });
        },
      );

      const result = await service.createEvent('club-1', 'team-1', {
        type: 'TRAINING',
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
      expect(recurrenceIds.every((id) => id !== null)).toBe(true);
      expect(new Set(recurrenceIds).size).toBe(1);
      expect(result.every((e) => e.recurrenceId === recurrenceIds[0])).toBe(true);
    });

    it('throws BadRequestException when the recurrence end date is before the start date', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });

      await expect(
        service.createEvent('club-1', 'team-1', {
          type: 'TRAINING',
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

    it('updates only the provided fields with scope THIS by default', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: null,
      });
      prisma.event.update.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase B',
        notes: null,
        opponentName: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.updateEvent('club-1', 'team-1', 'event-1', {
        location: 'Gymnase B',
      });

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { location: 'Gymnase B' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].location).toBe('Gymnase B');
    });

    it('throws BadRequestException for scope THIS_AND_FUTURE on a non-recurring event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: null,
      });

      await expect(
        service.updateEvent('club-1', 'team-1', 'event-1', {
          location: 'Gymnase B',
          scope: 'THIS_AND_FUTURE',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when startsAt is set with a non-THIS scope', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: 'series-1',
      });

      await expect(
        service.updateEvent('club-1', 'team-1', 'event-1', {
          startsAt: '2026-01-06T18:00:00.000Z',
          scope: 'ALL',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException switching to MATCH with no opponentName', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: null,
      });

      await expect(
        service.updateEvent('club-1', 'team-1', 'event-1', { type: 'MATCH' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('clears opponentName when switching type to TRAINING', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: 'US Saint-Nazaire',
        recurrenceId: null,
      });
      prisma.event.update.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      await service.updateEvent('club-1', 'team-1', 'event-1', { type: 'TRAINING' });

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { type: 'TRAINING', opponentName: null },
      });
    });

    it('scope THIS_AND_FUTURE updates this event and later same-series occurrences only', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: 'series-1',
      });
      prisma.event.findMany.mockResolvedValue([{ id: 'event-2' }, { id: 'event-3' }]);
      prisma.event.update.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-12T18:00:00.000Z'),
          location: 'Gymnase B',
          notes: null,
          opponentName: null,
          recurrenceId: 'series-1',
          createdAt: new Date('2026-01-01'),
        }),
      );

      const result = await service.updateEvent('club-1', 'team-1', 'event-2', {
        location: 'Gymnase B',
        scope: 'THIS_AND_FUTURE',
      });

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: {
          teamId: 'team-1',
          recurrenceId: 'series-1',
          startsAt: { gte: new Date('2026-01-12T18:00:00.000Z') },
        },
        select: { id: true },
      });
      expect(prisma.event.update).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('scope ALL updates every event in the series regardless of startsAt', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: 'series-1',
      });
      prisma.event.findMany.mockResolvedValue([
        { id: 'event-1' },
        { id: 'event-2' },
        { id: 'event-3' },
      ]);
      prisma.event.update.mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({
          id: where.id,
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-12T18:00:00.000Z'),
          location: 'Gymnase B',
          notes: null,
          opponentName: null,
          recurrenceId: 'series-1',
          createdAt: new Date('2026-01-01'),
        }),
      );

      const result = await service.updateEvent('club-1', 'team-1', 'event-2', {
        location: 'Gymnase B',
        scope: 'ALL',
      });

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1', recurrenceId: 'series-1' },
        select: { id: true },
      });
      expect(result).toHaveLength(3);
    });
  });

  describe('deleteEvent', () => {
    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.deleteEvent('club-1', 'team-1', 'event-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.event.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes only this event by default (scope THIS)', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        recurrenceId: null,
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
      });

      await service.deleteEvent('club-1', 'team-1', 'event-1');

      expect(prisma.event.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['event-1'] } } });
      expect(prisma.event.findMany).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for scope ALL on a non-recurring event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        recurrenceId: null,
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
      });

      await expect(service.deleteEvent('club-1', 'team-1', 'event-1', 'ALL')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.event.deleteMany).not.toHaveBeenCalled();
    });

    it('scope THIS_AND_FUTURE deletes this event and later same-series occurrences only', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        recurrenceId: 'series-1',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
      });
      prisma.event.findMany.mockResolvedValue([{ id: 'event-2' }, { id: 'event-3' }]);

      await service.deleteEvent('club-1', 'team-1', 'event-2', 'THIS_AND_FUTURE');

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: {
          teamId: 'team-1',
          recurrenceId: 'series-1',
          startsAt: { gte: new Date('2026-01-12T18:00:00.000Z') },
        },
        select: { id: true },
      });
      expect(prisma.event.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['event-2', 'event-3'] } },
      });
    });

    it('scope ALL deletes every event in the series', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        recurrenceId: 'series-1',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
      });
      prisma.event.findMany.mockResolvedValue([
        { id: 'event-1' },
        { id: 'event-2' },
        { id: 'event-3' },
      ]);

      await service.deleteEvent('club-1', 'team-1', 'event-2', 'ALL');

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1', recurrenceId: 'series-1' },
        select: { id: true },
      });
      expect(prisma.event.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['event-1', 'event-2', 'event-3'] } },
      });
    });
  });
});
