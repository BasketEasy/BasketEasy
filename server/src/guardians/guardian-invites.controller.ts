import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AccessTokenResponse } from '@basketeasy/types/auth';
import type { AcceptedGuardianInvite, GuardianInvitePreview } from '@basketeasy/types/guardians';
import { assertSameOrigin, setRefreshCookie } from '../auth/session-cookie.util';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { auditContextFrom } from '../audit/audit.service';
import { GuardiansService } from './guardians.service';
import { AcceptGuardianInviteDto } from './dto/accept-guardian-invite.dto';
import { AcceptGuardianInviteAsMeDto } from './dto/accept-guardian-invite-as-me.dto';

// The preview and the register path are public, like InvitesController: a
// parent opening the link usually has no account yet. The session-creating
// route goes through the same same-origin check as AuthController. A parent
// who already plays or coaches accepts as themself instead (design
// decision 6).
@Controller('guardian-invites')
export class GuardianInvitesController {
  constructor(
    private readonly guardians: GuardiansService,
    private readonly config: ConfigService,
  ) {}

  @Get(':token')
  getPreview(@Param('token') token: string): Promise<GuardianInvitePreview> {
    return this.guardians.getPreview(token);
  }

  @Post(':token/accept')
  async accept(
    @Req() req: Request,
    @Param('token') token: string,
    @Body() dto: AcceptGuardianInviteDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    assertSameOrigin(req, this.config);
    const { accessToken, refreshToken, user } = await this.guardians.acceptWithRegistration(
      token,
      dto,
      auditContextFrom(req),
    );
    setRefreshCookie(res, this.config, refreshToken);
    return { accessToken, user };
  }

  @Post(':token/accept-as-me')
  @UseGuards(JwtAuthGuard)
  acceptAsMe(
    @Req() req: Request,
    @Param('token') token: string,
    @Body() dto: AcceptGuardianInviteAsMeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AcceptedGuardianInvite> {
    return this.guardians.acceptAsUser(token, user.id, dto.consent, auditContextFrom(req));
  }
}
