import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  EventConvocationRosterEntry,
  EventRsvpRosterEntry,
  TeamEvent,
} from '@basketeasy/types/events';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventTimeDto } from './dto/update-event-time.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { DeleteEventQueryDto } from './dto/delete-event-query.dto';
import { SetEventRsvpDto } from './dto/set-event-rsvp.dto';
import { SetEventConvocationsDto } from './dto/set-event-convocations.dto';
import { SetEventLogisticsDto } from './dto/set-event-logistics.dto';

@Controller('clubs/:clubId/teams/:teamId/events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listEvents(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Query() query: ListEventsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<PaginatedResult<TeamEvent>> {
    return this.eventsService.listEvents(clubId, teamId, query, user.id);
  }

  @Get(':eventId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  getEvent(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamEvent> {
    return this.eventsService.getEvent(clubId, teamId, eventId, user.id);
  }

  @Post()
  @UseGuards(TeamManagerGuard)
  createEvent(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: CreateEventDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamEvent[]> {
    return this.eventsService.createEvent(clubId, teamId, dto, user.id);
  }

  @Patch(':eventId')
  @UseGuards(TeamManagerGuard)
  updateEvent(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamEvent[]> {
    return this.eventsService.updateEvent(clubId, teamId, eventId, dto, user.id);
  }

  @Patch(':eventId/time')
  @UseGuards(TeamManagerGuard)
  updateEventTime(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventTimeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamEvent[]> {
    return this.eventsService.updateEventTimeOfDay(clubId, teamId, eventId, dto, user.id);
  }

  @Delete(':eventId')
  @UseGuards(TeamManagerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEvent(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Query() query: DeleteEventQueryDto,
  ): Promise<void> {
    return this.eventsService.deleteEvent(clubId, teamId, eventId, query.scope);
  }

  @Patch(':eventId/rsvp')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  setMyRsvp(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: SetEventRsvpDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamEvent> {
    return this.eventsService.setMyRsvp(clubId, teamId, eventId, user.id, dto.status);
  }

  @Delete(':eventId/rsvp')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  clearMyRsvp(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamEvent> {
    return this.eventsService.clearMyRsvp(clubId, teamId, eventId, user.id);
  }

  @Get(':eventId/rsvps')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listEventRsvps(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<EventRsvpRosterEntry[]> {
    return this.eventsService.listEventRsvps(clubId, teamId, eventId, user.id);
  }

  @Patch(':eventId/convocations')
  @UseGuards(TeamManagerGuard)
  setEventConvocations(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: SetEventConvocationsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<EventConvocationRosterEntry[]> {
    return this.eventsService.setEventConvocations(
      clubId,
      teamId,
      eventId,
      dto.teamPlayerIds,
      user.id,
    );
  }

  @Get(':eventId/convocations')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listEventConvocations(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<EventConvocationRosterEntry[]> {
    return this.eventsService.listEventConvocations(clubId, teamId, eventId, user.id);
  }

  // ClubRolesGuard only (not TeamManagerGuard) — self-assign/self-clear is
  // open to any rostered member, narrowed to the manager-only reassign case
  // inside EventsService.setEventLogistics, same defense-in-depth split as
  // the RSVP/convocation routes above.
  @Patch(':eventId/logistics')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  setEventLogistics(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: SetEventLogisticsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamEvent> {
    return this.eventsService.setEventLogistics(
      clubId,
      teamId,
      eventId,
      user.id,
      dto.field,
      dto.teamPlayerId,
    );
  }
}
