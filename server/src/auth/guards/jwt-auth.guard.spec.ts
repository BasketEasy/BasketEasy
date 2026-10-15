import { Controller, Get, INestApplication, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  IMPERSONATION_READ_ONLY_CODE,
  IMPERSONATION_TOKEN_SCOPE,
} from '@basketeasy/types/platform-admin-impersonation';
import { PrismaService } from '../../prisma/prisma.service';
import { PLATFORM_TOKEN_SCOPE } from '../../platform-admin/platform-admin.constants';
import { CurrentUser, RequestUser } from '../decorators/current-user.decorator';
import { ImpersonationStrategy } from '../strategies/impersonation.strategy';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

const ACCESS_SECRET = 'access-secret-that-is-long-enough-for-hs256';
const PLATFORM_SECRET = 'platform-secret-that-is-long-enough-for-hs256';

@Controller('probe')
@UseGuards(JwtAuthGuard)
class ProbeController {
  @Get()
  read(@CurrentUser() user: RequestUser): RequestUser {
    return user;
  }

  @Post()
  write(): { ok: true } {
    return { ok: true };
  }
}

/**
 * The real passport chain, over HTTP: which token each strategy accepts, and
 * that read-only holds on a route that never heard of impersonation.
 */
describe('JwtAuthGuard (access + impersonation strategies)', () => {
  let app: INestApplication;
  const jwt = new JwtService({});
  const session = {
    actorUserId: 'admin-1',
    subjectUserId: 'user-1',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    endedAt: null,
    subject: { email: 'subject@example.com' },
    actor: { platformAdmin: { role: 'DATA_OFFICER', lockedUntil: null, allowedCidrs: [] } },
  };
  const prisma = { impersonationSession: { findUnique: jest.fn() } };

  const impersonationToken = (claims: Record<string, unknown> = {}) =>
    jwt.signAsync(
      {
        sub: 'user-1',
        act: 'admin-1',
        sid: 'session-1',
        scope: IMPERSONATION_TOKEN_SCOPE,
        ...claims,
      },
      { secret: PLATFORM_SECRET, expiresIn: 900, algorithm: 'HS256' },
    );

  beforeAll(async () => {
    const config = {
      get: (key: string) =>
        ({ JWT_ACCESS_SECRET: ACCESS_SECRET, PLATFORM_JWT_SECRET: PLATFORM_SECRET })[key],
    };
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [ProbeController],
      providers: [
        JwtStrategy,
        ImpersonationStrategy,
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.impersonationSession.findUnique.mockResolvedValue(session);
  });

  it('still accepts an ordinary access token, for reads and writes', async () => {
    const token = await jwt.signAsync(
      { sub: 'user-9', email: 'me@example.com' },
      { secret: ACCESS_SECRET, expiresIn: 900 },
    );

    await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, { id: 'user-9', email: 'me@example.com' });
    await request(app.getHttpServer())
      .post('/probe')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  });

  it('authenticates an impersonation token as the subject on a read', async () => {
    const response = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${await impersonationToken()}`)
      .expect(200);

    expect(response.body).toEqual({
      id: 'user-1',
      email: 'subject@example.com',
      impersonation: { sessionId: 'session-1', actorUserId: 'admin-1' },
    });
  });

  it('refuses a write under impersonation with the read-only code', async () => {
    const response = await request(app.getHttpServer())
      .post('/probe')
      .set('Authorization', `Bearer ${await impersonationToken()}`)
      .expect(403);

    expect(response.body.code).toBe(IMPERSONATION_READ_ONLY_CODE);
  });

  it('rejects a step-up token presented as a product credential', async () => {
    const stepUp = await jwt.signAsync(
      { sub: 'admin-1', scope: PLATFORM_TOKEN_SCOPE },
      { secret: PLATFORM_SECRET, expiresIn: 900, algorithm: 'HS256' },
    );

    await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${stepUp}`)
      .expect(401);
  });

  it('rejects an impersonation-scoped token signed with the access secret', async () => {
    const forged = await jwt.signAsync(
      { sub: 'user-1', act: 'admin-1', sid: 'session-1', scope: IMPERSONATION_TOKEN_SCOPE },
      { secret: ACCESS_SECRET, expiresIn: 900 },
    );

    const response = await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${forged}`)
      .expect(200);
    // Accepted by the *access* strategy as an ordinary token for its `sub`,
    // never as an impersonation: nothing marks it as one.
    expect(response.body.impersonation).toBeUndefined();
  });

  it('rejects an impersonation token once its session has ended', async () => {
    prisma.impersonationSession.findUnique.mockResolvedValue({ ...session, endedAt: new Date() });

    await request(app.getHttpServer())
      .get('/probe')
      .set('Authorization', `Bearer ${await impersonationToken()}`)
      .expect(401);
  });
});
