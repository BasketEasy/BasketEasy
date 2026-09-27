import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  ClubMeetingSettings,
  EventMeetingPlan,
  TeamMeetingSettings,
} from '@basketeasy/types/meeting-points';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { MeetingPointsService } from './meeting-points.service';
import { UpdateClubMeetingSettingsDto } from './dto/update-club-meeting-settings.dto';
import { UpdateTeamMeetingSettingsDto } from './dto/update-team-meeting-settings.dto';
import { UpdateEventMeetingDto } from './dto/update-event-meeting.dto';

// Every meeting route, the per-match ones included, lives here: they answer
// with the meeting plan rather than a whole TeamEvent, so this module never
// depends on Events (Events depends on it, for the plan on every TeamEvent).
@Controller('clubs/:clubId')
@UseGuards(JwtAuthGuard)
export class MeetingPointsController {
  constructor(private readonly meetingPoints: MeetingPointsService) {}

  @Get('meeting-settings')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  getClubSettings(@Param('clubId') clubId: string): Promise<ClubMeetingSettings> {
    return this.meetingPoints.getClubSettings(clubId);
  }

  @Patch('meeting-settings')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  updateClubSettings(
    @Param('clubId') clubId: string,
    @Body() dto: UpdateClubMeetingSettingsDto,
  ): Promise<ClubMeetingSettings> {
    return this.meetingPoints.updateClubSettings(clubId, dto);
  }

  @Get('teams/:teamId/meeting-settings')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  getTeamSettings(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamMeetingSettings> {
    return this.meetingPoints.getTeamSettings(clubId, teamId);
  }

  @Patch('teams/:teamId/meeting-settings')
  @UseGuards(TeamManagerGuard)
  updateTeamSettings(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamMeetingSettingsDto,
  ): Promise<TeamMeetingSettings> {
    return this.meetingPoints.updateTeamSettings(clubId, teamId, dto);
  }

  @Patch('teams/:teamId/events/:eventId/meeting')
  @UseGuards(TeamManagerGuard)
  setEventMeeting(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventMeetingDto,
  ): Promise<EventMeetingPlan> {
    return this.meetingPoints.setEventMeeting(clubId, teamId, eventId, dto);
  }

  @Post('teams/:teamId/events/:eventId/meeting/refresh')
  @UseGuards(TeamManagerGuard)
  @HttpCode(HttpStatus.OK)
  refreshEventMeeting(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
  ): Promise<EventMeetingPlan> {
    return this.meetingPoints.refreshTravel(clubId, teamId, eventId);
  }
}
