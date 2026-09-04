import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'crypto';
import type { ClubMembershipInfo, User } from '@basketeasy/types/auth';
import { PrismaService } from '../prisma/prisma.service';
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

  async login(email: string, password: string): Promise<TokenPair & { user: User }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: true },
    });

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const familyId = randomUUID();
    const tokens = await this.issueTokenPair(user.id, user.email, familyId);
    const memberships: ClubMembershipInfo[] = user.memberships.map((m) => ({
      clubId: m.clubId,
      role: m.role,
    }));

    return { ...tokens, user: this.toUserResponse(user, memberships) };
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

  async refresh(rawToken: string): Promise<TokenPair> {
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
      // Lost the race, or this is a genuine reuse of an already-revoked token — either way, treat as reuse.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokenPair(user.id, user.email, stored.familyId);
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      return;
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
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
    data: { firstName?: string; lastName?: string; avatarUrl?: string | null },
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
    },
    memberships: ClubMembershipInfo[],
  ): User {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      memberships,
    };
  }
}
