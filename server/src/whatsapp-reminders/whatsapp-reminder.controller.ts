import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EventShareType } from '@prisma/client';
import type {
  EventShareStatus,
  EventWhatsAppShare,
  TeamWhatsAppSettings,
} from '@basketeasy/types/whatsapp-reminder';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { ConfirmEventShareDto, UpdateTeamWhatsAppSettingsDto } from './dto/whatsapp-reminder.dto';
import { WhatsAppReminderService } from './whatsapp-reminder.service';

@Controller('clubs/:clubId/teams/:teamId')
@UseGuards(JwtAuthGuard, TeamManagerGuard)
export class WhatsAppReminderController {
  constructor(private readonly reminders: WhatsAppReminderService) {}

  @Get('whatsapp-settings')
  getSettings(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamWhatsAppSettings> {
    return this.reminders.getTeamSettings(clubId, teamId);
  }

  @Patch('whatsapp-settings')
  updateSettings(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamWhatsAppSettingsDto,
  ): Promise<TeamWhatsAppSettings> {
    return this.reminders.updateTeamSettings(clubId, teamId, dto);
  }

  @Get('events/:eventId/whatsapp-share')
  getShare(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<EventWhatsAppShare> {
    return this.reminders.getEventShare(clubId, teamId, eventId, user.id);
  }

  @Post('events/:eventId/whatsapp-share/:type/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Param('type', new ParseEnumPipe(EventShareType)) type: EventShareType,
    @Body() dto: ConfirmEventShareDto,
    @CurrentUser() user: RequestUser,
  ): Promise<EventShareStatus> {
    return this.reminders.confirmShare(clubId, teamId, eventId, type, user.id, dto.platform);
  }
}
