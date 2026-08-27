import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

const user: RequestUser = { id: 'user-1', email: 'coach@example.com' };

describe('EventsController', () => {
  let controller: EventsController;
  let service: {
    listEvents: jest.Mock;
    getEvent: jest.Mock;
    createEvent: jest.Mock;
    updateEvent: jest.Mock;
    updateEventTimeOfDay: jest.Mock;
    deleteEvent: jest.Mock;
    setMyRsvp: jest.Mock;
    clearMyRsvp: jest.Mock;
    listEventRsvps: jest.Mock;
    setEventConvocations: jest.Mock;
    listEventConvocations: jest.Mock;
    setEventLogistics: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      listEvents: jest.fn(),
      getEvent: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      updateEventTimeOfDay: jest.fn(),
      deleteEvent: jest.fn(),
      setMyRsvp: jest.fn(),
      clearMyRsvp: jest.fn(),
      listEventRsvps: jest.fn(),
      setEventConvocations: jest.fn(),
      listEventConvocations: jest.fn(),
      setEventLogistics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ClubRolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TeamManagerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EventsController>(EventsController);
  });

  it('listEvents delegates clubId, teamId, the query params, and the caller id', async () => {
    service.listEvents.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });

    const query = { sortOrder: 'desc' as const };
    const result = await controller.listEvents('club-1', 'team-1', query, user);

    expect(service.listEvents).toHaveBeenCalledWith('club-1', 'team-1', query, 'user-1');
    expect(result.total).toBe(0);
  });

  it('getEvent delegates clubId, teamId, eventId, and the caller id', async () => {
    service.getEvent.mockResolvedValue({ id: 'event-1', teamId: 'team-1' });

    const result = await controller.getEvent('club-1', 'team-1', 'event-1', user);

    expect(service.getEvent).toHaveBeenCalledWith('club-1', 'team-1', 'event-1', 'user-1');
    expect(result.id).toBe('event-1');
  });

  it('createEvent delegates clubId, teamId, the DTO, and the caller id', async () => {
    service.createEvent.mockResolvedValue([
      {
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: '2026-01-05T18:00:00.000Z',
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        recurrenceId: null,
        createdAt: 'x',
        myRsvpStatus: null,
      },
    ]);

    const dto = {
      type: 'TRAINING' as const,
      startsAt: '2026-01-05T18:00:00.000Z',
      location: 'Gymnase A',
    };
    const result = await controller.createEvent('club-1', 'team-1', dto, user);

    expect(service.createEvent).toHaveBeenCalledWith('club-1', 'team-1', dto, 'user-1');
    expect(result[0].id).toBe('event-1');
  });

  it('updateEvent delegates clubId, teamId, eventId, the DTO, and the caller id', async () => {
    service.updateEvent.mockResolvedValue([
      {
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: '2026-01-05T18:00:00.000Z',
        location: 'Gymnase B',
        notes: null,
        opponentName: null,
        recurrenceId: null,
        createdAt: 'x',
        myRsvpStatus: null,
      },
    ]);

    const result = await controller.updateEvent(
      'club-1',
      'team-1',
      'event-1',
      { location: 'Gymnase B' },
      user,
    );

    expect(service.updateEvent).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      { location: 'Gymnase B' },
      'user-1',
    );
    expect(result[0].location).toBe('Gymnase B');
  });

  it('updateEventTime delegates clubId, teamId, eventId, the DTO, and the caller id', async () => {
    service.updateEventTimeOfDay.mockResolvedValue([
      {
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: '2026-01-05T19:30:00.000Z',
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        recurrenceId: 'series-1',
        createdAt: 'x',
        myRsvpStatus: null,
      },
    ]);

    const dto = { scope: 'ALL' as const, hour: 19, minute: 30 };
    const result = await controller.updateEventTime('club-1', 'team-1', 'event-1', dto, user);

    expect(service.updateEventTimeOfDay).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      dto,
      'user-1',
    );
    expect(result[0].startsAt).toBe('2026-01-05T19:30:00.000Z');
  });

  it('deleteEvent delegates clubId, teamId, eventId, and the scope query param', async () => {
    service.deleteEvent.mockResolvedValue(undefined);

    await controller.deleteEvent('club-1', 'team-1', 'event-1', { scope: 'ALL' });

    expect(service.deleteEvent).toHaveBeenCalledWith('club-1', 'team-1', 'event-1', 'ALL');
  });

  it('deleteEvent passes undefined scope through when the query omits it', async () => {
    service.deleteEvent.mockResolvedValue(undefined);

    await controller.deleteEvent('club-1', 'team-1', 'event-1', {});

    expect(service.deleteEvent).toHaveBeenCalledWith('club-1', 'team-1', 'event-1', undefined);
  });

  it('setMyRsvp delegates clubId, teamId, eventId, the caller id, and the status', async () => {
    service.setMyRsvp.mockResolvedValue({
      id: 'event-1',
      teamId: 'team-1',
      type: 'TRAINING',
      startsAt: '2026-01-05T18:00:00.000Z',
      location: 'Gymnase A',
      notes: null,
      opponentName: null,
      recurrenceId: null,
      createdAt: 'x',
      myRsvpStatus: 'GOING',
    });

    const result = await controller.setMyRsvp(
      'club-1',
      'team-1',
      'event-1',
      { status: 'GOING' },
      user,
    );

    expect(service.setMyRsvp).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      'user-1',
      'GOING',
    );
    expect(result.myRsvpStatus).toBe('GOING');
  });

  it('clearMyRsvp delegates clubId, teamId, eventId, and the caller id', async () => {
    service.clearMyRsvp.mockResolvedValue({
      id: 'event-1',
      teamId: 'team-1',
      type: 'TRAINING',
      startsAt: '2026-01-05T18:00:00.000Z',
      location: 'Gymnase A',
      notes: null,
      opponentName: null,
      recurrenceId: null,
      createdAt: 'x',
      myRsvpStatus: null,
    });

    const result = await controller.clearMyRsvp('club-1', 'team-1', 'event-1', user);

    expect(service.clearMyRsvp).toHaveBeenCalledWith('club-1', 'team-1', 'event-1', 'user-1');
    expect(result.myRsvpStatus).toBeNull();
  });

  it('listEventRsvps delegates clubId, teamId, eventId, and the caller id', async () => {
    service.listEventRsvps.mockResolvedValue([
      {
        teamPlayerId: 'tp-1',
        playerId: 'player-1',
        firstName: 'Lea',
        lastName: 'Bernard',
        role: 'PLAYER',
        status: 'GOING',
        respondedAt: 'x',
        isMe: true,
      },
    ]);

    const result = await controller.listEventRsvps('club-1', 'team-1', 'event-1', user);

    expect(service.listEventRsvps).toHaveBeenCalledWith('club-1', 'team-1', 'event-1', 'user-1');
    expect(result[0].isMe).toBe(true);
  });

  it('setEventConvocations delegates clubId, teamId, eventId, the ids, and the caller id', async () => {
    service.setEventConvocations.mockResolvedValue([
      {
        teamPlayerId: 'tp-1',
        playerId: 'player-1',
        firstName: 'Lea',
        lastName: 'Bernard',
        role: 'PLAYER',
        convoked: true,
        convokedAt: 'x',
        isMe: true,
      },
    ]);

    const result = await controller.setEventConvocations(
      'club-1',
      'team-1',
      'event-1',
      { teamPlayerIds: ['tp-1'] },
      user,
    );

    expect(service.setEventConvocations).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      ['tp-1'],
      'user-1',
    );
    expect(result[0].convoked).toBe(true);
  });

  it('listEventConvocations delegates clubId, teamId, eventId, and the caller id', async () => {
    service.listEventConvocations.mockResolvedValue([
      {
        teamPlayerId: 'tp-1',
        playerId: 'player-1',
        firstName: 'Lea',
        lastName: 'Bernard',
        role: 'PLAYER',
        convoked: false,
        convokedAt: null,
        isMe: true,
      },
    ]);

    const result = await controller.listEventConvocations('club-1', 'team-1', 'event-1', user);

    expect(service.listEventConvocations).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      'user-1',
    );
    expect(result[0].isMe).toBe(true);
  });

  it('setEventLogistics delegates clubId, teamId, eventId, the field/teamPlayerId, and the caller id', async () => {
    service.setEventLogistics.mockResolvedValue({ id: 'event-1', type: 'MATCH' });

    const result = await controller.setEventLogistics(
      'club-1',
      'team-1',
      'event-1',
      { field: 'JERSEYS', teamPlayerId: 'tp-1' },
      user,
    );

    expect(service.setEventLogistics).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      'user-1',
      'JERSEYS',
      'tp-1',
    );
    expect(result.id).toBe('event-1');
  });
});
