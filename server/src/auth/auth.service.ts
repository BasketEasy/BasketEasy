import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'crypto';
import type { ClubMembershipInfo, User } from '@basketeasy/types/auth';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type AuditRequestContext } from '../audit/audit.service';
import { hashToken } from '../common/token-hash';
import { REFRESH_TOKEN_TTL_MS } from './auth.constants';

const ACCESS_TOKEN_TTL = '15m';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// Prisma's unique-constraint violation code. Used to turn a raw P2002 (from
// losing a create-vs-create race on User.email) into the same ConflictException
// the upfront findUnique check throws, instead of an unhandled 500.
function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async register(email: string, password: string): Promise<TokenPair & { user: User }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await argon2.hash(password);

    let user;
    try {
      user = await this.prisma.user.create({ data: { email, passwordHash } });
    } catch (err) {
      // TOCTOU: two concurrent registrations for the same email can both
      // pass the findUnique check above; the loser of the race hits Prisma's
      // unique constraint on User.email here instead.
      if (isUniqueConstraintViolation(err)) {
        throw new ConflictException('Email already in use');
      }
      throw err;
    }

    const familyId = randomUUID();
    const tokens = await this.issueTokenPair(user.id, user.email, familyId);

    return { ...tokens, user: this.toUserResponse(user, []) };
  }

  async login(
    email: string,
    password: string,
    context?: AuditRequestContext,
  ): Promise<TokenPair & { user: User }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: true },
    });

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      // One event for both branches, with userId null when the address
      // matches no account: repeated failures against unknown addresses are
      // themselves a security signal, and the response is identical either
      // way, so logging both leaks nothing the endpoint doesn't already say.
      this.audit.record({
        type: 'LOGIN_FAILURE',
        userId: user?.id ?? null,
        actorEmail: email,
        context,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const familyId = randomUUID();
    const tokens = await this.issueTokenPair(user.id, user.email, familyId);
    await this.touchLastActive(user.id);
    this.audit.record({
      type: 'LOGIN_SUCCESS',
      userId: user.id,
      actorEmail: user.email,
      context,
    });
    const memberships: ClubMembershipInfo[] = user.memberships.map((m) => ({
      clubId: m.clubId,
      role: m.role,
    }));

    return { ...tokens, user: this.toUserResponse(user, memberships) };
  }

  /**
   * The retention sweep's "inactive" signal. Written here as well as by
   * LastActiveInterceptor because login and refresh are the two activity
   * signals that don't necessarily pass through JwtAuthGuard — a refresh
   * carries only the cookie, and a login has no access token yet.
   *
   * Swallows its own failure: an activity ping is never worth failing an
   * authentication that already succeeded.
   */
  private async touchLastActive(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { lastActiveAt: new Date() } });
    } catch {
      // Intentionally ignored — see doc comment.
    }
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    familyId: string,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      { secret: this.getAccessSecret(), expiresIn: ACCESS_TOKEN_TTL },
    );

    const rawRefreshToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawRefreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  // Single validated accessor for the access-token signing secret, mirroring
  // JwtStrategy's now-boot-validated read of the same env var (see
  // AppModule's ConfigModule.forRoot validate()) instead of each call site
  // handling a missing secret differently.
  private getAccessSecret(): string {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured');
    }
    return secret;
  }

  async refresh(rawToken: string, context?: AuditRequestContext): Promise<TokenPair> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (claimed.count === 0) {
      // Two different situations lose the CAS, and only one of them is safe.
      //
      // The row was unrevoked when we read it, so whoever beat us to the
      // claim did so in the microseconds since — a concurrent request from
      // the same client (two tabs, or a tab plus an installed PWA, both
      // restoring a session at once). A thief cannot manufacture this: it
      // requires presenting the token while it is still live, which is
      // indistinguishable from, and no more powerful than, simply using it.
      // Issue a fresh pair rather than logging every device out; this is the
      // "leave the page and come back and I'm logged out" report.
      if (stored.revokedAt === null) {
        const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
        if (!user) {
          throw new UnauthorizedException('Invalid refresh token');
        }
        return this.issueTokenPair(user.id, user.email, stored.familyId);
      }

      // Otherwise the token was already revoked before this request even read
      // it: a token being presented after it was rotated away, which is
      // exactly what reuse detection exists to catch. How recently it was
      // rotated says nothing about who is presenting it — timing alone cannot
      // tell a legitimate straggler from a replay of an intercepted token, so
      // this stays fail-secure and kills the family.

      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // Only this branch is logged, not the lost-race one above: a client
      // racing itself is not a security event, and logging it would bury the
      // real signal in noise.
      this.audit.record({
        type: 'REFRESH_TOKEN_REUSE_DETECTED',
        userId: stored.userId,
        context,
        metadata: { familyId: stored.familyId },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.touchLastActive(user.id);
    return this.issueTokenPair(user.id, user.email, stored.familyId);
  }

  async logout(rawToken: string, context?: AuditRequestContext): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      return;
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    this.audit.record({ type: 'LOGOUT', userId: stored.userId, context });
  }

  async me(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: true },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return this.toUserResponse(
      user,
      user.memberships.map((m) => ({ clubId: m.clubId, role: m.role })),
    );
  }

  async updateProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      avatarUrl?: string | null;
      emailNotificationsEnabled?: boolean;
    },
  ): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { memberships: true },
    });

    return this.toUserResponse(
      user,
      user.memberships.map((m) => ({ clubId: m.clubId, role: m.role })),
    );
  }

  // Shared shape builder for register/login/me/updateProfile, all of which
  // return the same User projection off a Prisma user record plus whatever
  // memberships that call site already fetched/shaped.
  private toUserResponse(
    user: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
      emailVerifiedAt: Date | null;
      emailNotificationsEnabled: boolean;
    },
    memberships: ClubMembershipInfo[],
  ): User {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      // A boolean, not the timestamp: nothing in the UI shows *when* the
      // address was confirmed, only whether the banner and
      // EmailVerifiedGuard's gated actions still apply.
      emailVerified: Boolean(user.emailVerifiedAt),
      emailNotificationsEnabled: user.emailNotificationsEnabled,
      memberships,
    };
  }
}
