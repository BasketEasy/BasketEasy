import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let service: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    me: jest.Mock;
  };
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };

  beforeEach(async () => {
    service = {
      register: jest.fn(),
      login: jest.fn(),
      refresh: jest.fn(),
      logout: jest.fn(),
      me: jest.fn(),
    };
    res = { cookie: jest.fn(), clearCookie: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('register sets the refresh cookie and returns the access token + user', async () => {
    service.register.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'a@b.com', memberships: [] },
    });

    const result = await controller.register(
      { email: 'a@b.com', password: 'password123' },
      res as unknown as Response,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-1',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict', path: '/api/auth' }),
    );
    expect(result).toEqual({
      accessToken: 'access-1',
      user: { id: 'user-1', email: 'a@b.com', memberships: [] },
    });
  });

  it('login sets the refresh cookie and returns the access token + user', async () => {
    service.login.mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: { id: 'user-1', email: 'a@b.com', memberships: [] },
    });

    const result = await controller.login(
      { email: 'a@b.com', password: 'password123' },
      res as unknown as Response,
    );

    expect(res.cookie).toHaveBeenCalled();
    expect(result.accessToken).toBe('access-1');
  });

  it('refresh reads the cookie, rotates it, and sets the new cookie', async () => {
    service.refresh.mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2' });

    const result = await controller.refresh(
      { cookies: { refresh_token: 'refresh-1' } } as unknown as Request,
      res as unknown as Response,
    );

    expect(service.refresh).toHaveBeenCalledWith('refresh-1');
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-2', expect.any(Object));
    expect(result).toEqual({ accessToken: 'access-2' });
  });

  it('refresh throws UnauthorizedException when no cookie is present', async () => {
    await expect(
      controller.refresh({ cookies: {} } as unknown as Request, res as unknown as Response),
    ).rejects.toThrow(UnauthorizedException);
    expect(service.refresh).not.toHaveBeenCalled();
  });

  it('logout revokes the token and clears the cookie', async () => {
    service.logout.mockResolvedValue(undefined);

    await controller.logout(
      { cookies: { refresh_token: 'refresh-1' } } as unknown as Request,
      res as unknown as Response,
    );

    expect(service.logout).toHaveBeenCalledWith('refresh-1');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/api/auth' }),
    );
  });

  it('me returns the current user from the service', async () => {
    service.me.mockResolvedValue({ id: 'user-1', email: 'a@b.com', memberships: [] });

    const result = await controller.me({ id: 'user-1', email: 'a@b.com' });

    expect(service.me).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ id: 'user-1', email: 'a@b.com', memberships: [] });
  });
});
