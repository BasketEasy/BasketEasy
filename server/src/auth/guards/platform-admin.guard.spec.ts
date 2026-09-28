import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import {
  PLATFORM_ADMIN_LOCKED_CODE,
  PLATFORM_STEP_UP_REQUIRED_CODE,
  PLATFORM_TOKEN_HEADER,
} from '@basketeasy/types/platform-admin';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PLATFORM_TOKEN_SCOPE } from '../../platform-admin/platform-admin.constants';

const SECRET = 'platform-secret-that-is-long-enough-for-hs256';

function buildContext(
  user: { id: string } | undefined,
  headers: Record<string, string> = {},
  remoteAddress = '203.0.113.7',
): ExecutionContext {
  const request = { user, headers, socket: { remoteAddress } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  let guard: PlatformAdminGuard;
  let jwt: JwtService;
  let prisma: { platformAdmin: { findUnique: jest.Mock } };
  let config: { get: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  const grant = {
    id: 'grant-1',
    userId: 'user-1',
    role: 'DATA_OFFICER',
    totpSecret: 'GEZDGNBVGY3TQOJQ',
    allowedCidrs: [] as string[],
    lockedUntil: null as Date | null,
  };

  async function stepUpTokenFor(userId: string, overrides: Record<string, unknown> = {}) {
    return jwt.signAsync(
      { sub: userId, scope: PLATFORM_TOKEN_SCOPE, ...overrides },
      { secret: SECRET, expiresIn: 900, algorithm: 'HS256' },
    );
  }

  beforeEach(async () => {
    prisma = { platformAdmin: { findUnique: jest.fn().mockResolvedValue({ ...grant }) } };
    config = { get: jest.fn().mockReturnValue(SECRET) };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        PlatformAdminGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();

    guard = module.get(PlatformAdminGuard);
    jwt = module.get(JwtService);
  });

  it('allows a grant holder presenting a valid step-up token', async () => {
    const token = await stepUpTokenFor('user-1');

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, { [PLATFORM_TOKEN_HEADER]: token })),
    ).resolves.toBe(true);
  });

  it('treats a secret too short to sign with as no back-office at all', async () => {
    // Failing closed is the only safe reading of a misconfiguration here: the
    // alternative is an *armed* back-office behind a guessable signing key,
    // on the one surface where a forged token opens every club's roster.
    config.get.mockReturnValue('too-short');

    await expect(guard.canActivate(buildContext({ id: 'user-1' }))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.platformAdmin.findUnique).not.toHaveBeenCalled();
  });

  it('is 503, not 403, when the deployment has no PLATFORM_JWT_SECRET', async () => {
    // The back-office is opt-in per deploy; with no secret there is no way to
    // mint a step-up token at all, so the surface does not exist.
    config.get.mockReturnValue(undefined);

    await expect(guard.canActivate(buildContext({ id: 'user-1' }))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.platformAdmin.findUnique).not.toHaveBeenCalled();
  });

  it('denies an account with no grant, with no code that would confirm the route exists', async () => {
    prisma.platformAdmin.findUnique.mockResolvedValue(null);
    const token = await stepUpTokenFor('user-1');

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, { [PLATFORM_TOKEN_HEADER]: token })),
    ).rejects.toMatchObject({ response: { message: 'Accès refusé' } });
  });

  it('denies a grant that was never armed with a TOTP secret', async () => {
    prisma.platformAdmin.findUnique.mockResolvedValue({ ...grant, totpSecret: null });
    const token = await stepUpTokenFor('user-1');

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, { [PLATFORM_TOKEN_HEADER]: token })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a valid ordinary session with no step-up token, asking for a code', async () => {
    // The whole point of the step-up: a stolen access token belonging to an
    // admin opens nothing here.
    await expect(guard.canActivate(buildContext({ id: 'user-1' }))).rejects.toMatchObject({
      response: { code: PLATFORM_STEP_UP_REQUIRED_CODE },
    });
  });

  it('rejects a token missing the platform scope', async () => {
    const token = await jwt.signAsync(
      { sub: 'user-1' },
      { secret: SECRET, expiresIn: 900, algorithm: 'HS256' },
    );

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, { [PLATFORM_TOKEN_HEADER]: token })),
    ).rejects.toMatchObject({ response: { code: PLATFORM_STEP_UP_REQUIRED_CODE } });
  });

  it('rejects a step-up token minted for a different account', async () => {
    // Lifting one admin's step-up token and pairing it with another admin's
    // access token must not work.
    const token = await stepUpTokenFor('someone-else');

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, { [PLATFORM_TOKEN_HEADER]: token })),
    ).rejects.toMatchObject({ response: { code: PLATFORM_STEP_UP_REQUIRED_CODE } });
  });

  it('rejects a step-up token signed with the ordinary access secret', async () => {
    const token = await jwt.signAsync(
      { sub: 'user-1', scope: PLATFORM_TOKEN_SCOPE },
      { secret: 'the-ordinary-access-token-secret-value', expiresIn: 900, algorithm: 'HS256' },
    );

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, { [PLATFORM_TOKEN_HEADER]: token })),
    ).rejects.toMatchObject({ response: { code: PLATFORM_STEP_UP_REQUIRED_CODE } });
  });

  it('rejects an expired step-up token', async () => {
    const token = await jwt.signAsync(
      { sub: 'user-1', scope: PLATFORM_TOKEN_SCOPE },
      { secret: SECRET, expiresIn: -1, algorithm: 'HS256' },
    );

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, { [PLATFORM_TOKEN_HEADER]: token })),
    ).rejects.toMatchObject({ response: { code: PLATFORM_STEP_UP_REQUIRED_CODE } });
  });

  it('reports a locked grant with its own code, so the client does not re-prompt for a code', async () => {
    prisma.platformAdmin.findUnique.mockResolvedValue({
      ...grant,
      lockedUntil: new Date(Date.now() + 60_000),
    });

    await expect(guard.canActivate(buildContext({ id: 'user-1' }))).rejects.toMatchObject({
      response: { code: PLATFORM_ADMIN_LOCKED_CODE },
    });
  });

  it('honours a per-admin IP allowlist', async () => {
    prisma.platformAdmin.findUnique.mockResolvedValue({
      ...grant,
      allowedCidrs: ['203.0.113.0/24'],
    });
    const token = await stepUpTokenFor('user-1');

    await expect(
      guard.canActivate(
        buildContext({ id: 'user-1' }, { [PLATFORM_TOKEN_HEADER]: token }, '203.0.113.7'),
      ),
    ).resolves.toBe(true);

    await expect(
      guard.canActivate(
        buildContext({ id: 'user-1' }, { [PLATFORM_TOKEN_HEADER]: token }, '198.51.100.7'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces @PlatformRoles on top of the grant', async () => {
    reflector.getAllAndOverride.mockReturnValue(['DATA_OFFICER']);
    prisma.platformAdmin.findUnique.mockResolvedValue({ ...grant, role: 'SUPPORT' });
    const token = await stepUpTokenFor('user-1');

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, { [PLATFORM_TOKEN_HEADER]: token })),
    ).rejects.toMatchObject({ response: { message: 'Rôle plateforme insuffisant' } });
  });

  it('fails closed when JwtAuthGuard has not populated request.user', async () => {
    await expect(guard.canActivate(buildContext(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
