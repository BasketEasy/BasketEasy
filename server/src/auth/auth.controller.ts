import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AccessTokenResponse, RefreshResponse, User } from '@basketeasy/types/auth';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ConfirmEmailDto } from './dto/confirm-email.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { auditContextFrom } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { AccountSecurityService } from './account-security.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from './decorators/current-user.decorator';
import {
  REFRESH_COOKIE_NAME,
  assertSameOrigin,
  readRefreshCookie,
  setRefreshCookie,
} from './session-cookie.util';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly accountSecurity: AccountSecurityService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Req() req: Request,
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    assertSameOrigin(req, this.config);
    const { accessToken, refreshToken, user } = await this.authService.register(
      dto.email,
      dto.password,
    );
    setRefreshCookie(res, this.config, refreshToken);

    // Fire-and-forget: a new account is usable immediately (only
    // EmailVerifiedGuard's three routes need a confirmed address), so waiting
    // on the mail provider would delay the registration response for no gain,
    // and a provider outage must not fail a registration that has already
    // committed. The user can always ask for another link from /account.
    void this.accountSecurity.sendVerificationEmail(user.id);

    return { accessToken, user };
  }

  @Post('login')
  async login(
    @Req() req: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    assertSameOrigin(req, this.config);
    const { accessToken, refreshToken, user } = await this.authService.login(
      dto.email,
      dto.password,
      auditContextFrom(req),
    );
    setRefreshCookie(res, this.config, refreshToken);
    return { accessToken, user };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    assertSameOrigin(req, this.config);
    const rawToken = readRefreshCookie(req);
    if (!rawToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const { accessToken, refreshToken } = await this.authService.refresh(
      rawToken,
      auditContextFrom(req),
    );
    setRefreshCookie(res, this.config, refreshToken);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    assertSameOrigin(req, this.config);
    const rawToken = readRefreshCookie(req);
    if (rawToken) {
      await this.authService.logout(rawToken, auditContextFrom(req));
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: RequestUser): Promise<User> {
    return this.authService.me(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto): Promise<User> {
    return this.authService.updateProfile(user.id, dto);
  }

  // --- E-mail verification and password reset ---
  //
  // The two password-reset routes always answer 204 with no body, regardless
  // of whether the address is known — load-bearing, since a public endpoint
  // that responded differently for a known and an unknown address would be a
  // user-enumeration oracle. Verification doesn't need that guarantee: the
  // token is a private link e-mailed to the account itself, not tied to a
  // public address lookup, so `confirmEmail` reports failure directly
  // (BadRequestException, 400) for an invalid, expired, or address-mismatched
  // token — see account-security.service.ts.
  //
  // Only the "request" half of verification is authenticated: confirming runs
  // from an inbox link, which the visitor may well open in a browser with no
  // session (a different device from the one they registered on).

  @Post('verify-email/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async requestEmailVerification(
    @Req() req: Request,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    assertSameOrigin(req, this.config);
    await this.accountSecurity.sendVerificationEmail(user.id);
  }

  @Post('verify-email/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmEmail(@Req() req: Request, @Body() dto: ConfirmEmailDto): Promise<void> {
    assertSameOrigin(req, this.config);
    await this.accountSecurity.confirmEmail(dto.token, auditContextFrom(req));
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestPasswordReset(
    @Req() req: Request,
    @Body() dto: RequestPasswordResetDto,
  ): Promise<void> {
    assertSameOrigin(req, this.config);
    await this.accountSecurity.requestPasswordReset(dto.email, auditContextFrom(req));
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(@Req() req: Request, @Body() dto: ResetPasswordDto): Promise<void> {
    assertSameOrigin(req, this.config);
    await this.accountSecurity.resetPassword(dto.token, dto.password, auditContextFrom(req));
  }
}
