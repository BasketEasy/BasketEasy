import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IMPERSONATION_READ_ONLY_CODE } from '@basketeasy/types/platform-admin-impersonation';
import type { EventRsvpChangeEntry, TeamGuestLinkInfo } from '@basketeasy/types/guest-links';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { GuestLinksService } from './guest-links.service';

@Controller('clubs/:clubId/teams/:teamId')
@UseGuards(JwtAuthGuard, TeamManagerGuard)
export class TeamGuestLinkController {
  constructor(private readonly guestLinks: GuestLinksService) {}

  @Get('guest-link')
  get(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TeamGuestLinkInfo> {
    // The URL is a write credential (anyone holding it can answer for every
    // teammate), so a read-only impersonation must not be handed it.
    if (user.impersonation) {
      throw new ForbiddenException({
        code: IMPERSONATION_READ_ONLY_CODE,
        message: "Le lien d'invité n'est pas accessible en lecture seule",
      });
    }
    return this.guestLinks.get(clubId, teamId);
  }

  @Post('guest-link')
  enable(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ url: string }> {
    return this.guestLinks.enable(clubId, teamId, user.id);
  }

  @Post('guest-link/regenerate')
  regenerate(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ url: string }> {
    return this.guestLinks.regenerate(clubId, teamId, user.id);
  }

  @Delete('guest-link')
  @HttpCode(HttpStatus.NO_CONTENT)
  disable(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    return this.guestLinks.disable(clubId, teamId, user.id);
  }

  @Get('events/:eventId/rsvps/:teamPlayerId/history')
  history(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('eventId') eventId: string,
    @Param('teamPlayerId') teamPlayerId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<EventRsvpChangeEntry[]> {
    return this.guestLinks.history(clubId, teamId, eventId, teamPlayerId, user.id);
  }
}
