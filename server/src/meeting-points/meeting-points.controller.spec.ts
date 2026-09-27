import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { MeetingPointsController } from './meeting-points.controller';
import { MeetingPointsService } from './meeting-points.service';

describe('MeetingPointsController', () => {
  let controller: MeetingPointsController;
  let service: {
    getClubSettings: jest.Mock;
    updateClubSettings: jest.Mock;
    getTeamSettings: jest.Mock;
    updateTeamSettings: jest.Mock;
    setEventMeeting: jest.Mock;
    refreshTravel: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getClubSettings: jest.fn(),
      updateClubSettings: jest.fn(),
      getTeamSettings: jest.fn(),
      updateTeamSettings: jest.fn(),
      setEventMeeting: jest.fn(),
      refreshTravel: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeetingPointsController],
      providers: [{ provide: MeetingPointsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ClubRolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TeamManagerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(MeetingPointsController);
  });

  it('updates the club settings for the route club', async () => {
    const dto = { meetingPoint: { name: 'Parking', address: '1 rue X' }, arrivalBufferMinutes: 45 };
    await controller.updateClubSettings('club-1', dto);
    expect(service.updateClubSettings).toHaveBeenCalledWith('club-1', dto);
  });

  it('reads and updates the team settings for the route team', async () => {
    const dto = { meetingPoint: null, arrivalBufferMinutes: 60 };
    await controller.getTeamSettings('club-1', 'team-1');
    await controller.updateTeamSettings('club-1', 'team-1', dto);
    expect(service.getTeamSettings).toHaveBeenCalledWith('club-1', 'team-1');
    expect(service.updateTeamSettings).toHaveBeenCalledWith('club-1', 'team-1', dto);
  });

  it('adjusts and refreshes one match of the route team', async () => {
    const dto = { travelMinutes: 30 };
    await controller.setEventMeeting('club-1', 'team-1', 'event-1', dto);
    await controller.refreshEventMeeting('club-1', 'team-1', 'event-1');
    expect(service.setEventMeeting).toHaveBeenCalledWith('club-1', 'team-1', 'event-1', dto);
    expect(service.refreshTravel).toHaveBeenCalledWith('club-1', 'team-1', 'event-1');
  });
});
