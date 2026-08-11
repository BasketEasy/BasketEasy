import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';

describe('EventsController', () => {
  let controller: EventsController;
  let service: {
    listEvents: jest.Mock;
    createEvent: jest.Mock;
    updateEvent: jest.Mock;
    deleteEvent: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      listEvents: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
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

  it('listEvents delegates clubId, teamId, and the query params', async () => {
    service.listEvents.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });

    const query = { sortOrder: 'desc' as const };
    const result = await controller.listEvents('club-1', 'team-1', query);

    expect(service.listEvents).toHaveBeenCalledWith('club-1', 'team-1', query);
    expect(result.total).toBe(0);
  });

  it('createEvent delegates clubId, teamId, and the DTO', async () => {
    service.createEvent.mockResolvedValue([
      {
        id: 'event-1',
        teamId: 'team-1',
        startsAt: '2026-01-05T18:00:00.000Z',
        location: 'Gymnase A',
        notes: null,
        createdAt: 'x',
      },
    ]);

    const dto = { startsAt: '2026-01-05T18:00:00.000Z', location: 'Gymnase A' };
    const result = await controller.createEvent('club-1', 'team-1', dto);

    expect(service.createEvent).toHaveBeenCalledWith('club-1', 'team-1', dto);
    expect(result[0].id).toBe('event-1');
  });

  it('updateEvent delegates clubId, teamId, eventId, and the DTO', async () => {
    service.updateEvent.mockResolvedValue({
      id: 'event-1',
      teamId: 'team-1',
      startsAt: '2026-01-05T18:00:00.000Z',
      location: 'Gymnase B',
      notes: null,
      createdAt: 'x',
    });

    const result = await controller.updateEvent('club-1', 'team-1', 'event-1', {
      location: 'Gymnase B',
    });

    expect(service.updateEvent).toHaveBeenCalledWith('club-1', 'team-1', 'event-1', {
      location: 'Gymnase B',
    });
    expect(result.location).toBe('Gymnase B');
  });

  it('deleteEvent delegates clubId, teamId, and eventId', async () => {
    service.deleteEvent.mockResolvedValue(undefined);

    await controller.deleteEvent('club-1', 'team-1', 'event-1');

    expect(service.deleteEvent).toHaveBeenCalledWith('club-1', 'team-1', 'event-1');
  });
});
