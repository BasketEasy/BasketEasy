# Auth module (login/JWT/guards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Auth domain module — register/login/refresh/logout/me, JWT access tokens, rotating refresh tokens with family-based reuse detection, argon2 password hashing, and reusable `JwtAuthGuard` / `ClubRolesGuard` guards — plus the minimal `Club`/`ClubMembership` schema future modules will scope against.

**Architecture:** Standard NestJS module (`server/src/auth/`) following the existing `health`/`prisma` module conventions: controller → service → PrismaService, DTOs validated by the global `ValidationPipe`. Passport's `jwt` strategy backs `JwtAuthGuard`; `ClubRolesGuard` is a separate `CanActivate` that reads `ClubMembership` rows directly (no Passport involvement). Shared request/response shapes live in `packages/@basketeasy/types/auth.ts` per the repo's "types first" convention.

**Tech Stack:** `@nestjs/jwt`, `@nestjs/passport` + `passport-jwt` (access token verification only — refresh tokens are opaque, not JWTs), `argon2` (password hashing), `cookie-parser` (reads the httpOnly refresh cookie), Prisma (existing).

**Spec:** [`docs/superpowers/specs/2026-08-07-auth-module-design.md`](../specs/2026-08-07-auth-module-design.md)

## Global Constraints

- TypeScript strict mode, matches `server/tsconfig.json` (already strict: true).
- Prettier formatting — run `pnpm format` before each commit if unsure.
- ESLint per `server/.eslintrc.js` — no `any` restrictions are relaxed already, but keep real types.
- Shared shapes go in `packages/@basketeasy/types` first, exposed via a subpath export (no barrel `index.ts`), mirrored by backend class-validator DTOs — per root `CLAUDE.md`.
- Jest for the API, colocated `*.spec.ts` — per root `CLAUDE.md`.
- Access token TTL: 15 minutes. Refresh token TTL: 30 days. Refresh token cookie name: `refresh_token`, path `/api/auth`, `httpOnly`, `sameSite: 'strict'`, `secure` driven by `NODE_ENV !== 'development'`.
- Refresh tokens are opaque `crypto.randomBytes(32).toString('hex')` strings; only their SHA-256 hash (`crypto.createHash('sha256')`) is persisted, in `RefreshToken.tokenHash`.
- Password hashing: `argon2.hash` / `argon2.verify` (library default params — no custom tuning needed at this scale).
- Login/register error responses never reveal whether the email exists — same generic `401` message for "no such user" and "wrong password".
- **Scope reduction from spec:** the spec's testing section called for an e2e suite. This repo has no e2e harness yet (`server/test/jest-e2e.json` referenced by `package.json`'s `test:e2e` script doesn't exist, and no prior e2e spec exists to follow as a pattern). Building that harness from scratch is out of scope for this plan — it's infra work for a future task, not something to speculatively build for one module. This plan instead uses comprehensive unit tests with a mocked `PrismaService`, matching the existing `health.controller.spec.ts` pattern. Flag this to the user when the plan finishes.

---

## File Structure

```
packages/@basketeasy/types/
  auth.ts                              # new — shared plain-interface DTOs
  package.json                         # modify — add "./auth" export

server/
  .env.example                         # modify — add JWT/cookie env vars
  prisma/schema.prisma                 # modify — User.passwordHash, Club, ClubRole, ClubMembership, RefreshToken
  src/
    app.module.ts                      # modify — register AuthModule
    main.ts                            # modify — app.use(cookieParser())
    auth/
      auth.module.ts                   # new
      auth.controller.ts               # new
      auth.controller.spec.ts          # new
      auth.service.ts                  # new
      auth.service.spec.ts             # new
      dto/
        register.dto.ts                # new
        login.dto.ts                   # new
      strategies/
        jwt.strategy.ts                # new
        jwt.strategy.spec.ts           # new
      guards/
        jwt-auth.guard.ts              # new
        club-roles.guard.ts            # new
        club-roles.guard.spec.ts       # new
      decorators/
        club-roles.decorator.ts        # new — @ClubRoles(...) metadata setter
        current-user.decorator.ts      # new — @CurrentUser() param decorator
```

---

## Task 1: Add auth dependencies

**Files:**

- Modify: `server/package.json`

**Interfaces:**

- Produces: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `argon2`, `cookie-parser` available to import in later tasks; `@types/passport-jwt`, `@types/cookie-parser` for TS.

- [ ] **Step 1: Add dependencies**

Run from repo root:

```bash
pnpm --filter @basketeasy/server add @nestjs/jwt @nestjs/passport passport passport-jwt argon2 cookie-parser
pnpm --filter @basketeasy/server add -D @types/passport-jwt @types/cookie-parser
```

- [ ] **Step 2: Verify install**

Run: `pnpm --filter @basketeasy/server exec node -e "require('argon2'); require('passport-jwt'); require('cookie-parser'); console.log('ok')"`
Expected: prints `ok` with no errors.

- [ ] **Step 3: Commit**

```bash
git add server/package.json pnpm-lock.yaml
git commit -m "chore(server): add JWT/passport/argon2/cookie-parser dependencies"
```

---

## Task 2: Shared auth types

**Files:**

- Create: `packages/@basketeasy/types/auth.ts`
- Modify: `packages/@basketeasy/types/package.json`

**Interfaces:**

- Produces:
  - `interface ClubMembershipInfo { clubId: string; role: 'ADMIN' | 'MEMBER'; }`
  - `interface AuthUser { id: string; email: string; memberships: ClubMembershipInfo[]; }`
  - `interface RegisterRequest { email: string; password: string; }`
  - `interface LoginRequest { email: string; password: string; }`
  - `interface AccessTokenResponse { accessToken: string; user: AuthUser; }`
- Consumed by: `server/src/auth/dto/*.ts` (Task 3), `server/src/auth/auth.service.ts` (Task 5+), `server/src/auth/auth.controller.ts` (Task 9).

- [ ] **Step 1: Write `auth.ts`**

```typescript
export interface ClubMembershipInfo {
  clubId: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface AuthUser {
  id: string;
  email: string;
  memberships: ClubMembershipInfo[];
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AccessTokenResponse {
  accessToken: string;
  user: AuthUser;
}
```

- [ ] **Step 2: Add the `./auth` export**

Edit `packages/@basketeasy/types/package.json`, add to `"exports"` (alongside the existing `"./health"` entry):

```json
"./auth": {
  "types": "./auth.ts",
  "default": "./auth.ts"
}
```

- [ ] **Step 3: Verify the package still builds**

Run: `pnpm --filter @basketeasy/types build`
Expected: exits 0, `packages/@basketeasy/types/dist/auth.js` and `.d.ts` are produced.

- [ ] **Step 4: Commit**

```bash
git add packages/@basketeasy/types/auth.ts packages/@basketeasy/types/package.json
git commit -m "feat(types): add shared auth DTOs"
```

---

## Task 3: Prisma schema — User.passwordHash, Club, ClubMembership, RefreshToken

**Files:**

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_add_auth_tables/migration.sql` (generated, not hand-written)

**Interfaces:**

- Produces (Prisma Client types, generated): `User.passwordHash: string`, `Club`, `ClubRole` enum (`ADMIN`/`MEMBER`), `ClubMembership`, `RefreshToken` (`id, userId, familyId, tokenHash, expiresAt, revokedAt, createdAt`).
- Consumed by: `AuthService` (Task 5+), `ClubRolesGuard` (Task 8).

- [ ] **Step 1: Edit `schema.prisma`**

Add `passwordHash` to `User`, and the three new models. Full resulting file:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String           @id @default(uuid())
  email         String           @unique
  passwordHash  String
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt
  memberships   ClubMembership[]
  refreshTokens RefreshToken[]
}

model Player {
  id        String   @id @default(uuid())
  firstName String
  lastName  String
  createdAt DateTime @default(now())
}

model Club {
  id          String           @id @default(uuid())
  name        String
  createdAt   DateTime         @default(now())
  memberships ClubMembership[]
}

enum ClubRole {
  ADMIN
  MEMBER
}

model ClubMembership {
  id        String   @id @default(uuid())
  userId    String
  clubId    String
  role      ClubRole
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
  club      Club     @relation(fields: [clubId], references: [id])

  @@unique([userId, clubId])
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  familyId  String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id])
}
```

Note the existing `User` model had no `updatedAt` — this task adds one (Prisma requires `@updatedAt` for any model where you want automatic update tracking; harmless addition, defaults to `createdAt`'s value on insert).

- [ ] **Step 2: Start a local Postgres for migration generation**

Run from repo root: `docker compose up -d postgres`
Expected: container `basketeasy-postgres-1` (or similar) reports healthy within ~10s (`docker compose ps postgres`).

- [ ] **Step 3: Generate the migration**

Run from `server/`:

```bash
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" pnpm exec prisma migrate dev --name add_auth_tables --skip-seed
```

Expected: creates `server/prisma/migrations/<timestamp>_add_auth_tables/migration.sql`, applies it, prints "Your database is now in sync with your schema."

- [ ] **Step 4: Regenerate the Prisma client**

Run: `pnpm --filter @basketeasy/server exec prisma generate`
Expected: exits 0, "Generated Prisma Client" message.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): add Club/ClubMembership/RefreshToken schema and User.passwordHash"
```

---

## Task 4: Register/Login DTOs

**Files:**

- Create: `server/src/auth/dto/register.dto.ts`
- Create: `server/src/auth/dto/login.dto.ts`

**Interfaces:**

- Consumes: `RegisterRequest`, `LoginRequest` from `@basketeasy/types/auth` (Task 2).
- Produces: `RegisterDto implements RegisterRequest`, `LoginDto implements LoginRequest` — used by `AuthController` (Task 9).

- [ ] **Step 1: Write `register.dto.ts`**

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';
import type { RegisterRequest } from '@basketeasy/types/auth';

export class RegisterDto implements RegisterRequest {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
```

- [ ] **Step 2: Write `login.dto.ts`**

```typescript
import { IsEmail, IsString } from 'class-validator';
import type { LoginRequest } from '@basketeasy/types/auth';

export class LoginDto implements LoginRequest {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @basketeasy/server exec tsc --noEmit -p tsconfig.json`
Expected: no errors referencing `register.dto.ts` / `login.dto.ts` (unrelated pre-existing errors, if any, are out of scope).

- [ ] **Step 4: Commit**

```bash
git add server/src/auth/dto
git commit -m "feat(server): add register/login DTOs"
```

---

## Task 5: AuthService — register & login (token issuance)

**Files:**

- Create: `server/src/auth/auth.service.ts`
- Create: `server/src/auth/auth.service.spec.ts`

**Interfaces:**

- Consumes: `PrismaService` (`server/src/prisma/prisma.service.ts`) — `prisma.user`, `prisma.refreshToken`; `JwtService` from `@nestjs/jwt` (`signAsync(payload, options)`); `ConfigService` from `@nestjs/config` (`get(key)`); `argon2.hash`, `argon2.verify`; `crypto.randomBytes`, `crypto.createHash`, `crypto.randomUUID`.
- Produces (this task):
  - `class AuthService` with constructor `(prisma: PrismaService, jwt: JwtService, config: ConfigService)`.
  - `async register(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string; memberships: [] } }>` — throws `ConflictException` if email taken.
  - `async login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; user: { id: string; email: string; memberships: ClubMembershipInfo[] } }>` — throws `UnauthorizedException` ("Invalid credentials") on bad email or password.
  - private `issueTokenPair(userId: string, email: string, familyId: string): Promise<{ accessToken: string; refreshToken: string }>` — later tasks (refresh) reuse this.
- Later tasks (6, 7) add `refresh`, `logout`, `me` to this same class/file.

- [ ] **Step 1: Write the failing tests**

```typescript
// server/src/auth/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'JWT_ACCESS_SECRET' ? 'access-secret' : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('creates a user with a hashed password and returns a token pair', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register('a@b.com', 'password123');

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.email).toBe('a@b.com');
      expect(createArgs.data.passwordHash).not.toBe('password123');
      expect(await argon2.verify(createArgs.data.passwordHash, 'password123')).toBe(true);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user).toEqual({ id: 'user-1', email: 'a@b.com', memberships: [] });
    });

    it('throws ConflictException when the email is already taken', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.register('a@b.com', 'password123')).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns a token pair for correct credentials', async () => {
      const passwordHash = await argon2.hash('password123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash,
        memberships: [],
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login('a@b.com', 'password123');

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.user).toEqual({ id: 'user-1', email: 'a@b.com', memberships: [] });
    });

    it('throws UnauthorizedException for an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login('nobody@b.com', 'password123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      const passwordHash = await argon2.hash('password123');
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'a@b.com',
        passwordHash,
        memberships: [],
      });

      await expect(service.login('a@b.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/server test -- auth.service.spec.ts`
Expected: FAIL — `Cannot find module './auth.service'`.

- [ ] **Step 3: Write `auth.service.ts` (register + login + issueTokenPair only)**

```typescript
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID, createHash } from 'crypto';
import type { ClubMembershipInfo, AuthUser } from '@basketeasy/types/auth';
import { PrismaService } from '../prisma/prisma.service';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string): Promise<TokenPair & { user: AuthUser }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await argon2.hash(password);
    const user = await this.prisma.user.create({
      data: { email, passwordHash },
    });

    const familyId = randomUUID();
    const tokens = await this.issueTokenPair(user.id, user.email, familyId);

    return { ...tokens, user: { id: user.id, email: user.email, memberships: [] } };
  }

  async login(email: string, password: string): Promise<TokenPair & { user: AuthUser }> {
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

    return { ...tokens, user: { id: user.id, email: user.email, memberships } };
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    familyId: string,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      { secret: this.config.get<string>('JWT_ACCESS_SECRET'), expiresIn: ACCESS_TOKEN_TTL },
    );

    const rawRefreshToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

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
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/server test -- auth.service.spec.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/auth.service.ts server/src/auth/auth.service.spec.ts
git commit -m "feat(server): AuthService register/login with argon2 + token issuance"
```

---

## Task 6: AuthService — refresh (rotation + family revocation) & logout

**Files:**

- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.service.spec.ts`

**Interfaces:**

- Consumes: `issueTokenPair` (private, Task 5), `prisma.refreshToken.findUnique/update/updateMany`.
- Produces: `async refresh(rawToken: string): Promise<TokenPair>` — throws `UnauthorizedException` if not found, expired, or already revoked (and in the revoked case, revokes the whole family first). `async logout(rawToken: string): Promise<void>` — revokes only the presented token's row; no-op (does not throw) if the token isn't found.
- Consumed by: `AuthController` (Task 9).

- [ ] **Step 1: Add the failing tests**

Append to `server/src/auth/auth.service.spec.ts`, inside the existing `describe('AuthService', ...)` block (after the `login` describe block):

```typescript
describe('refresh', () => {
  it('rotates a valid token: revokes the old row and issues a new pair in the same family', async () => {
    const now = new Date();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash: 'hash-1',
      expiresAt: new Date(now.getTime() + 1000 * 60 * 60),
      revokedAt: null,
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
    prisma.refreshToken.update.mockResolvedValue({});
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await service.refresh('raw-token');

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ familyId: 'family-1', userId: 'user-1' }),
      }),
    );
    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.refreshToken).toEqual(expect.any(String));
  });

  it('throws UnauthorizedException when the token is unknown', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.refresh('unknown')).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the token is expired', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash: 'hash-1',
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    });

    await expect(service.refresh('raw-token')).rejects.toThrow(UnauthorizedException);
  });

  it('revokes the whole family and throws when a revoked token is reused', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      userId: 'user-1',
      familyId: 'family-1',
      tokenHash: 'hash-1',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      revokedAt: new Date(),
    });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

    await expect(service.refresh('raw-token')).rejects.toThrow(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('logout', () => {
  it('revokes the presented token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({ id: 'rt-1', revokedAt: null });
    prisma.refreshToken.update.mockResolvedValue({});

    await service.logout('raw-token');

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('does nothing when the token is unknown', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.logout('unknown')).resolves.toBeUndefined();
    expect(prisma.refreshToken.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/server test -- auth.service.spec.ts`
Expected: FAIL — `service.refresh is not a function` / `service.logout is not a function`.

- [ ] **Step 3: Add `refresh` and `logout` to `auth.service.ts`**

Add a private `hashToken` helper and the two new public methods (insert after `issueTokenPair`):

```typescript
  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async refresh(rawToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokenPair(user.id, user.email, stored.familyId);
  }

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      return;
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
  }
```

Also replace the body of `issueTokenPair` to use `this.hashToken(rawRefreshToken)` instead of the inline `createHash(...)` call, to avoid duplication.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/server test -- auth.service.spec.ts`
Expected: PASS, all tests green (11 total).

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/auth.service.ts server/src/auth/auth.service.spec.ts
git commit -m "feat(server): AuthService refresh rotation with family reuse detection, logout"
```

---

## Task 7: AuthService — me()

**Files:**

- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.service.spec.ts`

**Interfaces:**

- Produces: `async me(userId: string): Promise<AuthUser>` — throws `UnauthorizedException` if the user no longer exists.
- Consumed by: `AuthController` (Task 9).

- [ ] **Step 1: Add the failing test**

Append inside `describe('AuthService', ...)`:

```typescript
describe('me', () => {
  it('returns the user with their club memberships', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      memberships: [{ clubId: 'club-1', role: 'ADMIN' }],
    });

    const result = await service.me('user-1');

    expect(result).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      memberships: [{ clubId: 'club-1', role: 'ADMIN' }],
    });
  });

  it('throws UnauthorizedException when the user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.me('gone')).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/server test -- auth.service.spec.ts`
Expected: FAIL — `service.me is not a function`.

- [ ] **Step 3: Add `me` to `auth.service.ts`**

```typescript
  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: true },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return {
      id: user.id,
      email: user.email,
      memberships: user.memberships.map((m) => ({ clubId: m.clubId, role: m.role })),
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/server test -- auth.service.spec.ts`
Expected: PASS, all tests green (13 total).

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/auth.service.ts server/src/auth/auth.service.spec.ts
git commit -m "feat(server): AuthService.me"
```

---

## Task 8: JwtStrategy + JwtAuthGuard

**Files:**

- Create: `server/src/auth/strategies/jwt.strategy.ts`
- Create: `server/src/auth/strategies/jwt.strategy.spec.ts`
- Create: `server/src/auth/guards/jwt-auth.guard.ts`

**Interfaces:**

- Consumes: `passport-jwt`'s `Strategy`/`ExtractJwt`, `PassportStrategy` from `@nestjs/passport`, `ConfigService`.
- Produces: `class JwtStrategy extends PassportStrategy(Strategy, 'jwt')` with `validate(payload: { sub: string; email: string }): { id: string; email: string }`. `class JwtAuthGuard extends AuthGuard('jwt')`.
- Consumed by: `AuthModule` registers `JwtStrategy` as a provider (Task 10); `AuthController.me` uses `JwtAuthGuard` (Task 9); `CurrentUser` decorator (Task 9) reads `req.user` this strategy populates.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/auth/strategies/jwt.strategy.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('access-secret') } },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  it('maps the JWT payload to { id, email }', () => {
    const result = strategy.validate({ sub: 'user-1', email: 'a@b.com' });
    expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @basketeasy/server test -- jwt.strategy.spec.ts`
Expected: FAIL — `Cannot find module './jwt.strategy'`.

- [ ] **Step 3: Write `jwt.strategy.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): { id: string; email: string } {
    return { id: payload.sub, email: payload.email };
  }
}
```

- [ ] **Step 4: Write `jwt-auth.guard.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @basketeasy/server test -- jwt.strategy.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/auth/strategies server/src/auth/guards/jwt-auth.guard.ts
git commit -m "feat(server): JwtStrategy and JwtAuthGuard"
```

---

## Task 9: ClubRolesGuard + @ClubRoles decorator

**Files:**

- Create: `server/src/auth/decorators/club-roles.decorator.ts`
- Create: `server/src/auth/guards/club-roles.guard.ts`
- Create: `server/src/auth/guards/club-roles.guard.spec.ts`

**Interfaces:**

- Consumes: `PrismaService.clubMembership.findUnique`, `Reflector` from `@nestjs/core`, `ClubRole` enum from `@prisma/client`.
- Produces: `const CLUB_ROLES_KEY = 'clubRoles'`, `ClubRoles(...roles: ClubRole[])` decorator (sets route metadata), `class ClubRolesGuard implements CanActivate` — expects `req.user.id` (set by `JwtAuthGuard`, must run first) and `req.params.clubId`; returns `true` if no `@ClubRoles` metadata is present on the handler (guard is a no-op unless explicitly applied); throws `ForbiddenException` if the user has no membership in that club or the membership's role isn't in the required list.
- Not consumed by any controller in this plan (no Club module exists yet) — exported from `AuthModule` (Task 10) for future modules.

- [ ] **Step 1: Write `club-roles.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
import type { ClubRole } from '@prisma/client';

export const CLUB_ROLES_KEY = 'clubRoles';

export const ClubRoles = (...roles: ClubRole[]) => SetMetadata(CLUB_ROLES_KEY, roles);
```

- [ ] **Step 2: Write the failing tests**

```typescript
// server/src/auth/guards/club-roles.guard.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ClubRolesGuard } from './club-roles.guard';
import { PrismaService } from '../../prisma/prisma.service';

function buildContext(user: { id: string } | undefined, clubId: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params: { clubId } }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('ClubRolesGuard', () => {
  let guard: ClubRolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: { clubMembership: { findUnique: jest.Mock } };

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = { clubMembership: { findUnique: jest.fn() } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClubRolesGuard,
        { provide: Reflector, useValue: reflector },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    guard = module.get<ClubRolesGuard>(ClubRolesGuard);
  });

  it('allows the request when no @ClubRoles metadata is set', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const result = await guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'));

    expect(result).toBe(true);
    expect(prisma.clubMembership.findUnique).not.toHaveBeenCalled();
  });

  it('allows a member whose role matches', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'ADMIN' });

    const result = await guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'));

    expect(result).toBe(true);
    expect(prisma.clubMembership.findUnique).toHaveBeenCalledWith({
      where: { userId_clubId: { userId: 'user-1', clubId: 'club-1' } },
    });
  });

  it('denies a member whose role does not match', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });

    await expect(guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('denies a user with no membership in the club', async () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN']);
    prisma.clubMembership.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(buildContext({ id: 'user-1' }, 'club-1'))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/server test -- club-roles.guard.spec.ts`
Expected: FAIL — `Cannot find module './club-roles.guard'`.

- [ ] **Step 4: Write `club-roles.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ClubRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CLUB_ROLES_KEY } from '../decorators/club-roles.decorator';

@Injectable()
export class ClubRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<ClubRole[] | undefined>(CLUB_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId: string = request.user.id;
    const clubId: string = request.params.clubId;

    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });

    if (!membership || !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient club role');
    }

    return true;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/server test -- club-roles.guard.spec.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 6: Commit**

```bash
git add server/src/auth/decorators/club-roles.decorator.ts server/src/auth/guards/club-roles.guard.ts server/src/auth/guards/club-roles.guard.spec.ts
git commit -m "feat(server): ClubRolesGuard and @ClubRoles decorator"
```

---

## Task 10: CurrentUser decorator + AuthModule wiring

**Files:**

- Create: `server/src/auth/decorators/current-user.decorator.ts`
- Create: `server/src/auth/auth.module.ts`
- Modify: `server/src/app.module.ts`
- Modify: `server/.env.example`

**Interfaces:**

- Produces: `CurrentUser` param decorator returning `req.user` (`{ id: string; email: string }`, populated by `JwtAuthGuard`/`JwtStrategy`). `AuthModule` registers `AuthController`, `AuthService`, `JwtStrategy`, `ClubRolesGuard`, and configures `JwtModule` — exports `ClubRolesGuard` for future modules.
- Consumed by: `AuthController` (Task 11), `AppModule`.

- [ ] **Step 1: Write `current-user.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestUser {
  id: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

- [ ] **Step 2: Write `auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ClubRolesGuard } from './guards/club-roles.guard';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, ClubRolesGuard],
  exports: [JwtAuthGuard, ClubRolesGuard],
})
export class AuthModule {}
```

Note: `JwtModule.register({})` is intentionally empty — `AuthService.issueTokenPair` and `JwtStrategy` both pass `secret`/`expiresIn` explicitly per call via `ConfigService`, so no module-level default is needed.

- [ ] **Step 3: Register `AuthModule` in `app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Add env vars to `.env.example`**

```
PORT=3000
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy"
JWT_ACCESS_SECRET="change-me-in-production"
```

(Only `JWT_ACCESS_SECRET` is needed — refresh tokens are opaque random values, not JWTs, so they have no signing secret; see the spec's "Refresh token strategy" section.)

- [ ] **Step 5: Verify the app still boots**

Run: `DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" JWT_ACCESS_SECRET="test-secret" pnpm --filter @basketeasy/server exec nest build`
Expected: exits 0 (this will fail until Task 11 adds `auth.controller.ts` — if run before Task 11 exists, expect a "Cannot find module './auth.controller'" error; that's fine, this step is really validated at the end of Task 11).

- [ ] **Step 6: Commit**

```bash
git add server/src/auth/decorators/current-user.decorator.ts server/src/auth/auth.module.ts server/src/app.module.ts server/.env.example
git commit -m "feat(server): AuthModule wiring, CurrentUser decorator, JWT env var"
```

---

## Task 11: AuthController — register/login/refresh/logout/me

**Files:**

- Create: `server/src/auth/auth.controller.ts`
- Create: `server/src/auth/auth.controller.spec.ts`
- Modify: `server/src/main.ts` (add `cookie-parser` middleware)

**Interfaces:**

- Consumes: `AuthService` (Tasks 5-7), `RegisterDto`/`LoginDto` (Task 4), `JwtAuthGuard` (Task 8), `CurrentUser`/`RequestUser` (Task 10).
- Produces: the five HTTP routes from the spec. Cookie name `refresh_token`, path `/api/auth`, `httpOnly: true`, `sameSite: 'strict'`, `secure: process.env.NODE_ENV !== 'development'`, `maxAge: 30 * 24 * 60 * 60 * 1000`.

- [ ] **Step 1: Write the failing controller tests**

```typescript
// server/src/auth/auth.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
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
      { refresh_token: 'refresh-1' },
      res as unknown as Response,
    );

    expect(service.refresh).toHaveBeenCalledWith('refresh-1');
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh-2', expect.any(Object));
    expect(result).toEqual({ accessToken: 'access-2' });
  });

  it('refresh throws UnauthorizedException when no cookie is present', async () => {
    await expect(controller.refresh({}, res as unknown as Response)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.refresh).not.toHaveBeenCalled();
  });

  it('logout revokes the token and clears the cookie', async () => {
    service.logout.mockResolvedValue(undefined);

    await controller.logout({ refresh_token: 'refresh-1' }, res as unknown as Response);

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/server test -- auth.controller.spec.ts`
Expected: FAIL — `Cannot find module './auth.controller'`.

- [ ] **Step 3: Write `auth.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AccessTokenResponse, AuthUser } from '@basketeasy/types/auth';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from './decorators/current-user.decorator';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV !== 'development',
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponse> {
    const { accessToken, refreshToken, user } = await this.authService.register(
      dto.email,
      dto.password,
    );
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
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
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken, user };
  }

  @Post('refresh')
  async refresh(
    @Req() req: { [REFRESH_COOKIE_NAME]?: string } | Record<string, never>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const cookies = req as Record<string, string | undefined>;
    const rawToken = cookies[REFRESH_COOKIE_NAME];
    if (!rawToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const { accessToken, refreshToken } = await this.authService.refresh(rawToken);
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken };
  }

  @Post('logout')
  async logout(
    @Req() req: Record<string, string | undefined>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const rawToken = req[REFRESH_COOKIE_NAME];
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
}
```

Note on the `@Req()` typing in `refresh`/`logout`: the real Express request exposes cookies at `req.cookies` (populated by `cookie-parser`, wired in Step 5 below), not at the request's top level. Use `@Req() req: Request` from `express` and read `req.cookies[REFRESH_COOKIE_NAME]` — **replace the two method signatures above accordingly**:

```typescript
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ accessToken: string }> {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!rawToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const { accessToken, refreshToken } = await this.authService.refresh(rawToken);
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
    return { accessToken };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (rawToken) {
      await this.authService.logout(rawToken);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  }
```

And add `import type { Request, Response } from 'express';` at the top (replacing the earlier `Response`-only import). The controller test in Step 1 passes plain objects (`{ refresh_token: 'refresh-1' }`) as `req` — update those two test calls to wrap them as `{ cookies: { refresh_token: 'refresh-1' } } as unknown as Request` and `{ cookies: {} } as unknown as Request` respectively before running Step 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/server test -- auth.controller.spec.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Wire `cookie-parser` in `main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`BasketEasy API listening on port ${port}`);
}

bootstrap();
```

- [ ] **Step 6: Verify the full app builds**

Run: `DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" JWT_ACCESS_SECRET="test-secret" pnpm --filter @basketeasy/server exec nest build`
Expected: exits 0.

- [ ] **Step 7: Run the full server test suite**

Run: `pnpm --filter @basketeasy/server test`
Expected: PASS, all suites green (health + all auth specs).

- [ ] **Step 8: Commit**

```bash
git add server/src/auth/auth.controller.ts server/src/auth/auth.controller.spec.ts server/src/main.ts
git commit -m "feat(server): AuthController register/login/refresh/logout/me + cookie-parser"
```

---

## Task 12: Manual verification against a running server

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Bring up Postgres and the server**

```bash
docker compose up -d postgres
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" JWT_ACCESS_SECRET="dev-secret" pnpm --filter @basketeasy/server exec prisma migrate deploy
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" JWT_ACCESS_SECRET="dev-secret" NODE_ENV=development pnpm --filter @basketeasy/server start
```

- [ ] **Step 2: Register, then login, then call /me**

```bash
curl -i -c /tmp/basketeasy-cookies.txt -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"verify@example.com","password":"password123"}'
```

Expected: `201`, JSON body `{ accessToken, user: { id, email: "verify@example.com", memberships: [] } }`, `Set-Cookie: refresh_token=...; Path=/api/auth; HttpOnly; SameSite=Strict`.

```bash
ACCESS_TOKEN=$(curl -s -b /tmp/basketeasy-cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"verify@example.com","password":"password123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken' 2>/dev/null || true)
```

(If the above pipe substitution is awkward in your shell, just run the `login` curl directly and copy the `accessToken` field manually for the next step.)

```bash
curl -i http://localhost:3000/api/auth/me -H "Authorization: Bearer $ACCESS_TOKEN"
```

Expected: `200`, `{ id, email: "verify@example.com", memberships: [] }`.

- [ ] **Step 3: Verify refresh rotation and reuse detection**

```bash
curl -i -b /tmp/basketeasy-cookies.txt -c /tmp/basketeasy-cookies2.txt -X POST http://localhost:3000/api/auth/refresh
```

Expected: `201`/`200` with a new `accessToken` and a new `Set-Cookie: refresh_token=...` (different value from registration).

```bash
curl -i -b /tmp/basketeasy-cookies.txt -X POST http://localhost:3000/api/auth/refresh
```

(Reuses the now-rotated-away original cookie.) Expected: `401` — the original refresh token was already revoked by the previous rotation.

```bash
curl -i -b /tmp/basketeasy-cookies2.txt -X POST http://localhost:3000/api/auth/refresh
```

Expected: also `401` — confirms family revocation killed the second (until-now valid) token too.

- [ ] **Step 4: Verify duplicate registration and bad login**

```bash
curl -i -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"verify@example.com","password":"password123"}'
```

Expected: `409`.

```bash
curl -i -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"verify@example.com","password":"wrong-password"}'
```

Expected: `401`.

- [ ] **Step 5: Stop the server**, note the result of manual verification in the PR description (no commit for this task — verification only).

---

## Self-Review Notes

- **Spec coverage:** register/login/refresh/logout/me endpoints (Task 11), JWT access token + argon2 (Task 5), refresh rotation + family revocation (Task 6), `Club`/`ClubMembership`/`RefreshToken` schema (Task 3), `JwtAuthGuard`/`ClubRolesGuard` (Tasks 8-9), shared types (Task 2), error handling (409/401 — covered across Tasks 5-6, tested in Task 11), manual e2e-style verification (Task 12) in place of a full automated e2e harness (see Global Constraints scope reduction).
- **Type consistency:** `AuthUser`/`ClubMembershipInfo`/`RegisterRequest`/`LoginRequest`/`AccessTokenResponse` (Task 2) are used identically by DTOs (Task 4), `AuthService` (Tasks 5-7), and `AuthController` (Task 11) — no renamed fields across tasks.
- **No placeholders:** every step has literal code, no "add tests for the above" or "TBD" left in any task.
