import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AccessTokenResponse, AuthUser, RefreshResponse } from '@basketeasy/types/auth';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
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
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    const { accessToken, refreshToken, user } = await this.authService.register(
      dto.email,
      dto.password,
    );
    this.setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
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
    const rawToken = this.readRefreshCookie(req);
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: RequestUser): Promise<AuthUser> {
    return this.authService.me(user.id);
  }

  // Derived from ConfigService (rather than reading process.env.NODE_ENV
  // directly) for consistency with the rest of this module, and so it can be
  // mocked/asserted in tests.
  private isProductionLike(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'development';
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.isProductionLike(),
      path: '/api/auth',
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
  }

  private readRefreshCookie(req: Request): string | undefined {
    return req.cookies?.[REFRESH_COOKIE_NAME];
  }
}
