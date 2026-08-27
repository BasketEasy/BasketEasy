import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
    teamPlayer: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    eventRsvp: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock };
    eventConvocation: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
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
      teamPlayer: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      eventRsvp: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
      eventConvocation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    // Default: the caller has no roster row on the team, so
    // resolveMyRsvpStatuses/resolveMyConvocationStatuses short-circuit to an
    // empty map/set and every returned TeamEvent's myRsvpStatus is null and
    // myConvocation is false, unless a test overrides this to exercise the
    // rostered-caller path.
    prisma.teamPlayer.findFirst.mockResolvedValue(null);
    // Defaults for whichever of the two a rostered-caller test doesn't
    // itself care about, so tests only need to mock the one they exercise.
    prisma.eventRsvp.findMany.mockResolvedValue([]);
    prisma.eventConvocation.findMany.mockResolvedValue([]);
    prisma.eventConvocation.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('listEvents', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(service.listEvents('club-1', 'team-1', {}, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
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
          externalId: null,
          timeConfirmed: true,
          createdAt: new Date('2026-01-01'),
        },
      ]);
      prisma.event.count.mockResolvedValue(1);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

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
            isImported: false,
            timeConfirmed: true,
            myRsvpStatus: null,
            myConvocation: false,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      });
    });

    it('marks an event with an externalId as imported and surfaces timeConfirmed:false for a TBD kickoff', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([
        {
          id: 'event-1',
          teamId: 'team-1',
          type: 'MATCH',
          startsAt: new Date('2026-09-20T00:00:00.000Z'),
          location: 'Lieu non communiqué',
          notes: null,
          opponentName: 'Nantes Sully Basket',
          venue: 'AWAY',
          recurrenceId: null,
          externalId: 'ffbb-match-1',
          timeConfirmed: false,
          createdAt: new Date('2026-01-01'),
        },
      ]);
      prisma.event.count.mockResolvedValue(1);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      expect(result.items[0].isImported).toBe(true);
      expect(result.items[0].timeConfirmed).toBe(false);
      expect(result.items[0].venue).toBe('AWAY');
    });

    it('resolves the caller RSVP status and convocation flag in a bounded number of queries, regardless of page size', async () => {
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
        {
          id: 'event-2',
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-12T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
          opponentName: null,
          recurrenceId: null,
          createdAt: new Date('2026-01-01'),
        },
      ]);
      prisma.event.count.mockResolvedValue(2);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventRsvp.findMany.mockResolvedValue([{ eventId: 'event-1', status: 'GOING' }]);
      prisma.eventConvocation.findMany.mockResolvedValue([{ eventId: 'event-1' }]);

      const result = await service.listEvents('club-1', 'team-1', {}, 'user-1');

      // One shared findMyTeamPlayer lookup, plus one findMany per concern —
      // never one query per event and never a duplicate teamPlayer lookup
      // for the two concerns.
      expect(prisma.teamPlayer.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith({
        where: { teamPlayerId: 'tp-1', eventId: { in: ['event-1', 'event-2'] } },
      });
      expect(prisma.eventConvocation.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.eventConvocation.findMany).toHaveBeenCalledWith({
        where: { teamPlayerId: 'tp-1', eventId: { in: ['event-1', 'event-2'] } },
      });
      expect(result.items[0].myRsvpStatus).toBe('GOING');
      expect(result.items[0].myConvocation).toBe(true);
      expect(result.items[1].myRsvpStatus).toBeNull();
      expect(result.items[1].myConvocation).toBe(false);
    });

    it('filters by from/to date range', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findMany.mockResolvedValue([]);
      prisma.event.count.mockResolvedValue(0);

      await service.listEvents(
        'club-1',
        'team-1',
        {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-31T00:00:00.000Z',
        },
        'user-1',
      );

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

      await service.listEvents('club-1', 'team-1', { search: 'gymnase' }, 'user-1');

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

      await service.listEvents('club-1', 'team-1', { sortOrder: 'desc' }, 'user-1');

      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { startsAt: 'desc' } }),
      );
    });
  });

  describe('createEvent', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue(null);

      await expect(
        service.createEvent(
          'club-1',
          'team-1',
          {
            type: 'TRAINING',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
          },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException for a MATCH with no opponentName', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });

      await expect(
        service.createEvent(
          'club-1',
          'team-1',
          {
            type: 'MATCH',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
          },
          'user-1',
        ),
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

      const result = await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'TRAINING',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
        },
        'user-1',
      );

      expect(prisma.event.create).toHaveBeenCalledTimes(1);
      expect(prisma.event.create).toHaveBeenCalledWith({
        data: {
          teamId: 'team-1',
          type: 'TRAINING',
          startsAt: new Date('2026-01-05T18:00:00.000Z'),
          location: 'Gymnase A',
          notes: null,
          opponentName: null,
          venue: null,
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
        venue: 'HOME',
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'MATCH',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
          opponentName: 'US Saint-Nazaire',
          venue: 'HOME',
        },
        'user-1',
      );

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ opponentName: 'US Saint-Nazaire' }),
      });
      expect(result[0].opponentName).toBe('US Saint-Nazaire');
    });

    it('throws BadRequestException for a MATCH with an opponentName but no venue', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });

      await expect(
        service.createEvent(
          'club-1',
          'team-1',
          {
            type: 'MATCH',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
            opponentName: 'US Saint-Nazaire',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });

    it('creates a MATCH event with the given venue and forces venue null for a TRAINING event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'US Saint-Nazaire',
        venue: 'AWAY',
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'MATCH',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
          opponentName: 'US Saint-Nazaire',
          venue: 'AWAY',
        },
        'user-1',
      );

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ venue: 'AWAY' }),
      });
      expect(result[0].venue).toBe('AWAY');
    });

    it('forces venue null when creating a TRAINING event even if one is given', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.create.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        venue: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'TRAINING',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
        },
        'user-1',
      );

      expect(prisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ venue: null }),
      });
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

      const result = await service.createEvent(
        'club-1',
        'team-1',
        {
          type: 'TRAINING',
          startsAt: '2026-01-05T18:00:00.000Z',
          location: 'Gymnase A',
          recurrence: { frequency: 'WEEKLY', until: '2026-01-19T18:00:00.000Z' },
        },
        'user-1',
      );

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
        service.createEvent(
          'club-1',
          'team-1',
          {
            type: 'TRAINING',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
            recurrence: { frequency: 'WEEKLY', until: '2026-01-01T18:00:00.000Z' },
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.create).not.toHaveBeenCalled();
    });
  });

  describe('updateEvent', () => {
    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-2' });

      await expect(
        service.updateEvent('club-1', 'team-1', 'event-1', { location: 'Gymnase B' }, 'user-1'),
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
        venue: null,
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
        venue: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.updateEvent(
        'club-1',
        'team-1',
        'event-1',
        {
          location: 'Gymnase B',
        },
        'user-1',
      );

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
        service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          {
            location: 'Gymnase B',
            scope: 'THIS_AND_FUTURE',
          },
          'user-1',
        ),
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
        service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          {
            startsAt: '2026-01-06T18:00:00.000Z',
            scope: 'ALL',
          },
          'user-1',
        ),
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
        service.updateEvent('club-1', 'team-1', 'event-1', { type: 'MATCH' }, 'user-1'),
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
        venue: 'HOME',
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
        venue: null,
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      await service.updateEvent('club-1', 'team-1', 'event-1', { type: 'TRAINING' }, 'user-1');

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { type: 'TRAINING', opponentName: null, venue: null },
      });
    });

    it('throws BadRequestException switching to MATCH with an opponentName but no venue', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: null,
        venue: null,
        recurrenceId: null,
      });

      await expect(
        service.updateEvent(
          'club-1',
          'team-1',
          'event-1',
          { type: 'MATCH', opponentName: 'US Saint-Nazaire' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('updates venue on a MATCH event', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        opponentName: 'US Saint-Nazaire',
        venue: 'HOME',
        recurrenceId: null,
      });
      prisma.event.update.mockResolvedValue({
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-01-05T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'US Saint-Nazaire',
        venue: 'AWAY',
        recurrenceId: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.updateEvent(
        'club-1',
        'team-1',
        'event-1',
        { venue: 'AWAY' },
        'user-1',
      );

      expect(prisma.event.update).toHaveBeenCalledWith({
        where: { id: 'event-1' },
        data: { venue: 'AWAY' },
      });
      expect(result[0].venue).toBe('AWAY');
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

      const result = await service.updateEvent(
        'club-1',
        'team-1',
        'event-2',
        {
          location: 'Gymnase B',
          scope: 'THIS_AND_FUTURE',
        },
        'user-1',
      );

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

      const result = await service.updateEvent(
        'club-1',
        'team-1',
        'event-2',
        {
          location: 'Gymnase B',
          scope: 'ALL',
        },
        'user-1',
      );

      expect(prisma.event.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1', recurrenceId: 'series-1' },
        select: { id: true },
      });
      expect(result).toHaveLength(3);
    });
  });

  describe('updateEventTimeOfDay', () => {
    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-2' });

      await expect(
        service.updateEventTimeOfDay(
          'club-1',
          'team-1',
          'event-1',
          {
            scope: 'ALL',
            hour: 19,
            minute: 30,
          },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on a non-recurring event', async () => {
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
        service.updateEventTimeOfDay(
          'club-1',
          'team-1',
          'event-1',
          {
            scope: 'ALL',
            hour: 19,
            minute: 30,
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.event.findMany).not.toHaveBeenCalled();
      expect(prisma.event.update).not.toHaveBeenCalled();
    });

    it('scope ALL applies the given UTC hour/minute to every row in the series, keeping each date unchanged', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: 'series-1',
      });
      // First findMany resolves the scope ids (resolveScopeIds), second
      // fetches the full rows for those ids.
      prisma.event.findMany
        .mockResolvedValueOnce([{ id: 'event-1' }, { id: 'event-2' }, { id: 'event-3' }])
        .mockResolvedValueOnce([
          {
            id: 'event-1',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: new Date('2026-01-05T18:00:00.000Z'),
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'event-2',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: new Date('2026-01-12T18:00:00.000Z'),
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'event-3',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: new Date('2026-01-19T18:00:00.000Z'),
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          },
        ]);
      prisma.event.update.mockImplementation(
        ({ where, data }: { where: { id: string }; data: { startsAt: Date } }) =>
          Promise.resolve({
            id: where.id,
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: data.startsAt,
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          }),
      );

      const result = await service.updateEventTimeOfDay(
        'club-1',
        'team-1',
        'event-2',
        {
          scope: 'ALL',
          hour: 19,
          minute: 30,
        },
        'user-1',
      );

      expect(prisma.event.findMany).toHaveBeenNthCalledWith(1, {
        where: { teamId: 'team-1', recurrenceId: 'series-1' },
        select: { id: true },
      });
      expect(prisma.event.findMany).toHaveBeenNthCalledWith(2, {
        where: { id: { in: ['event-1', 'event-2', 'event-3'] } },
      });
      expect(prisma.event.update).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(3);
      expect(result.map((e) => e.startsAt)).toEqual([
        '2026-01-05T19:30:00.000Z',
        '2026-01-12T19:30:00.000Z',
        '2026-01-19T19:30:00.000Z',
      ]);
    });

    it('scope THIS_AND_FUTURE narrows to this event and later same-series occurrences only', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
        id: 'event-2',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-01-12T18:00:00.000Z'),
        opponentName: null,
        recurrenceId: 'series-1',
      });
      prisma.event.findMany
        .mockResolvedValueOnce([{ id: 'event-2' }, { id: 'event-3' }])
        .mockResolvedValueOnce([
          {
            id: 'event-2',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: new Date('2026-01-12T18:00:00.000Z'),
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          },
          {
            id: 'event-3',
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: new Date('2026-01-19T18:00:00.000Z'),
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          },
        ]);
      prisma.event.update.mockImplementation(
        ({ where, data }: { where: { id: string }; data: { startsAt: Date } }) =>
          Promise.resolve({
            id: where.id,
            teamId: 'team-1',
            type: 'TRAINING',
            startsAt: data.startsAt,
            location: 'Gymnase A',
            notes: null,
            opponentName: null,
            recurrenceId: 'series-1',
            createdAt: new Date('2026-01-01'),
          }),
      );

      const result = await service.updateEventTimeOfDay(
        'club-1',
        'team-1',
        'event-2',
        {
          scope: 'THIS_AND_FUTURE',
          hour: 20,
          minute: 0,
        },
        'user-1',
      );

      expect(prisma.event.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          teamId: 'team-1',
          recurrenceId: 'series-1',
          startsAt: { gte: new Date('2026-01-12T18:00:00.000Z') },
        },
        select: { id: true },
      });
      expect(prisma.event.update).toHaveBeenCalledTimes(2);
      expect(result.map((e) => e.startsAt)).toEqual([
        '2026-01-12T20:00:00.000Z',
        '2026-01-19T20:00:00.000Z',
      ]);
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

  describe('setMyRsvp', () => {
    const existingEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'TRAINING',
      startsAt: new Date('2026-01-05T18:00:00.000Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: null,
      recurrenceId: null,
      createdAt: new Date('2026-01-01'),
    };

    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-2' });

      await expect(
        service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'GOING'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.eventRsvp.upsert).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller has no roster row on the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue(null);

      await expect(
        service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'GOING'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.eventRsvp.upsert).not.toHaveBeenCalled();
    });

    it('upserts the caller own TeamPlayer RSVP and returns the event with myRsvpStatus set', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });
      prisma.eventConvocation.findUnique.mockResolvedValue({ id: 'conv-1' });

      const result = await service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'GOING');

      expect(prisma.eventRsvp.upsert).toHaveBeenCalledWith({
        where: { eventId_teamPlayerId: { eventId: 'event-1', teamPlayerId: 'tp-1' } },
        create: {
          eventId: 'event-1',
          teamPlayerId: 'tp-1',
          status: 'GOING',
          respondedAt: expect.any(Date),
        },
        update: { status: 'GOING', respondedAt: expect.any(Date) },
      });
      expect(result.myRsvpStatus).toBe('GOING');
      expect(result.myConvocation).toBe(true);
    });

    it('resolves the write in a bounded number of queries, without re-fetching the event or re-resolving the caller TeamPlayer', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

      await service.setMyRsvp('club-1', 'team-1', 'event-1', 'user-1', 'GOING');

      expect(prisma.event.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.teamPlayer.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.findMany).not.toHaveBeenCalled();
      expect(prisma.eventConvocation.findUnique).toHaveBeenCalledWith({
        where: { eventId_teamPlayerId: { eventId: 'event-1', teamPlayerId: 'tp-1' } },
      });
    });
  });

  describe('clearMyRsvp', () => {
    const existingEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'TRAINING',
      startsAt: new Date('2026-01-05T18:00:00.000Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: null,
      recurrenceId: null,
      createdAt: new Date('2026-01-01'),
    };

    it('throws ForbiddenException when the caller has no roster row on the team', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue(null);

      await expect(service.clearMyRsvp('club-1', 'team-1', 'event-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.eventRsvp.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes the caller own TeamPlayer RSVP row and returns the event with myRsvpStatus null', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

      const result = await service.clearMyRsvp('club-1', 'team-1', 'event-1', 'user-1');

      expect(prisma.eventRsvp.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', teamPlayerId: 'tp-1' },
      });
      expect(result.myRsvpStatus).toBeNull();
      expect(result.myConvocation).toBe(false);
    });

    it('resolves the write in a bounded number of queries, without re-fetching the event or re-resolving the caller TeamPlayer', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findFirst.mockResolvedValue({ id: 'tp-1' });

      await service.clearMyRsvp('club-1', 'team-1', 'event-1', 'user-1');

      expect(prisma.event.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.teamPlayer.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.eventRsvp.findMany).not.toHaveBeenCalled();
    });
  });

  describe('listEventRsvps', () => {
    it('returns one entry per roster member, null status for anyone who has not responded, and isMe for the caller', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
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
      prisma.teamPlayer.findMany.mockResolvedValue([
        {
          id: 'tp-1',
          playerId: 'player-1',
          role: 'PLAYER',
          player: { firstName: 'Lea', lastName: 'Bernard', userId: 'user-1' },
          rsvps: [{ status: 'GOING', respondedAt: new Date('2026-01-02') }],
        },
        {
          id: 'tp-2',
          playerId: 'player-2',
          role: 'COACH',
          player: { firstName: 'Nathan', lastName: 'Hubert', userId: 'user-2' },
          rsvps: [],
        },
      ]);

      const result = await service.listEventRsvps('club-1', 'team-1', 'event-1', 'user-1');

      expect(prisma.teamPlayer.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        include: { player: true, rsvps: { where: { eventId: 'event-1' } } },
        orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
      });
      expect(result).toEqual([
        {
          teamPlayerId: 'tp-1',
          playerId: 'player-1',
          firstName: 'Lea',
          lastName: 'Bernard',
          role: 'PLAYER',
          status: 'GOING',
          respondedAt: '2026-01-02T00:00:00.000Z',
          isMe: true,
        },
        {
          teamPlayerId: 'tp-2',
          playerId: 'player-2',
          firstName: 'Nathan',
          lastName: 'Hubert',
          role: 'COACH',
          status: null,
          respondedAt: null,
          isMe: false,
        },
      ]);
    });
  });

  describe('setEventConvocations', () => {
    const existingEvent = {
      id: 'event-1',
      teamId: 'team-1',
      type: 'TRAINING',
      startsAt: new Date('2026-01-05T18:00:00.000Z'),
      location: 'Gymnase A',
      notes: null,
      opponentName: null,
      recurrenceId: null,
      createdAt: new Date('2026-01-01'),
    };

    beforeEach(() => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue(existingEvent);
      prisma.teamPlayer.findMany.mockResolvedValue([]);
    });

    it('throws NotFoundException when the event does not belong to the team', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'event-1', teamId: 'team-2' });

      await expect(
        service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1'], 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a teamPlayerId is not on the team roster', async () => {
      prisma.teamPlayer.count.mockResolvedValue(1);

      await expect(
        service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1', 'tp-2'], 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('convokes exactly the given teamPlayerIds, deleting every other convocation for the event', async () => {
      prisma.teamPlayer.count.mockResolvedValue(2);

      await service.setEventConvocations('club-1', 'team-1', 'event-1', ['tp-1', 'tp-2'], 'user-1');

      expect(prisma.teamPlayer.count).toHaveBeenCalledWith({
        where: { id: { in: ['tp-1', 'tp-2'] }, teamId: 'team-1' },
      });
      expect(prisma.eventConvocation.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', teamPlayerId: { notIn: ['tp-1', 'tp-2'] } },
      });
      expect(prisma.eventConvocation.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.eventConvocation.upsert).toHaveBeenNthCalledWith(1, {
        where: { eventId_teamPlayerId: { eventId: 'event-1', teamPlayerId: 'tp-1' } },
        create: { eventId: 'event-1', teamPlayerId: 'tp-1' },
        update: {},
      });
      expect(prisma.eventConvocation.upsert).toHaveBeenNthCalledWith(2, {
        where: { eventId_teamPlayerId: { eventId: 'event-1', teamPlayerId: 'tp-2' } },
        create: { eventId: 'event-1', teamPlayerId: 'tp-2' },
        update: {},
      });
      // assertEventInTeam is verified once up front, not re-run via the
      // roster re-fetch at the end (would otherwise double the clubTeam/
      // event lookups on every write).
      expect(prisma.clubTeam.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.event.findUnique).toHaveBeenCalledTimes(1);
      expect(prisma.teamPlayer.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        include: { player: true, convocations: { where: { eventId: 'event-1' } } },
        orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
      });
    });

    it('clears every convocation for the event when given an empty list, without checking the roster', async () => {
      await service.setEventConvocations('club-1', 'team-1', 'event-1', [], 'user-1');

      expect(prisma.teamPlayer.count).not.toHaveBeenCalled();
      expect(prisma.eventConvocation.deleteMany).toHaveBeenCalledWith({
        where: { eventId: 'event-1', teamPlayerId: { notIn: [] } },
      });
      expect(prisma.eventConvocation.upsert).not.toHaveBeenCalled();
    });
  });

  describe('listEventConvocations', () => {
    it('returns one entry per roster member, false/null for anyone not convoked, and isMe for the caller', async () => {
      prisma.clubTeam.findUnique.mockResolvedValue({ isOwner: true });
      prisma.event.findUnique.mockResolvedValue({
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
      prisma.teamPlayer.findMany.mockResolvedValue([
        {
          id: 'tp-1',
          playerId: 'player-1',
          role: 'PLAYER',
          player: { firstName: 'Lea', lastName: 'Bernard', userId: 'user-1' },
          convocations: [{ convokedAt: new Date('2026-01-02') }],
        },
        {
          id: 'tp-2',
          playerId: 'player-2',
          role: 'COACH',
          player: { firstName: 'Nathan', lastName: 'Hubert', userId: 'user-2' },
          convocations: [],
        },
      ]);

      const result = await service.listEventConvocations('club-1', 'team-1', 'event-1', 'user-1');

      expect(prisma.teamPlayer.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        include: { player: true, convocations: { where: { eventId: 'event-1' } } },
        orderBy: [{ player: { lastName: 'asc' } }, { player: { firstName: 'asc' } }],
      });
      expect(result).toEqual([
        {
          teamPlayerId: 'tp-1',
          playerId: 'player-1',
          firstName: 'Lea',
          lastName: 'Bernard',
          role: 'PLAYER',
          convoked: true,
          convokedAt: '2026-01-02T00:00:00.000Z',
          isMe: true,
        },
        {
          teamPlayerId: 'tp-2',
          playerId: 'player-2',
          firstName: 'Nathan',
          lastName: 'Hubert',
          role: 'COACH',
          convoked: false,
          convokedAt: null,
          isMe: false,
        },
      ]);
    });
  });
});
