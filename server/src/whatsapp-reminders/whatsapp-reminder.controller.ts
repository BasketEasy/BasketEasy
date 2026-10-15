import {
  Body,
  Controller,
  ForbiddenException,
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
  TeamPendingCancellation,
  TeamWhatsAppSettings,
  UpdateTeamWhatsAppSettingsResponse,
} from '@basketeasy/types/whatsapp-reminder';
import { IMPERSONATION_READ_ONLY_CODE } from '@basketeasy/types/platform-admin-impersonation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { ConfirmEventShareDto, UpdateTeamWhatsAppSettingsDto } from './dto/whatsapp-reminder.dto';
import { WhatsAppReminderService } from './whatsapp-reminder.service';

// The rendered message embeds the team's guest-link URL, a write credential
// (anyone holding it can answer RSVPs for every teammate), so a read-only
// impersonation must not be handed it.
function assertNotImpersonating(user: RequestUser): void {
  if (user.impersonation) {
    throw new ForbiddenException({
      code: IMPERSONATION_READ_ONLY_CODE,
      message: "Le message de partage contient le lien d'invité, inaccessible en lecture seule",
    });
  }
}

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
    @CurrentUser() user: RequestUser,
  ): Promise<UpdateTeamWhatsAppSettingsResponse> {
    return this.reminders.updateTeamSettings(clubId, teamId, dto, user.id);
  }

  // Cancellations whose event is gone: the team page is the only place they live.
  @Get('whatsapp-shares/pending-cancellations')
  pendingCancellations(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamPendingCancellation[]> {
    assertNotImpersonating(user);
    return this.reminders.listPendingCancellations(clubId, teamId, user.id);
  }

  @Post('whatsapp-shares/:shareId/confirm')
  @HttpCode(HttpStatus.OK)
  confirmByShareId(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('shareId') shareId: string,
    @Body() dto: ConfirmEventShareDto,
    @CurrentUser() user: RequestUser,
  ): Promise<EventShareStatus> {
    return this.reminders.confirmCancellation(clubId, teamId, shareId, user.id, dto.platform);
  }

  @Get('events/:eventId/whatsapp-share')
  getShare(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<EventWhatsAppShare> {
    assertNotImpersonating(user);
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
