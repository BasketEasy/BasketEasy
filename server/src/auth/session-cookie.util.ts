import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { REFRESH_TOKEN_TTL_MS } from './auth.constants';

// Shared by every controller that can start or continue a session
// (AuthController's login/register/refresh, InvitesController's accept) so
// the cookie's security-relevant attributes and the CSRF check guarding it
// can never drift apart between call sites.
export const REFRESH_COOKIE_NAME = 'refresh_token';

// A dedicated COOKIE_SECURE flag rather than deriving from NODE_ENV: the
// "production-image" docker-compose.yml sets NODE_ENV=development (no
// hot-reload, but still development-mode), which would otherwise silently
// ship the refresh cookie without `Secure`. Defaults to secure; only
// docker-compose.dev.yml opts out for plain-HTTP local dev.
export function isSecureCookie(config: ConfigService): boolean {
  return config.get<string>('COOKIE_SECURE') !== 'false';
}

export function setRefreshCookie(res: Response, config: ConfigService, refreshToken: string): void {
  const secure = isSecureCookie(config);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function readRefreshCookie(req: Request): string | undefined {
  return req.cookies?.[REFRESH_COOKIE_NAME];
}

// The frontend (basketeasy.pages.dev) and API (basketeasy.onrender.com) are
// different sites in production, so the refresh cookie must be `sameSite:
// 'none'` to be sent at all — which means `sameSite` does none of the CSRF
// work here. This check is the actual defense: a page the victim visits
// could auto-submit a hidden cross-site form/fetch to a cookie-setting
// endpoint (e.g. planting the attacker's session via /api/auth/login, or an
// invite accept), so every such endpoint must only accept same-origin
// requests or requests from the configured frontend origin.
// `Sec-Fetch-Site` (sent by all modern browsers) is authoritative when
// present; the `Origin` header is the fallback for older clients that omit
// it.
export function assertSameOrigin(req: Request, config: ConfigService): void {
  const frontendOrigin = config.get<string>('FRONTEND_URL') || 'http://localhost:5173';

  const fetchSite = req.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string') {
    if (fetchSite === 'same-origin' || fetchSite === 'none') {
      return;
    }
    // 'same-site' shows up when frontend and API are sibling subdomains of
    // the same registrable domain (kluvo.net / api.kluvo.net) rather than
    // fully unrelated hosts — still requires the Origin to match exactly.
    if ((fetchSite === 'cross-site' || fetchSite === 'same-site') && req.headers.origin === frontendOrigin) {
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
