import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AccessTokenResponse } from '@basketeasy/types/auth';
import type { AcceptedPlayerInvite, PlayerInvitePreview } from '@basketeasy/types/player-invites';
import { assertSameOrigin, setRefreshCookie } from '../auth/session-cookie.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { AcceptPlayerInviteDto } from './dto/accept-player-invite.dto';
import { InvitesService } from './invites.service';

// Public (no JwtAuthGuard) — a brand-new player has no session yet when they
// open this link. The two cookie-setting/session-creating actions still go
// through the same same-origin check as AuthController's endpoints; see
// session-cookie.util.ts for why that's the actual CSRF defense here.
@Controller('invites')
export class InvitesController {
  constructor(
    private readonly invitesService: InvitesService,
    private readonly config: ConfigService,
  ) {}

  @Get(':token')
  getPreview(@Param('token') token: string): Promise<PlayerInvitePreview> {
    return this.invitesService.getPreview(token);
  }

  @Post(':token/accept')
  async accept(
    @Req() req: Request,
    @Param('token') token: string,
    @Body() dto: AcceptPlayerInviteDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    assertSameOrigin(req, this.config);
    const { accessToken, refreshToken, user } = await this.invitesService.accept(
      token,
      dto.email,
      dto.password,
    );
    setRefreshCookie(res, this.config, refreshToken);
    return { accessToken, user };
  }

  // For a visitor who already has an account. Behind JwtAuthGuard, so it needs
  // no same-origin check: it sets no cookie and a cross-site form post carries
  // no bearer token.
  @Post(':token/accept-as-me')
  @UseGuards(JwtAuthGuard)
  acceptAsMe(
    @Param('token') token: string,
    @CurrentUser() user: RequestUser,
  ): Promise<AcceptedPlayerInvite> {
    return this.invitesService.acceptAsUser(token, user.id);
  }
}
