import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
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
    castVote: jest.Mock;
    getEventVoteResults: jest.Mock;
    getScoresheetUploadUrl: jest.Mock;
    confirmScoresheetUpload: jest.Mock;
    getScoresheetStatus: jest.Mock;
    setEventMeeting: jest.Mock;
    refreshEventMeeting: jest.Mock;
    setMyTravelMode: jest.Mock;
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
      castVote: jest.fn(),
      getEventVoteResults: jest.fn(),
      getScoresheetUploadUrl: jest.fn(),
      confirmScoresheetUpload: jest.fn(),
      getScoresheetStatus: jest.fn(),
      setEventMeeting: jest.fn(),
      refreshEventMeeting: jest.fn(),
      setMyTravelMode: jest.fn(),
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

  it('setEventMeeting delegates the route ids, the DTO, and the caller id', async () => {
    service.setEventMeeting.mockResolvedValue({ id: 'event-1' });
    const dto = { travelMinutes: 25 };

    await controller.setEventMeeting('club-1', 'team-1', 'event-1', dto, user);

    expect(service.setEventMeeting).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      dto,
      'user-1',
    );
  });

  it('refreshEventMeeting delegates the route ids and the caller id', async () => {
    service.refreshEventMeeting.mockResolvedValue({ id: 'event-1' });

    await controller.refreshEventMeeting('club-1', 'team-1', 'event-1', user);

    expect(service.refreshEventMeeting).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      'user-1',
    );
  });

  it('setMyTravelMode delegates the route ids, the caller id, and the chosen mode', async () => {
    service.setMyTravelMode.mockResolvedValue({ id: 'event-1' });

    await controller.setMyTravelMode('club-1', 'team-1', 'event-1', { travelMode: 'DIRECT' }, user);

    expect(service.setMyTravelMode).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      'user-1',
      'DIRECT',
    );
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

  it('castVote delegates clubId, teamId, eventId, the category/teamPlayerId, and the caller id', async () => {
    const results = {
      best: [],
      worst: [],
      totalVoters: 2,
      votesCast: 1,
      myVote: { best: 'tp-2', worst: null },
    };
    service.castVote.mockResolvedValue(results);

    const result = await controller.castVote(
      'club-1',
      'team-1',
      'event-1',
      { category: 'BEST', teamPlayerId: 'tp-2' },
      user,
    );

    expect(service.castVote).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      'user-1',
      'BEST',
      'tp-2',
    );
    expect(result).toBe(results);
  });

  it('getEventVoteResults delegates clubId, teamId, eventId, and the caller id', async () => {
    const results = {
      best: [],
      worst: [],
      totalVoters: 2,
      votesCast: 0,
      myVote: { best: null, worst: null },
    };
    service.getEventVoteResults.mockResolvedValue(results);

    const result = await controller.getEventVoteResults('club-1', 'team-1', 'event-1', user);

    expect(service.getEventVoteResults).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      'user-1',
    );
    expect(result).toBe(results);
  });

  it('getScoresheetUploadUrl delegates clubId, teamId, eventId, the caller id, and contentType', async () => {
    const response = {
      uploadUrl: 'https://signed.example/upload',
      storageKey: 'scoresheets/event-1/x.jpg',
    };
    service.getScoresheetUploadUrl.mockResolvedValue(response);

    const result = await controller.getScoresheetUploadUrl(
      'club-1',
      'team-1',
      'event-1',
      { contentType: 'image/jpeg' },
      user,
    );

    expect(service.getScoresheetUploadUrl).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      'user-1',
      'image/jpeg',
    );
    expect(result).toBe(response);
  });

  it('confirmScoresheetUpload delegates clubId, teamId, eventId, the caller id, and storageKey', async () => {
    const scoresheet = {
      status: 'UPLOADED',
      uploadedByTeamPlayerId: 'tp-1',
      uploadedAt: '2026-01-01T20:00:00.000Z',
    };
    service.confirmScoresheetUpload.mockResolvedValue(scoresheet);

    const result = await controller.confirmScoresheetUpload(
      'club-1',
      'team-1',
      'event-1',
      { storageKey: 'scoresheets/event-1/x.jpg' },
      user,
    );

    expect(service.confirmScoresheetUpload).toHaveBeenCalledWith(
      'club-1',
      'team-1',
      'event-1',
      'user-1',
      'scoresheets/event-1/x.jpg',
    );
    expect(result).toBe(scoresheet);
  });

  it('getScoresheetStatus delegates clubId, teamId, and eventId, and writes the result via res.json', async () => {
    service.getScoresheetStatus.mockResolvedValue(null);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await controller.getScoresheetStatus('club-1', 'team-1', 'event-1', res as unknown as Response);

    expect(service.getScoresheetStatus).toHaveBeenCalledWith('club-1', 'team-1', 'event-1');
    // Explicit res.json(null) — not a bare `return null` — so a "nothing
    // uploaded yet" response is a real JSON body, not the empty body Nest's
    // standard response handling would otherwise send for a null return.
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(null);
  });

  it('getScoresheetStatus writes a non-null result via res.json the same way', async () => {
    const scoresheet = {
      status: 'UPLOADED',
      uploadedByTeamPlayerId: 'tp-1',
      uploadedAt: '2026-01-01T20:00:00.000Z',
    };
    service.getScoresheetStatus.mockResolvedValue(scoresheet);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await controller.getScoresheetStatus('club-1', 'team-1', 'event-1', res as unknown as Response);

    expect(res.json).toHaveBeenCalledWith(scoresheet);
  });
});
