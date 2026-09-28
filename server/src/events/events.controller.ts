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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  EventConvocationRosterEntry,
  EventRsvpRosterEntry,
  EventScoresheet,
  EventScoresheetUploadUrlResponse,
  EventVoteResults,
  TeamEvent,
} from '@basketeasy/types/events';
import type { PaginatedResult } from '@basketeasy/types/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { AllowGuardians } from '../auth/decorators/allow-guardians.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateEventTimeDto } from './dto/update-event-time.dto';
import { ListEventsDto } from './dto/list-events.dto';
import { DeleteEventQueryDto } from './dto/delete-event-query.dto';
import { SetEventRsvpDto } from './dto/set-event-rsvp.dto';
import { SetEventTravelModeDto } from './dto/set-event-travel-mode.dto';
import { SetEventConvocationsDto } from './dto/set-event-convocations.dto';
import { SetEventLogisticsDto } from './dto/set-event-logistics.dto';
import { CastEventVoteDto } from './dto/cast-event-vote.dto';
import { GetScoresheetUploadUrlDto } from './dto/get-scoresheet-upload-url.dto';
import { ConfirmScoresheetUploadDto } from './dto/confirm-scoresheet-upload.dto';

@Controller('clubs/:clubId/teams/:teamId/events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
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
  @AllowGuardians()
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
  @AllowGuardians()
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
  @AllowGuardians()
  clearMyRsvp(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamEvent> {
    return this.eventsService.clearMyRsvp(clubId, teamId, eventId, user.id);
  }

  // ClubRolesGuard only — self-service, narrowed in EventsService to a
  // rostered member who has answered GOING, same split as RSVP above.
  @Patch(':eventId/travel-mode')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  setMyTravelMode(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: SetEventTravelModeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamEvent> {
    return this.eventsService.setMyTravelMode(clubId, teamId, eventId, user.id, dto.travelMode);
  }

  @Get(':eventId/rsvps')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
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
  @AllowGuardians()
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

  // ClubRolesGuard only — voting is self-service for any rostered member
  // (narrowed and self-vote-checked inside EventsService.castVote), same
  // defense-in-depth split as RSVP/logistics above.
  @Patch(':eventId/votes')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  castVote(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: CastEventVoteDto,
    @CurrentUser() user: RequestUser,
  ): Promise<EventVoteResults> {
    return this.eventsService.castVote(
      clubId,
      teamId,
      eventId,
      user.id,
      dto.category,
      dto.teamPlayerId,
    );
  }

  @Get(':eventId/votes')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  getEventVoteResults(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<EventVoteResults> {
    return this.eventsService.getEventVoteResults(clubId, teamId, eventId, user.id);
  }

  // ClubRolesGuard only — any rostered member may capture the scoresheet
  // (narrowed inside EventsService), same defense-in-depth split as
  // RSVP/logistics/votes above.
  @Post(':eventId/scoresheet/upload-url')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  getScoresheetUploadUrl(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: GetScoresheetUploadUrlDto,
    @CurrentUser() user: RequestUser,
  ): Promise<EventScoresheetUploadUrlResponse> {
    return this.eventsService.getScoresheetUploadUrl(
      clubId,
      teamId,
      eventId,
      user.id,
      dto.contentType,
    );
  }

  @Patch(':eventId/scoresheet')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  confirmScoresheetUpload(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Body() dto: ConfirmScoresheetUploadDto,
    @CurrentUser() user: RequestUser,
  ): Promise<EventScoresheet> {
    return this.eventsService.confirmScoresheetUpload(
      clubId,
      teamId,
      eventId,
      user.id,
      dto.storageKey,
    );
  }

  // Nest's standard response handling treats a returned `null` the same as
  // `undefined` and sends an EMPTY body (no `Content-Type`, nothing to
  // parse) instead of the JSON literal `null` — a well-known Nest gotcha.
  // `getScoresheetStatus` legitimately returns `null` (no upload yet, the
  // common case), so the frontend's `res.json()` was throwing a parse error
  // on every "nothing uploaded" response — a silent client-side failure
  // with no corresponding server-side error, since Nest never threw.
  // `@Res()` (non-passthrough) opts this one route out of Nest's automatic
  // serialization so we can call `res.json()` ourselves and guarantee a
  // real JSON body every time.
  @Get(':eventId/scoresheet')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  @AllowGuardians()
  async getScoresheetStatus(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.eventsService.getScoresheetStatus(clubId, teamId, eventId);
    res.status(HttpStatus.OK).json(result);
  }
}
