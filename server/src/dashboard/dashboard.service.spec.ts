import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    clubMembership: { findMany: jest.Mock };
    teamAdmin: { findMany: jest.Mock };
    teamPlayer: { findMany: jest.Mock };
    player: { count: jest.Mock };
    event: { findMany: jest.Mock };
    eventRsvp: { findMany: jest.Mock };
    eventConvocation: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      clubMembership: { findMany: jest.fn() },
      teamAdmin: { findMany: jest.fn() },
      teamPlayer: { findMany: jest.fn() },
      player: { count: jest.fn() },
      event: { findMany: jest.fn() },
      eventRsvp: { findMany: jest.fn().mockResolvedValue([]) },
      eventConvocation: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DashboardService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  function mockEmptyMemberships() {
    prisma.clubMembership.findMany.mockResolvedValue([]);
    prisma.teamAdmin.findMany.mockResolvedValue([]);
    prisma.teamPlayer.findMany.mockResolvedValue([]);
  }

  it('returns zero players and no events for a user with no admin clubs or teams', async () => {
    mockEmptyMemberships();

    const result = await service.getDashboard('user-1');

    expect(result).toEqual({ totalPlayers: 0, upcomingEvents: [] });
    expect(prisma.player.count).not.toHaveBeenCalled();
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('counts players across the clubs the user administers only', async () => {
    prisma.clubMembership.findMany
      .mockResolvedValueOnce([{ clubId: 'club-1' }])
      .mockResolvedValueOnce([{ clubId: 'club-1' }, { clubId: 'club-2' }]);
    prisma.teamAdmin.findMany.mockResolvedValue([]);
    prisma.teamPlayer.findMany.mockResolvedValue([]);
    prisma.player.count.mockResolvedValue(12);

    const result = await service.getDashboard('user-1');

    expect(prisma.player.count).toHaveBeenCalledWith({
      where: { clubId: { in: ['club-1'] } },
    });
    expect(result.totalPlayers).toBe(12);
  });

  it("builds agenda events from the caller's admin and roster teams, deduped", async () => {
    mockEmptyMemberships();
    prisma.clubMembership.findMany.mockResolvedValue([{ clubId: 'club-1' }]);
    prisma.teamAdmin.findMany.mockResolvedValue([{ teamId: 'team-1' }]);
    prisma.teamPlayer.findMany.mockResolvedValue([
      { id: 'tp-1', teamId: 'team-1' },
      { id: 'tp-2', teamId: 'team-2' },
    ]);
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-08-12T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'Les Aigles',
        team: {
          name: 'U15 Filles',
          clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }],
        },
      },
    ]);

    const result = await service.getDashboard('user-1');

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ teamId: { in: ['team-1', 'team-2'] } }),
      }),
    );
    expect(result.upcomingEvents).toEqual([
      {
        eventId: 'event-1',
        teamId: 'team-1',
        teamName: 'U15 Filles',
        clubId: 'club-1',
        clubName: 'COC Basket',
        type: 'MATCH',
        startsAt: '2026-08-12T18:00:00.000Z',
        location: 'Gymnase A',
        notes: null,
        opponentName: 'Les Aigles',
        myRsvpStatus: null,
        myConvocation: false,
      },
    ]);
  });

  it("resolves the caller's own RSVP status and convocation flag from their TeamPlayer rows", async () => {
    mockEmptyMemberships();
    prisma.teamPlayer.findMany.mockResolvedValue([{ id: 'tp-1', teamId: 'team-1' }]);
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-08-12T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        team: { name: 'U15 Filles', clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }] },
      },
      {
        id: 'event-2',
        teamId: 'team-1',
        type: 'MATCH',
        startsAt: new Date('2026-08-13T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        opponentName: 'Les Aigles',
        team: { name: 'U15 Filles', clubTeams: [{ club: { id: 'club-1', name: 'COC Basket' } }] },
      },
    ]);
    prisma.eventRsvp.findMany.mockResolvedValue([{ eventId: 'event-1', status: 'GOING' }]);
    prisma.eventConvocation.findMany.mockResolvedValue([{ eventId: 'event-2' }]);

    const result = await service.getDashboard('user-1');

    expect(prisma.eventRsvp.findMany).toHaveBeenCalledWith({
      where: { teamPlayerId: { in: ['tp-1'] }, eventId: { in: ['event-1', 'event-2'] } },
    });
    expect(result.upcomingEvents).toEqual([
      expect.objectContaining({ eventId: 'event-1', myRsvpStatus: 'GOING', myConvocation: false }),
      expect.objectContaining({ eventId: 'event-2', myRsvpStatus: null, myConvocation: true }),
    ]);
  });

  it('defaults the agenda window to now through +7 days when from/to are omitted', async () => {
    mockEmptyMemberships();
    prisma.clubMembership.findMany.mockResolvedValue([]);
    prisma.teamAdmin.findMany.mockResolvedValue([{ teamId: 'team-1' }]);
    prisma.event.findMany.mockResolvedValue([]);

    const before = Date.now();
    await service.getDashboard('user-1');
    const after = Date.now();

    const call = prisma.event.findMany.mock.calls[0][0];
    const gte: Date = call.where.startsAt.gte;
    const lte: Date = call.where.startsAt.lte;
    expect(gte.getTime()).toBeGreaterThanOrEqual(before);
    expect(gte.getTime()).toBeLessThanOrEqual(after);
    expect(lte.getTime() - gte.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('picks the club the caller belongs to over other linked clubs on a CTC team', async () => {
    prisma.clubMembership.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ clubId: 'club-2' }]);
    prisma.teamAdmin.findMany.mockResolvedValue([{ teamId: 'team-1' }]);
    prisma.teamPlayer.findMany.mockResolvedValue([]);
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: new Date('2026-08-12T18:00:00.000Z'),
        location: 'Gymnase A',
        notes: null,
        team: {
          name: 'U15 Filles (CTC)',
          clubTeams: [
            { club: { id: 'club-1', name: 'Owning Club' } },
            { club: { id: 'club-2', name: 'Partner Club' } },
          ],
        },
      },
    ]);

    const result = await service.getDashboard('user-1');

    expect(result.upcomingEvents[0].clubId).toBe('club-2');
    expect(result.upcomingEvents[0].clubName).toBe('Partner Club');
  });
});
