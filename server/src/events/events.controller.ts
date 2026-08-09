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
  UseGuards,
} from '@nestjs/common';
import type { TeamEvent } from '@basketeasy/types/events';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

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
  ): Promise<TeamEvent[]> {
    return this.eventsService.listEvents(clubId, teamId);
  }

  @Post()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  createEvent(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: CreateEventDto,
  ): Promise<TeamEvent> {
    return this.eventsService.createEvent(clubId, teamId, dto);
  }

  @Patch(':eventId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  updateEvent(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
  ): Promise<TeamEvent> {
    return this.eventsService.updateEvent(clubId, teamId, eventId, dto);
  }

  @Delete(':eventId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEvent(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
  ): Promise<void> {
    return this.eventsService.deleteEvent(clubId, teamId, eventId);
  }
}
