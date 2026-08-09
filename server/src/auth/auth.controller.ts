import {
  Body,
  Controller,
  ForbiddenException,
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
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from './decorators/current-user.decorator';
import { REFRESH_TOKEN_TTL_MS } from './auth.constants';

const REFRESH_COOKIE_NAME = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  async register(
    @Req() req: Request,
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    this.assertSameOrigin(req);
    const { accessToken, refreshToken, user } = await this.authService.register(
      dto.email,
      dto.password,
    );
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post('login')
  async login(
    @Req() req: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    this.assertSameOrigin(req);
    const { accessToken, refreshToken, user } = await this.authService.login(
      dto.email,
      dto.password,
    );
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    this.assertSameOrigin(req);
    const rawToken = this.readRefreshCookie(req);
    if (!rawToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const { accessToken, refreshToken } = await this.authService.refresh(rawToken);
    this.setRefreshCookie(res, refreshToken);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.assertSameOrigin(req);
    const rawToken = this.readRefreshCookie(req);
    if (rawToken) {
      await this.authService.logout(rawToken);
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

  // A dedicated COOKIE_SECURE flag rather than deriving from NODE_ENV: the
  // "production-image" docker-compose.yml sets NODE_ENV=development (no
  // hot-reload, but still development-mode), which would otherwise silently
  // ship the refresh cookie without `Secure`. Defaults to secure; only
  // docker-compose.dev.yml opts out for plain-HTTP local dev.
  private isSecureCookie(): boolean {
    return this.config.get<string>('COOKIE_SECURE') !== 'false';
  }

  // The frontend (basketeasy.pages.dev) and API (basketeasy.onrender.com) are
  // different sites in production, so the refresh cookie must be `sameSite:
  // 'none'` to be sent at all — which means `sameSite` does none of the CSRF
  // work here. This check is the actual defense: a page the victim visits
  // could auto-submit a hidden cross-site form/fetch to these endpoints
  // (e.g. planting the attacker's session via /api/auth/login, or forcing a
  // refresh/logout), so every cookie-touching endpoint must only accept
  // same-origin requests or requests from the configured frontend origin.
  // `Sec-Fetch-Site` (sent by all modern browsers) is authoritative when
  // present; the `Origin` header is the fallback for older clients that omit
  // it.
  private assertSameOrigin(req: Request): void {
    const frontendOrigin = this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    const fetchSite = req.headers['sec-fetch-site'];
    if (typeof fetchSite === 'string') {
      if (fetchSite === 'same-origin' || fetchSite === 'none') {
        return;
      }
      if (fetchSite === 'cross-site' && req.headers.origin === frontendOrigin) {
        return;
      }
      throw new ForbiddenException('Cross-site request rejected');
    }

    const origin = req.headers.origin;
    if (typeof origin === 'string') {
      if (origin !== `${req.protocol}://${req.get('host')}` && origin !== frontendOrigin) {
        throw new ForbiddenException('Cross-site request rejected');
      }
    }
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      sameSite: this.isSecureCookie() ? 'none' : 'lax',
      secure: this.isSecureCookie(),
      path: '/api/auth',
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
  }

  private readRefreshCookie(req: Request): string | undefined {
    return req.cookies?.[REFRESH_COOKIE_NAME];
  }
}
