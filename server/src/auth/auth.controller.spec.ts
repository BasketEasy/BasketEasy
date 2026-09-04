import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountSecurityService } from './account-security.service';

function buildReq(headers: Record<string, string> = {}): Request {
  return {
    headers,
    protocol: 'http',
    get: (name: string) => (name.toLowerCase() === 'host' ? 'example.com' : undefined),
  } as unknown as Request;
}

describe('AuthController', () => {
  let controller: AuthController;
  let service: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    me: jest.Mock;
    updateProfile: jest.Mock;
  };
  let accountSecurity: {
    sendVerificationEmail: jest.Mock;
    confirmEmail: jest.Mock;
    requestPasswordReset: jest.Mock;
    resetPassword: jest.Mock;
  };
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };

  async function buildController(cookieSecure: string | undefined): Promise<AuthController> {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        { provide: AccountSecurityService, useValue: accountSecurity },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => (key === 'COOKIE_SECURE' ? cookieSecure : undefined)),
          },
        },
      ],
    }).compile();

    return module.get<AuthController>(AuthController);
  }

  beforeEach(async () => {
    service = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      me: jest.fn(),
      updateProfile: jest.fn(),
    };
    accountSecurity = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      confirmEmail: jest.fn().mockResolvedValue(undefined),
      requestPasswordReset: jest.fn().mockResolvedValue(undefined),
      resetPassword: jest.fn().mockResolvedValue(undefined),
    };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };

    controller = await buildController(undefined);
  });

  it('register sets the refresh cookie and returns the access token + user', async () => {
    service.register.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'a@b.com', memberships: [] },
    });

    const result = await controller.register(
      buildReq(),
      { email: 'a@b.com', password: 'password123' },
      res as unknown as Response,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-1',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        path: '/api/auth',
      }),
    );
    expect(result).toEqual({
      accessToken: 'access-1',
      user: { id: 'user-1', email: 'a@b.com', memberships: [] },
    });
  });

  it('register rejects a cross-site request (Sec-Fetch-Site)', async () => {
    await expect(
      controller.register(
        buildReq({ 'sec-fetch-site': 'cross-site' }),
        { email: 'a@b.com', password: 'password123' },
        res as unknown as Response,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.register).not.toHaveBeenCalled();
  });

  it('register rejects a cross-origin request (Origin fallback)', async () => {
    await expect(
      controller.register(
        buildReq({ origin: 'https://evil.example' }),
        { email: 'a@b.com', password: 'password123' },
        res as unknown as Response,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.register).not.toHaveBeenCalled();
  });

  it('register allows a cross-site request from the configured frontend origin', async () => {
    service.register.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'a@b.com', memberships: [] },
    });

    await controller.register(
      buildReq({ 'sec-fetch-site': 'cross-site', origin: 'http://localhost:5173' }),
      { email: 'a@b.com', password: 'password123' },
      res as unknown as Response,
    );

    expect(service.register).toHaveBeenCalled();
  });

  it('sets a non-secure cookie only when COOKIE_SECURE is "false"', async () => {
    service.register.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'a@b.com', memberships: [] },
    });
    const devController = await buildController('false');

    await devController.register(
      buildReq(),
      { email: 'a@b.com', password: 'password123' },
      res as unknown as Response,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-1',
      expect.objectContaining({ secure: false }),
    );
  });

  it('sets a secure cookie when COOKIE_SECURE is unset (defaults to secure)', async () => {
    service.register.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'a@b.com', memberships: [] },
    });
    const unsetController = await buildController(undefined);

    await unsetController.register(
      buildReq(),
      { email: 'a@b.com', password: 'password123' },
      res as unknown as Response,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-1',
      expect.objectContaining({ secure: true }),
    );
  });

  it('login sets the refresh cookie and returns the access token + user', async () => {
    service.login.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'a@b.com', memberships: [] },
    });

    const result = await controller.login(
      buildReq(),
      { email: 'a@b.com', password: 'password123' },
      res as unknown as Response,
    );

    expect(res.cookie).toHaveBeenCalled();
    expect(result.accessToken).toBe('access-1');
  });

  it('login rejects a cross-site request (Sec-Fetch-Site)', async () => {
    await expect(
      controller.login(
        buildReq({ 'sec-fetch-site': 'cross-site' }),
        { email: 'a@b.com', password: 'password123' },
        res as unknown as Response,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.login).not.toHaveBeenCalled();
  });

  it('login allows a same-origin request identified via the Origin header', async () => {
    service.login.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'a@b.com', memberships: [] },
    });

    await controller.login(
      buildReq({ origin: 'http://example.com' }),
      { email: 'a@b.com', password: 'password123' },
      res as unknown as Response,
    );

    expect(service.login).toHaveBeenCalled();
  });

  it('refresh reads the cookie, rotates it, and sets the new cookie', async () => {
    service.refresh.mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' });

    const req = {
      ...buildReq({ 'sec-fetch-site': 'same-origin' }),
      cookies: { refresh_token: 'refresh-1' },
    };
    const result = await controller.refresh(req as unknown as Request, res as unknown as Response);

    expect(service.refresh).toHaveBeenCalledWith('refresh-1');
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-2', expect.any(Object));
    expect(result).toEqual({ accessToken: 'access-2' });
  });

  it('refresh throws UnauthorizedException when no cookie is present', async () => {
    const req = { ...buildReq({ 'sec-fetch-site': 'same-origin' }), cookies: {} };
    await expect(
      controller.refresh(req as unknown as Request, res as unknown as Response),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.refresh).not.toHaveBeenCalled();
  });

  it('refresh rejects a cross-site request', async () => {
    const req = {
      ...buildReq({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }),
      cookies: { refresh_token: 'refresh-1' },
    };
    await expect(
      controller.refresh(req as unknown as Request, res as unknown as Response),
    ).rejects.toThrow(ForbiddenException);
    expect(service.refresh).not.toHaveBeenCalled();
  });

  it('logout revokes the token and clears the cookie', async () => {
    service.logout.mockResolvedValue(undefined);

    const req = {
      ...buildReq({ 'sec-fetch-site': 'same-origin' }),
      cookies: { refresh_token: 'refresh-1' },
    };
    await controller.logout(req as unknown as Request, res as unknown as Response);

    expect(service.logout).toHaveBeenCalledWith('refresh-1');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/api/auth' }),
    );
  });

  it('logout rejects a cross-site request', async () => {
    const req = {
      ...buildReq({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }),
      cookies: { refresh_token: 'refresh-1' },
    };
    await expect(
      controller.logout(req as unknown as Request, res as unknown as Response),
    ).rejects.toThrow(ForbiddenException);
    expect(service.logout).not.toHaveBeenCalled();
  });

  it('me returns the current user from the service', async () => {
    service.me.mockResolvedValue({ id: 'user-1', email: 'a@b.com', memberships: [] });

    const result = await controller.me({ id: 'user-1', email: 'a@b.com' });

    expect(service.me).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ id: 'user-1', email: 'a@b.com', memberships: [] });
  });

  it('updateMe forwards the current user id and dto to the service', async () => {
    service.updateProfile.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      firstName: 'Alex',
      lastName: 'Dupont',
      avatarUrl: null,
      memberships: [],
    });

    const result = await controller.updateMe(
      { id: 'user-1', email: 'a@b.com' },
      { firstName: 'Alex', lastName: 'Dupont' },
    );

    expect(service.updateProfile).toHaveBeenCalledWith('user-1', {
      firstName: 'Alex',
      lastName: 'Dupont',
    });
    expect(result).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      firstName: 'Alex',
      lastName: 'Dupont',
      avatarUrl: null,
      memberships: [],
    });
  });
});
