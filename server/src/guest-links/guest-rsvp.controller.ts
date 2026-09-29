import {
  Body,
  CallHandler,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  NestInterceptor,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { GuestEvent, GuestTeamPage } from '@basketeasy/types/guest-links';
import { GuestLinkGuard, type GuestLinkContext } from './guest-link.guard';
import { GuestRsvpService } from './guest-rsvp.service';
import { GuestInviteRequestDto, GuestPlayerQueryDto, GuestRsvpDto } from './dto/guest-rsvp.dto';

// The token is in the URL, so keep it out of search indexes and out of the
// Referer sent to anything the page links to (the RDV map link).
@Injectable()
class GuestResponseHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse();
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}

type GuestRequest = Request & { guestLink: GuestLinkContext };

// Public: no JwtAuthGuard. The token is the credential.
@Controller('public/guest/:token')
@UseGuards(GuestLinkGuard)
@UseInterceptors(GuestResponseHeadersInterceptor)
export class GuestRsvpController {
  constructor(private readonly guest: GuestRsvpService) {}

  @Get()
  getPage(@Req() req: GuestRequest): Promise<GuestTeamPage> {
    return this.guest.getPage(req.guestLink.teamId);
  }

  @Put('events/:eventId/rsvp')
  setRsvp(
    @Req() req: GuestRequest,
    @Param('eventId') eventId: string,
    @Body() dto: GuestRsvpDto,
  ): Promise<GuestEvent> {
    const { teamId, token } = req.guestLink;
    return this.guest.setRsvp(teamId, token, req.ip, eventId, dto);
  }

  @Delete('events/:eventId/rsvp')
  clearRsvp(
    @Req() req: GuestRequest,
    @Param('eventId') eventId: string,
    @Query() query: GuestPlayerQueryDto,
  ): Promise<GuestEvent> {
    const { teamId, token } = req.guestLink;
    return this.guest.clearRsvp(teamId, token, req.ip, eventId, query.teamPlayerId);
  }

  @Post('invite-request')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestInvite(@Req() req: GuestRequest, @Body() dto: GuestInviteRequestDto): Promise<void> {
    const { teamId, token } = req.guestLink;
    await this.guest.requestInvite(teamId, token, req.ip, dto.teamPlayerId);
  }
}
