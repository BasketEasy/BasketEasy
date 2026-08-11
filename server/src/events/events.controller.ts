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
import type { TeamEvent } from '@basketeasy/types/events';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { DeleteEventQueryDto } from './dto/delete-event-query.dto';

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
  ): Promise<PaginatedResult<TeamEvent>> {
    return this.eventsService.listEvents(clubId, teamId, query);
  }

  @Post()
  @UseGuards(TeamManagerGuard)
  createEvent(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: CreateEventDto,
  ): Promise<TeamEvent[]> {
    return this.eventsService.createEvent(clubId, teamId, dto);
  }

  @Patch(':eventId')
  @UseGuards(TeamManagerGuard)
  updateEvent(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
  ): Promise<TeamEvent[]> {
    return this.eventsService.updateEvent(clubId, teamId, eventId, dto);
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
}
