# Club join-by-email + player roster management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Clubs domain module — create a club, add an already-registered user to it by email (no invites, no join codes), and manage a club's player roster (name-only entries, no `User` account). This is the P0 prerequisite the dashboard has nothing to attach to without: club creation, membership, and roster data.

**Architecture:** Standard NestJS module (`server/src/clubs/`) mirroring `server/src/auth/`'s controller → service → `PrismaService` shape, reusing the existing `JwtAuthGuard`/`ClubRolesGuard`/`@ClubRoles()` from `server/src/auth` rather than inventing new guard logic. On the frontend, one TanStack Query hook per file under `app/src/clubs/`, named `use<Model><Method>` (already documented in `docs/frontend-stack.md`), mutations write straight into the query cache via `setQueryData` rather than `invalidateQueries` (also a documented convention as of this plan — Task 15 adds the row). No new role types, no invite/email flow, no CTC/multi-club support, no "current club" global switcher — all explicitly deferred, see Global Constraints.

**Spec:** none written separately — scope was narrowed directly through conversation (see Global Constraints for the resulting decisions) rather than a standalone spec doc; this plan's Context/Global Constraints sections serve that purpose.

**Tech Stack:** no new dependencies. Backend: existing `@nestjs/common`, `class-validator`, `class-transformer`, Prisma. Frontend: existing `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers/zod`, `zod`, `@basketeasy/ui`.

## Global Constraints

- TypeScript strict mode, matches both `server/tsconfig.json` and `app/tsconfig.json` (already strict).
- Prettier formatting — run `pnpm format` before each commit if unsure.
- ESLint per package config.
- Shared shapes go in `packages/@basketeasy/types` first (subpath exports, no barrel), mirrored by backend class-validator DTOs — per root `CLAUDE.md`.
- Jest for the API (colocated `*.spec.ts`); Vitest + RTL for the app (colocated `*.test.tsx`/`.test.ts`) — per root `CLAUDE.md`.
- **Route param naming is load-bearing:** `ClubRolesGuard` (`server/src/auth/guards/club-roles.guard.ts`) hardcodes `request.params.clubId`. Every club-scoped route in the new controller must use `:clubId`, not `:id`. `@ClubRoles(...)` must be applied explicitly even for "any member may read" routes — the guard no-ops (`return true`) when no `@ClubRoles` metadata is present at all.
- **Scope decisions carried over from prior discussion (not re-litigated here):**
  - "Join a club" = an ADMIN looks up an _existing_ `User` by email and adds them as `MEMBER`. No invite emails, no join codes. 404 if the email has no account.
  - "Players" are roster entries (`firstName`/`lastName`) scoped to a `Club`, unrelated to `User` — no login, no email, no link to a membership. `ClubRole` stays `ADMIN | MEMBER`; no coach/parent/président/trésorier yet.
  - No new "current club" Context/switcher — a page reads the caller's role for the club in the URL from `useAccount().user.memberships` (already present on `User`), which is the actual authorization signal; the backend guard is the real enforcement, this is only for hiding admin-only UI.
  - `docs/frontend-stack.md` already documents hook naming (`use<Model><Method>`) and one-hook-per-file; Task 15 adds the `setQueryData`-over-`invalidateQueries` convention to the same table.
- **Frontend test scope note:** rather than writing out a full colocated test file for all ten hooks (which are structurally identical thin wrappers), Task 10 writes one representative hook test in full (`useClubCreate.test.ts`, following the pattern already used in `app/src/auth/mutations.test.ts`) and the remaining hook tasks (11-13) note "test file follows the same pattern" instead of repeating ~40 near-identical lines nine more times. Flag this to the user when the plan finishes — implementers should still write all nine, just from the one worked pattern rather than a second bespoke design.

---

## File Structure

```
packages/@basketeasy/types/
  clubs.ts                              # new
  club-members.ts                       # new
  players.ts                            # new
  package.json                          # modify — add "./clubs", "./club-members", "./players" exports

server/
  prisma/schema.prisma                  # modify — Player.clubId relation, Club.players back-relation
  prisma/migrations/<timestamp>_add_player_club_relation/migration.sql  # generated
  src/
    app.module.ts                       # modify — register ClubsModule
    clubs/
      clubs.module.ts                   # new
      clubs.controller.ts               # new
      clubs.controller.spec.ts          # new
      clubs.service.ts                  # new
      clubs.service.spec.ts             # new
      dto/
        create-club.dto.ts              # new
        add-club-member.dto.ts          # new
        create-player.dto.ts            # new
        update-player.dto.ts            # new

app/
  src/
    api/client.ts                       # modify — add patch/delete methods, fix 204 handling
    App.tsx                             # modify — register 3 new routes
    clubs/
      queryKeys.ts                      # new
      useClubCreate.ts (+.test.ts)      # new
      useClubList.ts                    # new
      useClubShow.ts                    # new
      useClubMemberAdd.ts               # new
      useClubMemberList.ts              # new
      useClubMemberRemove.ts            # new
      usePlayerCreate.ts                # new
      usePlayerList.ts                  # new
      usePlayerUpdate.ts                # new
      usePlayerDelete.ts                # new
      clubErrorMessages.ts              # new
      ClubCreateForm.tsx                # new
      ClubMemberAddForm.tsx             # new
      PlayerCreateForm.tsx              # new
      PlayerRow.tsx                     # new
    pages/
      ClubCreatePage.tsx                # new
      ClubMembersPage.tsx               # new
      ClubPlayersPage.tsx               # new

docs/frontend-stack.md                  # modify — add setQueryData-over-invalidate row
```

---

## Task 1: Prisma schema — `Player.clubId` relation

**Files:**

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_add_player_club_relation/migration.sql` (generated)

**Interfaces:**

- Produces (Prisma Client, generated): `Player.clubId: string`, `Player.club: Club`, `Club.players: Player[]`.
- Consumed by: `ClubsService` (Tasks 4-5).

- [ ] **Step 1: Edit `schema.prisma`**

Full resulting file:

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
  clubId    String
  createdAt DateTime @default(now())
  club      Club     @relation(fields: [clubId], references: [id])

  @@index([clubId])
}

model Club {
  id          String           @id @default(uuid())
  name        String
  createdAt   DateTime         @default(now())
  memberships ClubMembership[]
  players     Player[]
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

  @@index([familyId])
  @@index([userId])
}
```

- [ ] **Step 2: Start local Postgres**

Run from repo root: `docker compose up -d postgres`
Expected: container reports healthy (`docker compose ps postgres`).

- [ ] **Step 3: Generate the migration**

Run from `server/`:

```bash
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" pnpm exec prisma migrate dev --name add_player_club_relation --skip-seed
```

Expected: creates the migration, applies it, "Your database is now in sync with your schema."

- [ ] **Step 4: Regenerate the Prisma client**

Run: `pnpm --filter @basketeasy/server exec prisma generate`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): add Player.clubId relation to Club"
```

---

## Task 2: Shared types — clubs, club-members, players

**Files:**

- Create: `packages/@basketeasy/types/clubs.ts`
- Create: `packages/@basketeasy/types/club-members.ts`
- Create: `packages/@basketeasy/types/players.ts`
- Modify: `packages/@basketeasy/types/package.json`

**Interfaces:**

- Produces: `Club`, `CreateClubRequest`; `ClubRole`, `ClubMember`, `AddClubMemberRequest`; `Player`, `CreatePlayerRequest`, `UpdatePlayerRequest`.
- Consumed by: `server/src/clubs/dto/*.ts` (Task 3), `server/src/clubs/clubs.service.ts` (Tasks 4-5), `server/src/clubs/clubs.controller.ts` (Task 6), `app/src/clubs/*` (Tasks 8-14).

Note: `auth.ts`'s `ClubMembershipInfo` already inlines `role: 'ADMIN' | 'MEMBER'` rather than exporting a standalone `ClubRole` alias — `club-members.ts` follows the same precedent (declares its own `ClubRole` type) rather than reaching into `auth.ts`, to avoid a cross-file type dependency for a two-value union.

- [ ] **Step 1: Write `clubs.ts`**

```typescript
export interface Club {
  id: string;
  name: string;
  createdAt: string;
}

export interface CreateClubRequest {
  name: string;
}
```

- [ ] **Step 2: Write `club-members.ts`**

```typescript
export type ClubRole = 'ADMIN' | 'MEMBER';

export interface ClubMember {
  userId: string;
  email: string;
  role: ClubRole;
  joinedAt: string;
}

export interface AddClubMemberRequest {
  email: string;
}
```

- [ ] **Step 3: Write `players.ts`**

```typescript
export interface Player {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export interface CreatePlayerRequest {
  firstName: string;
  lastName: string;
}

export interface UpdatePlayerRequest {
  firstName?: string;
  lastName?: string;
}
```

- [ ] **Step 4: Add the exports**

Edit `packages/@basketeasy/types/package.json`, add to `"exports"` alongside the existing `"./health"`/`"./auth"` entries:

```json
"./clubs": {
  "types": "./clubs.ts",
  "default": "./clubs.ts"
},
"./club-members": {
  "types": "./club-members.ts",
  "default": "./club-members.ts"
},
"./players": {
  "types": "./players.ts",
  "default": "./players.ts"
}
```

- [ ] **Step 5: Verify the package still builds**

Run: `pnpm --filter @basketeasy/types build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/@basketeasy/types/clubs.ts packages/@basketeasy/types/club-members.ts packages/@basketeasy/types/players.ts packages/@basketeasy/types/package.json
git commit -m "feat(types): add shared club/club-member/player DTOs"
```

---

## Task 3: Backend DTOs

**Files:**

- Create: `server/src/clubs/dto/create-club.dto.ts`
- Create: `server/src/clubs/dto/add-club-member.dto.ts`
- Create: `server/src/clubs/dto/create-player.dto.ts`
- Create: `server/src/clubs/dto/update-player.dto.ts`

**Interfaces:**

- Consumes: `CreateClubRequest`, `AddClubMemberRequest`, `CreatePlayerRequest`, `UpdatePlayerRequest` from `@basketeasy/types/*` (Task 2).
- Produces: `CreateClubDto`, `AddClubMemberDto`, `CreatePlayerDto`, `UpdatePlayerDto` — consumed by `ClubsController` (Task 6).

- [ ] **Step 1: Write `create-club.dto.ts`**

```typescript
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { CreateClubRequest } from '@basketeasy/types/clubs';

export class CreateClubDto implements CreateClubRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
```

- [ ] **Step 2: Write `add-club-member.dto.ts`**

```typescript
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import type { AddClubMemberRequest } from '@basketeasy/types/club-members';

export class AddClubMemberDto implements AddClubMemberRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;
}
```

- [ ] **Step 3: Write `create-player.dto.ts`**

```typescript
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { CreatePlayerRequest } from '@basketeasy/types/players';

export class CreatePlayerDto implements CreatePlayerRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;
}
```

- [ ] **Step 4: Write `update-player.dto.ts`**

```typescript
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { UpdatePlayerRequest } from '@basketeasy/types/players';

export class UpdatePlayerDto implements UpdatePlayerRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;
}
```

- [ ] **Step 5: Verify it compiles**

Run: `pnpm --filter @basketeasy/server exec tsc --noEmit -p tsconfig.json`
Expected: no errors referencing the new DTO files.

- [ ] **Step 6: Commit**

```bash
git add server/src/clubs/dto
git commit -m "feat(server): add club/member/player DTOs"
```

---

## Task 4: ClubsService — club + membership methods

**Files:**

- Create: `server/src/clubs/clubs.service.ts`
- Create: `server/src/clubs/clubs.service.spec.ts`

**Interfaces:**

- Consumes: `PrismaService` (`prisma.club`, `prisma.clubMembership`, `prisma.user`).
- Produces (this task): `class ClubsService` with `createClub(userId, name)`, `listClubsForUser(userId)`, `getClub(clubId)`, `addMember(clubId, email)`, `listMembers(clubId)`, `removeMember(clubId, userId)`. `addMember` throws `NotFoundException` if no `User` with that email exists, `ConflictException` if already a member. `removeMember` throws `NotFoundException` if no membership, `BadRequestException` if it's the club's last `ADMIN`.
- Task 5 adds the player methods to this same class/file.

- [ ] **Step 1: Write the failing tests**

```typescript
// server/src/clubs/clubs.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClubsService', () => {
  let service: ClubsService;
  let prisma: {
    club: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    clubMembership: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    player: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      club: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      clubMembership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      player: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClubsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ClubsService>(ClubsService);
  });

  describe('createClub', () => {
    it('creates a club with the creator as ADMIN', async () => {
      prisma.club.create.mockResolvedValue({
        id: 'club-1',
        name: 'COC Basket',
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.createClub('user-1', 'COC Basket');

      expect(prisma.club.create).toHaveBeenCalledWith({
        data: {
          name: 'COC Basket',
          memberships: { create: { userId: 'user-1', role: 'ADMIN' } },
        },
      });
      expect(result).toEqual({
        id: 'club-1',
        name: 'COC Basket',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('addMember', () => {
    it('throws NotFoundException when no user has that email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.addMember('club-1', 'nobody@example.com')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.clubMembership.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the user is already a member', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'a@b.com' });
      prisma.clubMembership.findUnique.mockResolvedValue({ id: 'membership-1' });

      await expect(service.addMember('club-1', 'a@b.com')).rejects.toThrow(ConflictException);
      expect(prisma.clubMembership.create).not.toHaveBeenCalled();
    });

    it('adds the user as MEMBER', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'a@b.com' });
      prisma.clubMembership.findUnique.mockResolvedValue(null);
      prisma.clubMembership.create.mockResolvedValue({
        role: 'MEMBER',
        createdAt: new Date('2026-01-02'),
      });

      const result = await service.addMember('club-1', 'a@b.com');

      expect(prisma.clubMembership.create).toHaveBeenCalledWith({
        data: { userId: 'user-2', clubId: 'club-1', role: 'MEMBER' },
      });
      expect(result).toEqual({
        userId: 'user-2',
        email: 'a@b.com',
        role: 'MEMBER',
        joinedAt: '2026-01-02T00:00:00.000Z',
      });
    });
  });

  describe('removeMember', () => {
    it('throws NotFoundException when there is no such membership', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue(null);

      await expect(service.removeMember('club-1', 'user-2')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when removing the last admin', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.clubMembership.count.mockResolvedValue(1);

      await expect(service.removeMember('club-1', 'user-1')).rejects.toThrow(BadRequestException);
      expect(prisma.clubMembership.delete).not.toHaveBeenCalled();
    });

    it('removes a non-last-admin membership', async () => {
      prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
      prisma.clubMembership.delete.mockResolvedValue({});

      await service.removeMember('club-1', 'user-2');

      expect(prisma.clubMembership.delete).toHaveBeenCalledWith({
        where: { userId_clubId: { userId: 'user-2', clubId: 'club-1' } },
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/server test -- clubs.service.spec.ts`
Expected: FAIL — `Cannot find module './clubs.service'`.

- [ ] **Step 3: Write `clubs.service.ts` (club + membership methods only)**

```typescript
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Club } from '@basketeasy/types/clubs';
import type { ClubMember } from '@basketeasy/types/club-members';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  async createClub(userId: string, name: string): Promise<Club> {
    const club = await this.prisma.club.create({
      data: {
        name,
        memberships: { create: { userId, role: 'ADMIN' } },
      },
    });
    return this.toClub(club);
  }

  async listClubsForUser(userId: string): Promise<Club[]> {
    const clubs = await this.prisma.club.findMany({
      where: { memberships: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
    });
    return clubs.map((club) => this.toClub(club));
  }

  async getClub(clubId: string): Promise<Club> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }
    return this.toClub(club);
  }

  async addMember(clubId: string, email: string): Promise<ClubMember> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('No account with that email');
    }

    const existing = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: user.id, clubId } },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this club');
    }

    const membership = await this.prisma.clubMembership.create({
      data: { userId: user.id, clubId, role: 'MEMBER' },
    });

    return {
      userId: user.id,
      email: user.email,
      role: membership.role,
      joinedAt: membership.createdAt.toISOString(),
    };
  }

  async listMembers(clubId: string): Promise<ClubMember[]> {
    const memberships = await this.prisma.clubMembership.findMany({
      where: { clubId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      role: m.role,
      joinedAt: m.createdAt.toISOString(),
    }));
  }

  async removeMember(clubId: string, userId: string): Promise<void> {
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.role === 'ADMIN') {
      const adminCount = await this.prisma.clubMembership.count({
        where: { clubId, role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot remove the last admin of a club');
      }
    }

    await this.prisma.clubMembership.delete({
      where: { userId_clubId: { userId, clubId } },
    });
  }

  private toClub(club: { id: string; name: string; createdAt: Date }): Club {
    return { id: club.id, name: club.name, createdAt: club.createdAt.toISOString() };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/server test -- clubs.service.spec.ts`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/clubs/clubs.service.ts server/src/clubs/clubs.service.spec.ts
git commit -m "feat(server): ClubsService club creation and membership management"
```

---

## Task 5: ClubsService — player roster methods

**Files:**

- Modify: `server/src/clubs/clubs.service.ts`
- Modify: `server/src/clubs/clubs.service.spec.ts`

**Interfaces:**

- Produces: `listPlayers(clubId)`, `createPlayer(clubId, firstName, lastName)`, `updatePlayer(clubId, playerId, data)`, `deletePlayer(clubId, playerId)` — `updatePlayer`/`deletePlayer` throw `NotFoundException` if the player doesn't exist _or_ belongs to a different club (defense in depth beyond the route-level `clubId` scoping).
- Consumed by: `ClubsController` (Task 6).

- [ ] **Step 1: Add the failing tests**

Append inside `describe('ClubsService', ...)`:

```typescript
describe('players', () => {
  it('lists players for a club, ordered by name', async () => {
    prisma.player.findMany.mockResolvedValue([
      {
        id: 'p1',
        clubId: 'club-1',
        firstName: 'A',
        lastName: 'B',
        createdAt: new Date('2026-01-01'),
      },
    ]);

    const result = await service.listPlayers('club-1');

    expect(prisma.player.findMany).toHaveBeenCalledWith({
      where: { clubId: 'club-1' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    expect(result).toEqual([
      {
        id: 'p1',
        clubId: 'club-1',
        firstName: 'A',
        lastName: 'B',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('creates a player scoped to the club', async () => {
    prisma.player.create.mockResolvedValue({
      id: 'p1',
      clubId: 'club-1',
      firstName: 'A',
      lastName: 'B',
      createdAt: new Date('2026-01-01'),
    });

    const result = await service.createPlayer('club-1', 'A', 'B');

    expect(prisma.player.create).toHaveBeenCalledWith({
      data: { clubId: 'club-1', firstName: 'A', lastName: 'B' },
    });
    expect(result.id).toBe('p1');
  });

  it('throws NotFoundException updating a player from another club', async () => {
    prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'other-club' });

    await expect(service.updatePlayer('club-1', 'p1', { firstName: 'C' })).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.player.update).not.toHaveBeenCalled();
  });

  it('updates a player belonging to the club', async () => {
    prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'club-1' });
    prisma.player.update.mockResolvedValue({
      id: 'p1',
      clubId: 'club-1',
      firstName: 'C',
      lastName: 'B',
      createdAt: new Date('2026-01-01'),
    });

    const result = await service.updatePlayer('club-1', 'p1', { firstName: 'C' });

    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { firstName: 'C' },
    });
    expect(result.firstName).toBe('C');
  });

  it('throws NotFoundException deleting a player from another club', async () => {
    prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'other-club' });

    await expect(service.deletePlayer('club-1', 'p1')).rejects.toThrow(NotFoundException);
    expect(prisma.player.delete).not.toHaveBeenCalled();
  });

  it('deletes a player belonging to the club', async () => {
    prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'club-1' });
    prisma.player.delete.mockResolvedValue({});

    await service.deletePlayer('club-1', 'p1');

    expect(prisma.player.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/server test -- clubs.service.spec.ts`
Expected: FAIL — `service.listPlayers is not a function` etc.

- [ ] **Step 3: Add the player methods to `clubs.service.ts`**

Add `import type { Player } from '@basketeasy/types/players';` to the imports, and append inside the class (after `removeMember`):

```typescript
  async listPlayers(clubId: string): Promise<Player[]> {
    const players = await this.prisma.player.findMany({
      where: { clubId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return players.map((p) => this.toPlayer(p));
  }

  async createPlayer(clubId: string, firstName: string, lastName: string): Promise<Player> {
    const player = await this.prisma.player.create({
      data: { clubId, firstName, lastName },
    });
    return this.toPlayer(player);
  }

  async updatePlayer(
    clubId: string,
    playerId: string,
    data: { firstName?: string; lastName?: string },
  ): Promise<Player> {
    await this.findPlayerInClub(clubId, playerId);
    const player = await this.prisma.player.update({ where: { id: playerId }, data });
    return this.toPlayer(player);
  }

  async deletePlayer(clubId: string, playerId: string): Promise<void> {
    await this.findPlayerInClub(clubId, playerId);
    await this.prisma.player.delete({ where: { id: playerId } });
  }

  private async findPlayerInClub(clubId: string, playerId: string): Promise<void> {
    const existing = await this.prisma.player.findUnique({ where: { id: playerId } });
    if (!existing || existing.clubId !== clubId) {
      throw new NotFoundException('Player not found');
    }
  }

  private toPlayer(player: {
    id: string;
    clubId: string;
    firstName: string;
    lastName: string;
    createdAt: Date;
  }): Player {
    return {
      id: player.id,
      clubId: player.clubId,
      firstName: player.firstName,
      lastName: player.lastName,
      createdAt: player.createdAt.toISOString(),
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/server test -- clubs.service.spec.ts`
Expected: PASS, all 13 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/clubs/clubs.service.ts server/src/clubs/clubs.service.spec.ts
git commit -m "feat(server): ClubsService player roster CRUD"
```

---

## Task 6: ClubsController

**Files:**

- Create: `server/src/clubs/clubs.controller.ts`
- Create: `server/src/clubs/clubs.controller.spec.ts`

**Interfaces:**

- Consumes: `ClubsService` (Tasks 4-5), all four DTOs (Task 3), `JwtAuthGuard`/`ClubRolesGuard`/`@ClubRoles`/`@CurrentUser` from `../auth/*` (existing).
- Produces: the 9 HTTP routes listed below, all under class-level `@UseGuards(JwtAuthGuard)`.

| Method | Path                               | Extra guard                    |
| ------ | ---------------------------------- | ------------------------------ |
| POST   | `/clubs`                           | —                              |
| GET    | `/clubs`                           | —                              |
| GET    | `/clubs/:clubId`                   | `@ClubRoles('ADMIN','MEMBER')` |
| POST   | `/clubs/:clubId/members`           | `@ClubRoles('ADMIN')`          |
| GET    | `/clubs/:clubId/members`           | `@ClubRoles('ADMIN','MEMBER')` |
| DELETE | `/clubs/:clubId/members/:userId`   | `@ClubRoles('ADMIN')`          |
| POST   | `/clubs/:clubId/players`           | `@ClubRoles('ADMIN')`          |
| GET    | `/clubs/:clubId/players`           | `@ClubRoles('ADMIN','MEMBER')` |
| PATCH  | `/clubs/:clubId/players/:playerId` | `@ClubRoles('ADMIN')`          |
| DELETE | `/clubs/:clubId/players/:playerId` | `@ClubRoles('ADMIN')`          |

- [ ] **Step 1: Write the failing tests**

```typescript
// server/src/clubs/clubs.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

describe('ClubsController', () => {
  let controller: ClubsController;
  let service: {
    createClub: jest.Mock;
    listClubsForUser: jest.Mock;
    getClub: jest.Mock;
    addMember: jest.Mock;
    listMembers: jest.Mock;
    removeMember: jest.Mock;
    createPlayer: jest.Mock;
    listPlayers: jest.Mock;
    updatePlayer: jest.Mock;
    deletePlayer: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createClub: jest.fn(),
      listClubsForUser: jest.fn(),
      getClub: jest.fn(),
      addMember: jest.fn(),
      listMembers: jest.fn(),
      removeMember: jest.fn(),
      createPlayer: jest.fn(),
      listPlayers: jest.fn(),
      updatePlayer: jest.fn(),
      deletePlayer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClubsController],
      providers: [{ provide: ClubsService, useValue: service }],
    }).compile();

    controller = module.get<ClubsController>(ClubsController);
  });

  it('createClub delegates to the service with the current user id', async () => {
    service.createClub.mockResolvedValue({ id: 'club-1', name: 'COC', createdAt: 'x' });

    const result = await controller.createClub({ id: 'user-1', email: 'a@b.com' }, { name: 'COC' });

    expect(service.createClub).toHaveBeenCalledWith('user-1', 'COC');
    expect(result.id).toBe('club-1');
  });

  it('addMember delegates clubId and email', async () => {
    service.addMember.mockResolvedValue({
      userId: 'u2',
      email: 'a@b.com',
      role: 'MEMBER',
      joinedAt: 'x',
    });

    const result = await controller.addMember('club-1', { email: 'a@b.com' });

    expect(service.addMember).toHaveBeenCalledWith('club-1', 'a@b.com');
    expect(result.userId).toBe('u2');
  });

  it('removeMember delegates clubId and userId', async () => {
    service.removeMember.mockResolvedValue(undefined);

    await controller.removeMember('club-1', 'user-2');

    expect(service.removeMember).toHaveBeenCalledWith('club-1', 'user-2');
  });

  it('createPlayer delegates clubId and the DTO fields', async () => {
    service.createPlayer.mockResolvedValue({
      id: 'p1',
      clubId: 'club-1',
      firstName: 'A',
      lastName: 'B',
      createdAt: 'x',
    });

    const result = await controller.createPlayer('club-1', { firstName: 'A', lastName: 'B' });

    expect(service.createPlayer).toHaveBeenCalledWith('club-1', 'A', 'B');
    expect(result.id).toBe('p1');
  });

  it('updatePlayer delegates clubId, playerId, and the DTO', async () => {
    service.updatePlayer.mockResolvedValue({
      id: 'p1',
      clubId: 'club-1',
      firstName: 'C',
      lastName: 'B',
      createdAt: 'x',
    });

    const result = await controller.updatePlayer('club-1', 'p1', { firstName: 'C' });

    expect(service.updatePlayer).toHaveBeenCalledWith('club-1', 'p1', { firstName: 'C' });
    expect(result.firstName).toBe('C');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/server test -- clubs.controller.spec.ts`
Expected: FAIL — `Cannot find module './clubs.controller'`.

- [ ] **Step 3: Write `clubs.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Club, CreateClubRequest } from '@basketeasy/types/clubs';
import type { ClubMember } from '@basketeasy/types/club-members';
import type { Player } from '@basketeasy/types/players';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { AddClubMemberDto } from './dto/add-club-member.dto';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';

@Controller('clubs')
@UseGuards(JwtAuthGuard)
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Post()
  createClub(@CurrentUser() user: RequestUser, @Body() dto: CreateClubDto): Promise<Club> {
    return this.clubsService.createClub(user.id, dto.name);
  }

  @Get()
  listClubs(@CurrentUser() user: RequestUser): Promise<Club[]> {
    return this.clubsService.listClubsForUser(user.id);
  }

  @Get(':clubId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  getClub(@Param('clubId') clubId: string): Promise<Club> {
    return this.clubsService.getClub(clubId);
  }

  @Post(':clubId/members')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  addMember(@Param('clubId') clubId: string, @Body() dto: AddClubMemberDto): Promise<ClubMember> {
    return this.clubsService.addMember(clubId, dto.email);
  }

  @Get(':clubId/members')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listMembers(@Param('clubId') clubId: string): Promise<ClubMember[]> {
    return this.clubsService.listMembers(clubId);
  }

  @Delete(':clubId/members/:userId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(@Param('clubId') clubId: string, @Param('userId') userId: string): Promise<void> {
    return this.clubsService.removeMember(clubId, userId);
  }

  @Post(':clubId/players')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  createPlayer(@Param('clubId') clubId: string, @Body() dto: CreatePlayerDto): Promise<Player> {
    return this.clubsService.createPlayer(clubId, dto.firstName, dto.lastName);
  }

  @Get(':clubId/players')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listPlayers(@Param('clubId') clubId: string): Promise<Player[]> {
    return this.clubsService.listPlayers(clubId);
  }

  @Patch(':clubId/players/:playerId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  updatePlayer(
    @Param('clubId') clubId: string,
    @Param('playerId') playerId: string,
    @Body() dto: UpdatePlayerDto,
  ): Promise<Player> {
    return this.clubsService.updatePlayer(clubId, playerId, dto);
  }

  @Delete(':clubId/players/:playerId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePlayer(
    @Param('clubId') clubId: string,
    @Param('playerId') playerId: string,
  ): Promise<void> {
    return this.clubsService.deletePlayer(clubId, playerId);
  }
}
```

Note: `CreateClubRequest` is imported by the DTO (Task 3), not directly needed here — remove the unused `CreateClubRequest` import if `tsc`/ESLint flags it; the controller only needs `Club`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/server test -- clubs.controller.spec.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/clubs/clubs.controller.ts server/src/clubs/clubs.controller.spec.ts
git commit -m "feat(server): ClubsController routes"
```

---

## Task 7: ClubsModule + AppModule wiring

**Files:**

- Create: `server/src/clubs/clubs.module.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**

- Produces: `ClubsModule` registering `ClubsController`/`ClubsService`, importing `AuthModule` to make `JwtAuthGuard`/`ClubRolesGuard` available for DI (both are also resolvable without this — `PrismaService` is global and `Reflector` is a Nest core provider — but importing `AuthModule` keeps the dependency explicit rather than incidental).

- [ ] **Step 1: Write `clubs.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

@Module({
  imports: [AuthModule],
  controllers: [ClubsController],
  providers: [ClubsService],
})
export class ClubsModule {}
```

- [ ] **Step 2: Register `ClubsModule` in `app.module.ts`**

Add the import and add `ClubsModule` to the `imports` array, after `AuthModule`:

```typescript
import { ClubsModule } from './clubs/clubs.module';
// ...
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ClubsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Verify the app builds**

Run: `DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" JWT_ACCESS_SECRET="test-secret-at-least-32-characters-long" pnpm --filter @basketeasy/server exec nest build`
Expected: exits 0.

- [ ] **Step 4: Run the full server test suite**

Run: `pnpm --filter @basketeasy/server test`
Expected: PASS, all suites green (health + auth + clubs).

- [ ] **Step 5: Commit**

```bash
git add server/src/clubs/clubs.module.ts server/src/app.module.ts
git commit -m "feat(server): wire ClubsModule into AppModule"
```

---

## Task 8: Frontend — `apiClient` patch/delete + 204 handling

**Files:**

- Modify: `app/src/api/client.ts`
- Modify: `app/src/api/client.test.ts`

**Interfaces:**

- Produces: `apiClient.patch<T>(path, body)`, `apiClient.delete<T>(path)`.
- Fixes: `rawRequest` currently always calls `res.json()`, which throws on the empty body a `204 No Content` response returns (which `removeMember`/`deletePlayer` will send) — needed before Task 11/13 can call `apiClient.delete`.

- [ ] **Step 1: Add a failing test for 204 handling and the new methods**

Add to `app/src/api/client.test.ts` (follow that file's existing MSW-mocking pattern — inspect it first for the exact server-setup helper in use):

```typescript
it('delete resolves without throwing on a 204 No Content response', async () => {
  server.use(
    http.delete('/api/clubs/club-1/players/p1', () => new HttpResponse(null, { status: 204 })),
  );

  await expect(apiClient.delete('/clubs/club-1/players/p1')).resolves.toBeUndefined();
});

it('patch sends a JSON body and returns the parsed response', async () => {
  server.use(
    http.patch('/api/clubs/club-1/players/p1', async ({ request }) => {
      const body = await request.json();
      return HttpResponse.json({ ...body, id: 'p1' });
    }),
  );

  const result = await apiClient.patch<{ id: string; firstName: string }>(
    '/clubs/club-1/players/p1',
    { firstName: 'Updated' },
  );

  expect(result).toEqual({ id: 'p1', firstName: 'Updated' });
});
```

(Match whichever MSW import style — `http`/`HttpResponse` from `msw` vs. the older `rest` API — `app/src/mocks/handlers.ts` already uses.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/app test -- client.test.ts`
Expected: FAIL — `apiClient.delete is not a function` / the 204 case throws a JSON parse error.

- [ ] **Step 3: Update `client.ts`**

In `rawRequest`, right after the `if (!res.ok) { ... }` block, add:

```typescript
if (res.status === 204) {
  return undefined as T;
}
```

And extend the exported object:

```typescript
export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/app test -- client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/api/client.ts app/src/api/client.test.ts
git commit -m "feat(app): add apiClient.patch/delete, fix 204 response handling"
```

---

## Task 9: Frontend — query key helper

**Files:**

- Create: `app/src/clubs/queryKeys.ts`

**Interfaces:**

- Produces: `clubsQueryKey`, `clubQueryKey(clubId)`, `clubMembersQueryKey(clubId)`, `clubPlayersQueryKey(clubId)` — consumed by every hook in Tasks 10-13.

- [ ] **Step 1: Write `queryKeys.ts`**

```typescript
export const clubsQueryKey = ['clubs'] as const;
export const clubQueryKey = (clubId: string) => ['clubs', clubId] as const;
export const clubMembersQueryKey = (clubId: string) => ['clubs', clubId, 'members'] as const;
export const clubPlayersQueryKey = (clubId: string) => ['clubs', clubId, 'players'] as const;
```

- [ ] **Step 2: Commit**

```bash
git add app/src/clubs/queryKeys.ts
git commit -m "feat(app): add clubs query key helpers"
```

---

## Task 10: Frontend — club hooks (`useClubCreate`, `useClubList`, `useClubShow`)

**Files:**

- Create: `app/src/clubs/useClubCreate.ts`
- Create: `app/src/clubs/useClubCreate.test.ts`
- Create: `app/src/clubs/useClubList.ts`
- Create: `app/src/clubs/useClubShow.ts`

**Interfaces:**

- Produces: `useClubCreate()` (mutation, appends to the `clubsQueryKey` cache on success), `useClubList()` (query), `useClubShow(clubId)` (query).
- Consumed by: `ClubCreateForm` (Task 14), `ClubMembersPage`/`ClubPlayersPage` (Task 14).

- [ ] **Step 1: Write `useClubCreate.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Club, CreateClubRequest } from '@basketeasy/types/clubs';
import { apiClient } from '../api/client';
import { clubsQueryKey } from './queryKeys';

export function useClubCreate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateClubRequest) => apiClient.post<Club>('/clubs', dto),
    onSuccess: (club) => {
      queryClient.setQueryData<Club[]>(clubsQueryKey, (prev) => [...(prev ?? []), club]);
    },
  });
}
```

- [ ] **Step 2: Write `useClubCreate.test.ts`**

Follow the pattern in `app/src/auth/mutations.test.ts` (inspect it first for the exact `renderHook`/`QueryClientProvider` wrapper and MSW setup already in use in this repo):

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useClubCreate } from './useClubCreate';
import { renderWithProviders } from '../testUtils'; // or whatever wrapper mutations.test.ts uses

describe('useClubCreate', () => {
  it('posts to /clubs and caches the created club in the clubs list', async () => {
    server.use(
      http.post('/api/clubs', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({ id: 'club-1', name: body.name, createdAt: '2026-01-01' });
      }),
    );

    const { result, queryClient } = renderWithProviders(() => useClubCreate());

    result.current.mutate({ name: 'COC Basket' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['clubs'])).toEqual([
      { id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' },
    ]);
  });
});
```

Adjust the wrapper/import to whatever `app/src/auth/mutations.test.ts` actually exposes — this is illustrative of intent (assert the POST body, assert the cache write), not a literal copy-paste.

- [ ] **Step 3: Write `useClubList.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { Club } from '@basketeasy/types/clubs';
import { apiClient } from '../api/client';
import { clubsQueryKey } from './queryKeys';

export function useClubList() {
  return useQuery({
    queryKey: clubsQueryKey,
    queryFn: () => apiClient.get<Club[]>('/clubs'),
  });
}
```

- [ ] **Step 4: Write `useClubShow.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { Club } from '@basketeasy/types/clubs';
import { apiClient } from '../api/client';
import { clubQueryKey } from './queryKeys';

export function useClubShow(clubId: string) {
  return useQuery({
    queryKey: clubQueryKey(clubId),
    queryFn: () => apiClient.get<Club>(`/clubs/${clubId}`),
  });
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @basketeasy/app test -- useClubCreate.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/clubs/useClubCreate.ts app/src/clubs/useClubCreate.test.ts app/src/clubs/useClubList.ts app/src/clubs/useClubShow.ts
git commit -m "feat(app): useClubCreate/useClubList/useClubShow hooks"
```

---

## Task 11: Frontend — member hooks + error messages

**Files:**

- Create: `app/src/clubs/useClubMemberAdd.ts` (+ `.test.ts`, same pattern as Task 10 Step 2)
- Create: `app/src/clubs/useClubMemberList.ts`
- Create: `app/src/clubs/useClubMemberRemove.ts`
- Create: `app/src/clubs/clubErrorMessages.ts`

**Interfaces:**

- Produces: `useClubMemberAdd(clubId)`, `useClubMemberList(clubId)`, `useClubMemberRemove(clubId)`, `getClubErrorMessage(err)`.
- Consumed by: `ClubMemberAddForm`, `ClubMembersPage` (Task 14).

- [ ] **Step 1: Write `useClubMemberAdd.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddClubMemberRequest, ClubMember } from '@basketeasy/types/club-members';
import { apiClient } from '../api/client';
import { clubMembersQueryKey } from './queryKeys';

export function useClubMemberAdd(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddClubMemberRequest) =>
      apiClient.post<ClubMember>(`/clubs/${clubId}/members`, dto),
    onSuccess: (member) => {
      queryClient.setQueryData<ClubMember[]>(clubMembersQueryKey(clubId), (prev) => [
        ...(prev ?? []),
        member,
      ]);
    },
  });
}
```

Test file follows Task 10 Step 2's pattern (assert the POST, assert the cache append).

- [ ] **Step 2: Write `useClubMemberList.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { ClubMember } from '@basketeasy/types/club-members';
import { apiClient } from '../api/client';
import { clubMembersQueryKey } from './queryKeys';

export function useClubMemberList(clubId: string) {
  return useQuery({
    queryKey: clubMembersQueryKey(clubId),
    queryFn: () => apiClient.get<ClubMember[]>(`/clubs/${clubId}/members`),
  });
}
```

- [ ] **Step 3: Write `useClubMemberRemove.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClubMember } from '@basketeasy/types/club-members';
import { apiClient } from '../api/client';
import { clubMembersQueryKey } from './queryKeys';

export function useClubMemberRemove(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => apiClient.delete(`/clubs/${clubId}/members/${userId}`),
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<ClubMember[]>(clubMembersQueryKey(clubId), (prev) =>
        (prev ?? []).filter((m) => m.userId !== userId),
      );
    },
  });
}
```

- [ ] **Step 4: Write `clubErrorMessages.ts`**

Mirrors `app/src/auth/errorMessages.ts` — keyed on HTTP status, not message text. Note: 404 here is deliberately generic ("resource not found"), _not_ "no account with that email" — that email-specific copy is context-only-valid on the add-member form and is handled inline there (Task 14), not centralized in this shared mapper, since a 404 means something different on a player-not-found path.

```typescript
import { ApiError } from '../api/client';

const GENERIC_ERROR = 'Une erreur est survenue. Merci de réessayer.';

export function getClubErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        return 'Certaines informations saisies sont invalides.';
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return 'Ressource introuvable.';
      case 409:
        return 'Cette personne est déjà membre du club.';
      default:
        return GENERIC_ERROR;
    }
  }
  return GENERIC_ERROR;
}
```

- [ ] **Step 5: Run tests, commit**

```bash
pnpm --filter @basketeasy/app test -- useClubMemberAdd.test.ts
git add app/src/clubs/useClubMemberAdd.ts app/src/clubs/useClubMemberAdd.test.ts app/src/clubs/useClubMemberList.ts app/src/clubs/useClubMemberRemove.ts app/src/clubs/clubErrorMessages.ts
git commit -m "feat(app): club member hooks and error message mapping"
```

---

## Task 12: Frontend — player hooks

**Files:**

- Create: `app/src/clubs/usePlayerCreate.ts` (+ `.test.ts`)
- Create: `app/src/clubs/usePlayerList.ts`
- Create: `app/src/clubs/usePlayerUpdate.ts`
- Create: `app/src/clubs/usePlayerDelete.ts`

**Interfaces:**

- Produces: `usePlayerCreate(clubId)`, `usePlayerList(clubId)`, `usePlayerUpdate(clubId)`, `usePlayerDelete(clubId)`.
- Consumed by: `PlayerCreateForm`, `PlayerRow`, `ClubPlayersPage` (Task 14).

- [ ] **Step 1: Write `usePlayerCreate.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatePlayerRequest, Player } from '@basketeasy/types/players';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerCreate(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreatePlayerRequest) =>
      apiClient.post<Player>(`/clubs/${clubId}/players`, dto),
    onSuccess: (player) => {
      queryClient.setQueryData<Player[]>(clubPlayersQueryKey(clubId), (prev) => [
        ...(prev ?? []),
        player,
      ]);
    },
  });
}
```

Test file follows Task 10 Step 2's pattern.

- [ ] **Step 2: Write `usePlayerList.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { Player } from '@basketeasy/types/players';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerList(clubId: string) {
  return useQuery({
    queryKey: clubPlayersQueryKey(clubId),
    queryFn: () => apiClient.get<Player[]>(`/clubs/${clubId}/players`),
  });
}
```

- [ ] **Step 3: Write `usePlayerUpdate.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Player, UpdatePlayerRequest } from '@basketeasy/types/players';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerUpdate(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playerId, dto }: { playerId: string; dto: UpdatePlayerRequest }) =>
      apiClient.patch<Player>(`/clubs/${clubId}/players/${playerId}`, dto),
    onSuccess: (player) => {
      queryClient.setQueryData<Player[]>(clubPlayersQueryKey(clubId), (prev) =>
        (prev ?? []).map((p) => (p.id === player.id ? player : p)),
      );
    },
  });
}
```

- [ ] **Step 4: Write `usePlayerDelete.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Player } from '@basketeasy/types/players';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerDelete(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (playerId: string) => apiClient.delete(`/clubs/${clubId}/players/${playerId}`),
    onSuccess: (_data, playerId) => {
      queryClient.setQueryData<Player[]>(clubPlayersQueryKey(clubId), (prev) =>
        (prev ?? []).filter((p) => p.id !== playerId),
      );
    },
  });
}
```

- [ ] **Step 5: Run tests, commit**

```bash
pnpm --filter @basketeasy/app test -- usePlayerCreate.test.ts
git add app/src/clubs/usePlayerCreate.ts app/src/clubs/usePlayerCreate.test.ts app/src/clubs/usePlayerList.ts app/src/clubs/usePlayerUpdate.ts app/src/clubs/usePlayerDelete.ts
git commit -m "feat(app): player roster hooks"
```

---

## Task 13: Frontend — forms

**Files:**

- Create: `app/src/clubs/ClubCreateForm.tsx` (+ `.test.tsx`)
- Create: `app/src/clubs/ClubMemberAddForm.tsx` (+ `.test.tsx`)
- Create: `app/src/clubs/PlayerCreateForm.tsx` (+ `.test.tsx`)
- Create: `app/src/clubs/PlayerRow.tsx`

**Interfaces:**

- Consumes: hooks from Tasks 10-12, `getClubErrorMessage` (Task 11), `@basketeasy/ui` components, following `app/src/auth/LoginForm.tsx`'s structure exactly (react-hook-form + zod, `setError('root', ...)` + `<Alert variant="destructive">` for submit errors).
- Consumed by: pages (Task 14).

- [ ] **Step 1: Write `ClubCreateForm.tsx`**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@basketeasy/ui/card';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { useClubCreate } from './useClubCreate';
import { getClubErrorMessage } from './clubErrorMessages';

const clubSchema = z.object({
  name: z.string().min(2, 'Le nom du club doit contenir au moins 2 caractères'),
});

type ClubFormValues = z.infer<typeof clubSchema>;

export function ClubCreateForm() {
  const navigate = useNavigate();
  const { mutate: createClub, isPending } = useClubCreate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClubFormValues>({ resolver: zodResolver(clubSchema) });

  const onSubmit = (values: ClubFormValues) => {
    createClub(values, {
      onSuccess: (club) => navigate(`/clubs/${club.id}/players`),
      onError: (err) => setError('root', { message: getClubErrorMessage(err) }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer un club</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="flex flex-col gap-4"
        >
          {errors.root?.message && (
            <Alert variant="destructive">
              <AlertDescription>{errors.root.message}</AlertDescription>
            </Alert>
          )}

          <FormField
            label="Nom du club"
            id="club-name"
            error={errors.name?.message}
            {...register('name')}
          />

          <Button type="submit" disabled={isSubmitting || isPending}>
            Créer le club
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `ClubMemberAddForm.tsx`**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { ApiError } from '../api/client';
import { useClubMemberAdd } from './useClubMemberAdd';
import { getClubErrorMessage } from './clubErrorMessages';

const memberSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
});

type MemberFormValues = z.infer<typeof memberSchema>;

export function ClubMemberAddForm({ clubId }: { clubId: string }) {
  const { mutate: addMember, isPending } = useClubMemberAdd(clubId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({ resolver: zodResolver(memberSchema) });

  const onSubmit = (values: MemberFormValues) => {
    addMember(values, {
      onSuccess: () => reset(),
      onError: (err) => {
        const message =
          err instanceof ApiError && err.status === 404
            ? 'Aucun compte avec cette adresse e-mail.'
            : getClubErrorMessage(err);
        setError('root', { message });
      },
    });
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="flex flex-col gap-4"
    >
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <FormField
        label="Adresse e-mail du membre"
        id="member-email"
        type="email"
        error={errors.email?.message}
        {...register('email')}
      />

      <Button type="submit" disabled={isSubmitting || isPending}>
        Ajouter
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Write `PlayerCreateForm.tsx`**

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { usePlayerCreate } from './usePlayerCreate';
import { getClubErrorMessage } from './clubErrorMessages';

const playerSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
});

type PlayerFormValues = z.infer<typeof playerSchema>;

export function PlayerCreateForm({ clubId }: { clubId: string }) {
  const { mutate: createPlayer, isPending } = usePlayerCreate(clubId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PlayerFormValues>({ resolver: zodResolver(playerSchema) });

  const onSubmit = (values: PlayerFormValues) => {
    createPlayer(values, {
      onSuccess: () => reset(),
      onError: (err) => setError('root', { message: getClubErrorMessage(err) }),
    });
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="flex items-end gap-4"
    >
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <FormField
        label="Prénom"
        id="player-first-name"
        error={errors.firstName?.message}
        {...register('firstName')}
      />
      <FormField
        label="Nom"
        id="player-last-name"
        error={errors.lastName?.message}
        {...register('lastName')}
      />

      <Button type="submit" disabled={isSubmitting || isPending}>
        Ajouter un joueur
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Write `PlayerRow.tsx`**

Not a form, but colocated here since it's the player list's inline edit/delete UI (no separate edit page/modal — a table row toggles into edit mode):

```typescript
import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Input } from '@basketeasy/ui/input';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { Player } from '@basketeasy/types/players';
import { usePlayerUpdate } from './usePlayerUpdate';
import { usePlayerDelete } from './usePlayerDelete';

export function PlayerRow({
  clubId,
  player,
  isAdmin,
}: {
  clubId: string;
  player: Player;
  isAdmin: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState(player.firstName);
  const [lastName, setLastName] = useState(player.lastName);
  const { mutate: updatePlayer, isPending: isUpdating } = usePlayerUpdate(clubId);
  const { mutate: deletePlayer, isPending: isDeleting } = usePlayerDelete(clubId);

  if (isEditing) {
    return (
      <TableRow>
        <TableCell>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </TableCell>
        <TableCell>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </TableCell>
        <TableCell className="flex gap-2">
          <Button
            disabled={isUpdating}
            onClick={() =>
              updatePlayer(
                { playerId: player.id, dto: { firstName, lastName } },
                { onSuccess: () => setIsEditing(false) },
              )
            }
          >
            Enregistrer
          </Button>
          <Button variant="ghost" onClick={() => setIsEditing(false)}>
            Annuler
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell>{player.firstName}</TableCell>
      <TableCell>{player.lastName}</TableCell>
      <TableCell className="flex gap-2">
        {isAdmin && (
          <>
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              Modifier
            </Button>
            <Button variant="outline" disabled={isDeleting} onClick={() => deletePlayer(player.id)}>
              Supprimer
            </Button>
          </>
        )}
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 5: Write component tests**

`ClubCreateForm.test.tsx`, `ClubMemberAddForm.test.tsx`, `PlayerCreateForm.test.tsx` — follow `app/src/auth/LoginForm.test.tsx`'s pattern exactly (render with MSW-mocked endpoint, fill fields, submit, assert either navigation/cache update on success or the `Alert` text on a mocked error response).

- [ ] **Step 6: Run tests, commit**

```bash
pnpm --filter @basketeasy/app test -- ClubCreateForm ClubMemberAddForm PlayerCreateForm
git add app/src/clubs/ClubCreateForm.tsx app/src/clubs/ClubCreateForm.test.tsx app/src/clubs/ClubMemberAddForm.tsx app/src/clubs/ClubMemberAddForm.test.tsx app/src/clubs/PlayerCreateForm.tsx app/src/clubs/PlayerCreateForm.test.tsx app/src/clubs/PlayerRow.tsx
git commit -m "feat(app): club create, member add, and player forms"
```

---

## Task 14: Frontend — pages + routing

**Files:**

- Create: `app/src/pages/ClubCreatePage.tsx`
- Create: `app/src/pages/ClubMembersPage.tsx`
- Create: `app/src/pages/ClubPlayersPage.tsx`
- Modify: `app/src/App.tsx`

**Interfaces:**

- Consumes: forms/hooks from Tasks 10-13, `useAccount` (existing), `useParams` from `react-router-dom`.
- Role-gating: each page computes `isAdmin = user?.memberships.some((m) => m.clubId === clubId && m.role === 'ADMIN') ?? false` from the already-loaded `User.memberships` — no new Context/state, per Global Constraints. This only hides admin-only UI; the backend guard is the actual enforcement.

- [ ] **Step 1: Write `ClubCreatePage.tsx`**

```typescript
import { ClubCreateForm } from '../clubs/ClubCreateForm';

export function ClubCreatePage() {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <ClubCreateForm />
    </main>
  );
}
```

- [ ] **Step 2: Write `ClubMembersPage.tsx`**

```typescript
import { useParams } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import { Button } from '@basketeasy/ui/button';
import { useAccount } from '../auth/useAccount';
import { useClubMemberList } from '../clubs/useClubMemberList';
import { useClubMemberRemove } from '../clubs/useClubMemberRemove';
import { ClubMemberAddForm } from '../clubs/ClubMemberAddForm';

export function ClubMembersPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { user } = useAccount();
  const { data: members, isLoading } = useClubMemberList(clubId!);
  const { mutate: removeMember } = useClubMemberRemove(clubId!);

  const isAdmin =
    user?.memberships.some((m) => m.clubId === clubId && m.role === 'ADMIN') ?? false;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <h1 className="m-0 text-4xl">Membres du club</h1>

      {isAdmin && <ClubMemberAddForm clubId={clubId!} />}

      {isLoading ? (
        <p>Chargement...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-mail</TableHead>
              <TableHead>Rôle</TableHead>
              {isAdmin && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>{member.email}</TableCell>
                <TableCell>{member.role === 'ADMIN' ? 'Administrateur' : 'Membre'}</TableCell>
                {isAdmin && (
                  <TableCell>
                    <Button variant="outline" onClick={() => removeMember(member.userId)}>
                      Retirer
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Write `ClubPlayersPage.tsx`**

```typescript
import { useParams } from 'react-router-dom';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { useAccount } from '../auth/useAccount';
import { usePlayerList } from '../clubs/usePlayerList';
import { PlayerCreateForm } from '../clubs/PlayerCreateForm';
import { PlayerRow } from '../clubs/PlayerRow';

export function ClubPlayersPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { user } = useAccount();
  const { data: players, isLoading } = usePlayerList(clubId!);

  const isAdmin =
    user?.memberships.some((m) => m.clubId === clubId && m.role === 'ADMIN') ?? false;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <h1 className="m-0 text-4xl">Joueurs</h1>

      {isAdmin && <PlayerCreateForm clubId={clubId!} />}

      {isLoading ? (
        <p>Chargement...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prénom</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {players?.map((player) => (
              <PlayerRow key={player.id} clubId={clubId!} player={player} isAdmin={isAdmin} />
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Wire routes in `App.tsx`**

```typescript
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PublicOnlyRoute } from './auth/PublicOnlyRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClubCreatePage } from './pages/ClubCreatePage';
import { ClubMembersPage } from './pages/ClubMembersPage';
import { ClubPlayersPage } from './pages/ClubPlayersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/clubs/new" element={<ClubCreatePage />} />
        <Route path="/clubs/:clubId/members" element={<ClubMembersPage />} />
        <Route path="/clubs/:clubId/players" element={<ClubPlayersPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 5: Write page tests**

`ClubMembersPage.test.tsx`, `ClubPlayersPage.test.tsx` — follow `app/src/App.test.tsx`'s routing-test pattern (render at a given path with a mocked `useAccount`/MSW session, assert admin-only controls appear/don't appear based on `memberships`).

- [ ] **Step 6: Run tests, commit**

```bash
pnpm --filter @basketeasy/app test
git add app/src/pages/ClubCreatePage.tsx app/src/pages/ClubMembersPage.tsx app/src/pages/ClubPlayersPage.tsx app/src/pages/ClubMembersPage.test.tsx app/src/pages/ClubPlayersPage.test.tsx app/src/App.tsx
git commit -m "feat(app): club create/members/players pages and routing"
```

---

## Task 15: Document the `setQueryData`-over-`invalidateQueries` convention

**Files:**

- Modify: `docs/frontend-stack.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add a row to the "Data fetching & server state" table**

In the same table that already has the hook-naming and one-hook-per-file rows, add:

```markdown
| Mutation cache updates | `queryClient.setQueryData(...)` with the mutation response, not `invalidateQueries` | the response already has the full updated record — writing it directly into the cache avoids an extra round-trip refetch |
```

- [ ] **Step 2: Commit**

```bash
git add docs/frontend-stack.md
git commit -m "docs(frontend-stack): document setQueryData-over-invalidateQueries convention"
```

---

## Task 16: Manual verification against a running stack

**Files:** none (verification only)

- [ ] **Step 1: Bring up Postgres, apply migrations, start both apps**

```bash
docker compose up -d postgres
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" pnpm --filter @basketeasy/server exec prisma migrate deploy
pnpm dev
```

- [ ] **Step 2: Two-user walkthrough**

1. Register user A (`a@example.com`) and user B (`b@example.com`) via `/register`.
2. Log in as A, go to `/clubs/new`, create "COC Basket" — expect redirect to `/clubs/:id/players`.
3. Go to `/clubs/:id/members`, add `b@example.com` — expect it to appear in the table immediately (no page refetch needed — confirms `setQueryData` wiring).
4. Attempt to add `nobody@example.com` — expect the French "Aucun compte avec cette adresse e-mail." message, no entry added.
5. On `/clubs/:id/players`, add a player, edit their name inline, delete them — expect the table to update immediately after each action without a manual refresh.
6. Log out, log in as B, navigate to the same club's `/members` and `/players` URLs — expect read access (lists load) but no "Ajouter"/"Modifier"/"Supprimer"/"Retirer" controls (B is `MEMBER`, not `ADMIN`).
7. As B, attempt `curl -X POST .../clubs/:id/members` directly with B's access token — expect `403` (confirms the backend guard, not just the hidden UI, is the real enforcement).

- [ ] **Step 3:** Note the result of manual verification in the PR description (no commit for this task — verification only).

---

## Self-Review Notes

- **Scope coverage:** club creation (Task 4), join-by-email with 404/409 semantics (Task 4), last-admin removal protection (Task 4), player roster CRUD scoped to a club (Task 5), all routes guarded by the existing `JwtAuthGuard`/`ClubRolesGuard` with `:clubId` param naming respected throughout (Task 6), frontend hooks named `use<Model><Method>` one-per-file with `setQueryData` cache writes (Tasks 9-12), role-gated UI reading from existing `User.memberships` with no new Context (Task 14).
- **Explicitly out of scope, unchanged from prior discussion:** email invites, join codes, new role types beyond ADMIN/MEMBER, CTC/multi-club support, linking a `Player` to a `User` account, a global "current club" switcher, any change to `DashboardPage.tsx`.
- **Known gap intentionally left for the implementer:** Task 8 fixes a latent bug in `apiClient.rawRequest` (no 204 handling) that would otherwise break every `DELETE` call added in Tasks 11/12 — called out explicitly rather than silently patched, since it's a pre-existing file this plan didn't otherwise expect to touch.
- **Type consistency:** `Club`/`CreateClubRequest` (Task 2), `ClubRole`/`ClubMember`/`AddClubMemberRequest` (Task 2), `Player`/`CreatePlayerRequest`/`UpdatePlayerRequest` (Task 2) are used identically by DTOs (Task 3), `ClubsService` (Tasks 4-5), `ClubsController` (Task 6), and every frontend hook (Tasks 10-12) — no renamed fields across tasks.
- **No placeholders:** every step has literal code; the two deliberate exceptions (Task 10 Step 2's hook-test pattern reused by Tasks 11-12, and Task 13 Step 5's component-test pattern reference) are flagged in Global Constraints as an intentional repetition-avoidance, not an omission — each still names the exact file to produce and the pattern to follow.

---

## Addendum (added after ship): Tasks 17-26 — Teams

**Added:** 2026-08-08, after Tasks 1-16 shipped in PR #22, per a direct request to plan the next module rather than as part of the original scoping conversation. Not yet implemented — checkboxes below are unchecked. Builds on the Clubs module (Tasks 1-16): reuses `JwtAuthGuard`/`ClubRolesGuard`, the `use<Model><Method>`/`setQueryData` frontend conventions, and the just-added modal-for-create-forms pattern (`ClubPlayersPage`'s "Ajouter un joueur" dialog).

**Goal:** let a club `ADMIN` create a `Team` and staff it by picking from that club's existing `ClubMembership` users (no new invite flow) — while keeping the data model ready for a `Team` to eventually be shared by more than one club (CTC/entente), even though the cross-club "link a second club to this team" handshake itself is out of scope here.

### Scope decisions for this addendum

- **"Add some members of the club" = pick, don't invite.** Team membership is populated from the acting club's own member list (the `GET /clubs/:clubId/members` endpoint already built in Task 6) via a dropdown, not a free-text email field. A user must already have a `ClubMembership` in the club the request is scoped to — enforced in `TeamsService`, not at the DB layer.
- **Multi-club is a data-model concern only, for now.** `Team`↔`Club` is a many-to-many via an explicit `TeamClub` join model, not a `clubId` FK on `Team` — so a second club can be linked later without a migration. Creating a team always links it to exactly one club (the one the request is scoped to); the actual "invite club B to co-own this team" flow (needs club B's own admin to consent) is explicitly **not** built here. Note this limitation to the user when this addendum finishes.
- **No new roles.** Anyone who is `ADMIN` of _any_ club linked to a team can create/read/manage that team and its membership — there's no separate "team captain" role. Matches the original plan's "no coach/parent/président/trésorier yet" call; a real role model is the future Volunteer/Role module per `CLAUDE.md`.
- **Every team route stays nested under `/clubs/:clubId/teams/...`, never a bare `/teams/:teamId`.** `ClubRolesGuard` hardcodes `request.params.clubId` (see `server/src/auth/guards/club-roles.guard.ts`) — keeping `:clubId` in every team route means zero guard changes, consistent with Tasks 1-16 reusing rather than extending guard logic. A team's own membership list is still the _shared_ list across all its linked clubs (Step "listMembers" below doesn't filter by `:clubId`) — only the "which club's roster can I pick a new member from" question is club-scoped.
- **Removal isn't gated by "which club added this member."** Any admin of any club linked to the team can remove any team member. Tracking provenance (who was added via which club) is a real future nuance, deliberately not built now.
- **Frontend forms use the modal pattern**, not an always-visible inline form — the lesson from the Players page in this same PR (an always-visible `PlayerCreateForm` was easy to miss; it's now behind an "Ajouter un joueur" dialog). `TeamCreateForm` and `TeamMemberAddForm` are written modal-first from the start.

### File Structure (additions)

```
packages/@basketeasy/types/
  teams.ts                               # new
  package.json                           # modify — add "./teams" export

server/
  prisma/schema.prisma                   # modify — Team, TeamClub, TeamMembership models
  prisma/migrations/<timestamp>_add_teams/migration.sql  # generated
  src/
    app.module.ts                        # modify — register TeamsModule
    teams/
      teams.module.ts                    # new
      teams.controller.ts                # new
      teams.controller.spec.ts           # new
      teams.service.ts                   # new
      teams.service.spec.ts              # new
      dto/
        create-team.dto.ts               # new
        add-team-member.dto.ts           # new

app/
  src/
    App.tsx                              # modify — register 2 new routes
    components/
      AppHeader.tsx                      # modify — add an "Équipes" link per club
    teams/
      queryKeys.ts                       # new
      useTeamCreate.ts (+.test.ts)       # new
      useTeamList.ts                     # new
      useTeamShow.ts                     # new
      useTeamMemberAdd.ts                # new
      useTeamMemberList.ts               # new
      useTeamMemberRemove.ts             # new
      teamErrorMessages.ts               # new
      TeamCreateForm.tsx (+.test.tsx)    # new
      TeamMemberAddForm.tsx (+.test.tsx) # new
    pages/
      ClubTeamsPage.tsx (+.test.tsx)     # new
      TeamMembersPage.tsx (+.test.tsx)   # new
```

---

## Task 17: Prisma schema — `Team`, `TeamClub`, `TeamMembership`

**Files:**

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_add_teams/migration.sql` (generated)

**Interfaces:**

- Produces (Prisma Client, generated): `Team`, `TeamClub`, `TeamMembership`, plus `Club.teams: TeamClub[]` and `User.teamMemberships: TeamMembership[]` back-relations.
- Consumed by: `TeamsService` (Task 20).

- [ ] **Step 1: Edit `schema.prisma`**

Full resulting file:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id              String           @id @default(uuid())
  email           String           @unique
  passwordHash    String
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  memberships     ClubMembership[]
  refreshTokens   RefreshToken[]
  teamMemberships TeamMembership[]
}

model Player {
  id        String   @id @default(uuid())
  firstName String
  lastName  String
  clubId    String
  createdAt DateTime @default(now())
  club      Club     @relation(fields: [clubId], references: [id])

  @@index([clubId])
}

model Club {
  id          String           @id @default(uuid())
  name        String
  createdAt   DateTime         @default(now())
  memberships ClubMembership[]
  players     Player[]
  teams       TeamClub[]
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

  @@index([familyId])
  @@index([userId])
}

model Team {
  id        String           @id @default(uuid())
  name      String
  createdAt DateTime         @default(now())
  clubs     TeamClub[]
  members   TeamMembership[]
}

// Join table, not a single `clubId` FK on Team: a team can end up shared by
// multiple clubs (CTC/entente). Creating a team links it to exactly one
// club to start — see Task 20's createTeam. Linking a second club (the
// actual cross-club handshake) is a later feature this schema doesn't block.
model TeamClub {
  id        String   @id @default(uuid())
  teamId    String
  clubId    String
  createdAt DateTime @default(now())
  team      Team     @relation(fields: [teamId], references: [id])
  club      Club     @relation(fields: [clubId], references: [id])

  @@unique([teamId, clubId])
  @@index([clubId])
}

// A member must already hold a ClubMembership in (at least) one of the
// team's linked clubs — enforced in TeamsService.addMember, not here.
model TeamMembership {
  id        String   @id @default(uuid())
  teamId    String
  userId    String
  createdAt DateTime @default(now())
  team      Team     @relation(fields: [teamId], references: [id])
  user      User     @relation(fields: [userId], references: [id])

  @@unique([teamId, userId])
  @@index([userId])
}
```

- [ ] **Step 2: Start local Postgres**

Run from repo root: `docker compose up -d postgres`
Expected: container reports healthy (`docker compose ps postgres`).

- [ ] **Step 3: Generate the migration**

Run from `server/`:

```bash
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" pnpm exec prisma migrate dev --name add_teams --skip-seed
```

Expected: creates the migration, applies it, "Your database is now in sync with your schema."

- [ ] **Step 4: Regenerate the Prisma client**

Run: `pnpm --filter @basketeasy/server exec prisma generate`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): add Team/TeamClub/TeamMembership models"
```

---

## Task 18: Shared types — teams

**Files:**

- Create: `packages/@basketeasy/types/teams.ts`
- Modify: `packages/@basketeasy/types/package.json`

**Interfaces:**

- Produces: `Team`, `CreateTeamRequest`, `TeamMember`, `AddTeamMemberRequest`.
- Consumed by: `server/src/teams/dto/*.ts` (Task 19), `server/src/teams/teams.service.ts` (Task 20), `server/src/teams/teams.controller.ts` (Task 21), `app/src/teams/*` (Tasks 23-24).

- [ ] **Step 1: Write `teams.ts`**

```typescript
export interface Team {
  id: string;
  name: string;
  clubIds: string[];
  createdAt: string;
}

export interface CreateTeamRequest {
  name: string;
}

export interface TeamMember {
  userId: string;
  email: string;
  addedAt: string;
}

export interface AddTeamMemberRequest {
  userId: string;
}
```

- [ ] **Step 2: Add the export**

Edit `packages/@basketeasy/types/package.json`, add to `"exports"` alongside `"./clubs"`/`"./club-members"`/`"./players"`:

```json
"./teams": {
  "types": "./teams.ts",
  "default": "./teams.ts"
}
```

- [ ] **Step 3: Verify the package still builds**

Run: `pnpm --filter @basketeasy/types build`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/@basketeasy/types/teams.ts packages/@basketeasy/types/package.json
git commit -m "feat(types): add shared team/team-member DTOs"
```

---

## Task 19: Backend DTOs

**Files:**

- Create: `server/src/teams/dto/create-team.dto.ts`
- Create: `server/src/teams/dto/add-team-member.dto.ts`

**Interfaces:**

- Consumes: `CreateTeamRequest`, `AddTeamMemberRequest` from `@basketeasy/types/teams` (Task 18).
- Produces: `CreateTeamDto`, `AddTeamMemberDto` — consumed by `TeamsController` (Task 21).

- [ ] **Step 1: Write `create-team.dto.ts`**

```typescript
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { CreateTeamRequest } from '@basketeasy/types/teams';

export class CreateTeamDto implements CreateTeamRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
```

- [ ] **Step 2: Write `add-team-member.dto.ts`**

`userId` is a `ClubMembership.userId`, always a Prisma-generated UUID — `@IsUUID()` rather than `@IsString()` catches a malformed id before it reaches the DB.

```typescript
import { IsUUID } from 'class-validator';
import type { AddTeamMemberRequest } from '@basketeasy/types/teams';

export class AddTeamMemberDto implements AddTeamMemberRequest {
  @IsUUID()
  userId!: string;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm --filter @basketeasy/server exec tsc --noEmit -p tsconfig.json`
Expected: no errors referencing the new DTO files.

- [ ] **Step 4: Commit**

```bash
git add server/src/teams/dto
git commit -m "feat(server): add team/team-member DTOs"
```

---

## Task 20: TeamsService

**Files:**

- Create: `server/src/teams/teams.service.ts`
- Create: `server/src/teams/teams.service.spec.ts`

**Interfaces:**

- Consumes: `PrismaService` (`prisma.team`, `prisma.clubMembership`, `prisma.teamMembership`).
- Produces: `class TeamsService` with `createTeam(clubId, name)`, `listTeamsForClub(clubId)`, `getTeam(clubId, teamId)`, `addMember(clubId, teamId, userId)`, `listMembers(clubId, teamId)`, `removeMember(clubId, teamId, userId)`. `getTeam`/`addMember`/`listMembers`/`removeMember` all throw `NotFoundException` if `teamId` isn't linked to `clubId` (defense in depth, same shape as `ClubsService.findPlayerInClub`). `addMember` additionally throws `NotFoundException` if `userId` has no `ClubMembership` in `clubId`, and `ConflictException` if already a team member.

- [ ] **Step 1: Write the failing tests**

```typescript
// server/src/teams/teams.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TeamsService', () => {
  let service: TeamsService;
  let prisma: {
    team: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    clubMembership: { findUnique: jest.Mock };
    teamMembership: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      team: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      clubMembership: { findUnique: jest.fn() },
      teamMembership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
  });

  describe('createTeam', () => {
    it('creates a team linked to the acting club', async () => {
      prisma.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'U15 Filles',
        createdAt: new Date('2026-01-01'),
        clubs: [{ clubId: 'club-1' }],
      });

      const result = await service.createTeam('club-1', 'U15 Filles');

      expect(prisma.team.create).toHaveBeenCalledWith({
        data: { name: 'U15 Filles', clubs: { create: { clubId: 'club-1' } } },
        include: { clubs: true },
      });
      expect(result).toEqual({
        id: 'team-1',
        name: 'U15 Filles',
        clubIds: ['club-1'],
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('getTeam', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        name: 'U15 Filles',
        createdAt: new Date('2026-01-01'),
        clubs: [{ clubId: 'other-club' }],
      });

      await expect(service.getTeam('club-1', 'team-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the team does not exist', async () => {
      prisma.team.findUnique.mockResolvedValue(null);

      await expect(service.getTeam('club-1', 'team-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('addMember', () => {
    it('throws NotFoundException when the team is not linked to the club', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        clubs: [{ clubId: 'other-club' }],
      });

      await expect(service.addMember('club-1', 'team-1', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.teamMembership.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user is not a member of the club', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubs: [{ clubId: 'club-1' }] });
      prisma.clubMembership.findUnique.mockResolvedValue(null);

      await expect(service.addMember('club-1', 'team-1', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.teamMembership.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when already a team member', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubs: [{ clubId: 'club-1' }] });
      prisma.clubMembership.findUnique.mockResolvedValue({
        userId: 'user-2',
        user: { email: 'a@b.com' },
      });
      prisma.teamMembership.findUnique.mockResolvedValue({ id: 'membership-1' });

      await expect(service.addMember('club-1', 'team-1', 'user-2')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.teamMembership.create).not.toHaveBeenCalled();
    });

    it('adds the club member to the team', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubs: [{ clubId: 'club-1' }] });
      prisma.clubMembership.findUnique.mockResolvedValue({
        userId: 'user-2',
        user: { email: 'a@b.com' },
      });
      prisma.teamMembership.findUnique.mockResolvedValue(null);
      prisma.teamMembership.create.mockResolvedValue({ createdAt: new Date('2026-01-02') });

      const result = await service.addMember('club-1', 'team-1', 'user-2');

      expect(prisma.teamMembership.create).toHaveBeenCalledWith({
        data: { teamId: 'team-1', userId: 'user-2' },
      });
      expect(result).toEqual({
        userId: 'user-2',
        email: 'a@b.com',
        addedAt: '2026-01-02T00:00:00.000Z',
      });
    });
  });

  describe('removeMember', () => {
    it('throws NotFoundException when there is no such membership', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubs: [{ clubId: 'club-1' }] });
      prisma.teamMembership.findUnique.mockResolvedValue(null);

      await expect(service.removeMember('club-1', 'team-1', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removes the membership', async () => {
      prisma.team.findUnique.mockResolvedValue({ id: 'team-1', clubs: [{ clubId: 'club-1' }] });
      prisma.teamMembership.findUnique.mockResolvedValue({ id: 'membership-1' });
      prisma.teamMembership.delete.mockResolvedValue({});

      await service.removeMember('club-1', 'team-1', 'user-2');

      expect(prisma.teamMembership.delete).toHaveBeenCalledWith({
        where: { teamId_userId: { teamId: 'team-1', userId: 'user-2' } },
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/server test -- teams.service.spec.ts`
Expected: FAIL — `Cannot find module './teams.service'`.

- [ ] **Step 3: Write `teams.service.ts`**

```typescript
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Team } from '@basketeasy/types/teams';
import type { TeamMember } from '@basketeasy/types/teams';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTeam(clubId: string, name: string): Promise<Team> {
    const team = await this.prisma.team.create({
      data: { name, clubs: { create: { clubId } } },
      include: { clubs: true },
    });
    return this.toTeam(team);
  }

  async listTeamsForClub(clubId: string): Promise<Team[]> {
    const teams = await this.prisma.team.findMany({
      where: { clubs: { some: { clubId } } },
      include: { clubs: true },
      orderBy: { createdAt: 'asc' },
    });
    return teams.map((t) => this.toTeam(t));
  }

  async getTeam(clubId: string, teamId: string): Promise<Team> {
    const team = await this.findTeamInClub(clubId, teamId);
    return this.toTeam(team);
  }

  async addMember(clubId: string, teamId: string, userId: string): Promise<TeamMember> {
    await this.findTeamInClub(clubId, teamId);

    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      include: { user: true },
    });
    if (!membership) {
      throw new NotFoundException('User is not a member of this club');
    }

    const existing = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (existing) {
      throw new ConflictException('User is already on this team');
    }

    const teamMembership = await this.prisma.teamMembership.create({
      data: { teamId, userId },
    });

    return {
      userId,
      email: membership.user.email,
      addedAt: teamMembership.createdAt.toISOString(),
    };
  }

  async listMembers(clubId: string, teamId: string): Promise<TeamMember[]> {
    await this.findTeamInClub(clubId, teamId);

    const memberships = await this.prisma.teamMembership.findMany({
      where: { teamId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      addedAt: m.createdAt.toISOString(),
    }));
  }

  async removeMember(clubId: string, teamId: string, userId: string): Promise<void> {
    await this.findTeamInClub(clubId, teamId);

    const membership = await this.prisma.teamMembership.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!membership) {
      throw new NotFoundException('Team membership not found');
    }

    await this.prisma.teamMembership.delete({
      where: { teamId_userId: { teamId, userId } },
    });
  }

  private async findTeamInClub(
    clubId: string,
    teamId: string,
  ): Promise<{ id: string; name: string; createdAt: Date; clubs: { clubId: string }[] }> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { clubs: true },
    });
    if (!team || !team.clubs.some((c) => c.clubId === clubId)) {
      throw new NotFoundException('Team not found');
    }
    return team;
  }

  private toTeam(team: {
    id: string;
    name: string;
    createdAt: Date;
    clubs: { clubId: string }[];
  }): Team {
    return {
      id: team.id,
      name: team.name,
      clubIds: team.clubs.map((c) => c.clubId),
      createdAt: team.createdAt.toISOString(),
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/server test -- teams.service.spec.ts`
Expected: PASS, all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/teams/teams.service.ts server/src/teams/teams.service.spec.ts
git commit -m "feat(server): TeamsService"
```

---

## Task 21: TeamsController

**Files:**

- Create: `server/src/teams/teams.controller.ts`
- Create: `server/src/teams/teams.controller.spec.ts`

**Interfaces:**

- Consumes: `TeamsService` (Task 20), both DTOs (Task 19), `JwtAuthGuard`/`ClubRolesGuard`/`@ClubRoles` from `../auth/*` (existing).
- Produces: the 6 HTTP routes listed below, all nested under `clubs/:clubId/teams` and `@UseGuards(JwtAuthGuard)` at class level — `:clubId` stays present on every route so `ClubRolesGuard` needs no changes (see Addendum's scope decisions above).

| Method | Path                                           | Extra guard                    |
| ------ | ---------------------------------------------- | ------------------------------ |
| POST   | `/clubs/:clubId/teams`                         | `@ClubRoles('ADMIN')`          |
| GET    | `/clubs/:clubId/teams`                         | `@ClubRoles('ADMIN','MEMBER')` |
| GET    | `/clubs/:clubId/teams/:teamId`                 | `@ClubRoles('ADMIN','MEMBER')` |
| POST   | `/clubs/:clubId/teams/:teamId/members`         | `@ClubRoles('ADMIN')`          |
| GET    | `/clubs/:clubId/teams/:teamId/members`         | `@ClubRoles('ADMIN','MEMBER')` |
| DELETE | `/clubs/:clubId/teams/:teamId/members/:userId` | `@ClubRoles('ADMIN')`          |

- [ ] **Step 1: Write the failing tests**

Note: this testing module must call `.overrideGuard(JwtAuthGuard)`/`.overrideGuard(ClubRolesGuard)` — `ClubRolesGuard` depends on `Reflector`/`PrismaService`, which a bare `TestingModule` with only `ClubsService`'s (here `TeamsService`'s) mock provider can't resolve, and `Test.createTestingModule(...).compile()` fails at compile time trying to instantiate it. (This was a real gap discovered and fixed in `clubs.controller.spec.ts` during the original Clubs work — baked in here from the start.)

```typescript
// server/src/teams/teams.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';

describe('TeamsController', () => {
  let controller: TeamsController;
  let service: {
    createTeam: jest.Mock;
    listTeamsForClub: jest.Mock;
    getTeam: jest.Mock;
    addMember: jest.Mock;
    listMembers: jest.Mock;
    removeMember: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createTeam: jest.fn(),
      listTeamsForClub: jest.fn(),
      getTeam: jest.fn(),
      addMember: jest.fn(),
      listMembers: jest.fn(),
      removeMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [{ provide: TeamsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ClubRolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TeamsController>(TeamsController);
  });

  it('createTeam delegates clubId and name', async () => {
    service.createTeam.mockResolvedValue({
      id: 'team-1',
      name: 'U15',
      clubIds: ['club-1'],
      createdAt: 'x',
    });

    const result = await controller.createTeam('club-1', { name: 'U15' });

    expect(service.createTeam).toHaveBeenCalledWith('club-1', 'U15');
    expect(result.id).toBe('team-1');
  });

  it('addMember delegates clubId, teamId, and userId', async () => {
    service.addMember.mockResolvedValue({ userId: 'user-2', email: 'a@b.com', addedAt: 'x' });

    const result = await controller.addMember('club-1', 'team-1', { userId: 'user-2' });

    expect(service.addMember).toHaveBeenCalledWith('club-1', 'team-1', 'user-2');
    expect(result.userId).toBe('user-2');
  });

  it('removeMember delegates clubId, teamId, and userId', async () => {
    service.removeMember.mockResolvedValue(undefined);

    await controller.removeMember('club-1', 'team-1', 'user-2');

    expect(service.removeMember).toHaveBeenCalledWith('club-1', 'team-1', 'user-2');
  });

  it('getTeam delegates clubId and teamId', async () => {
    service.getTeam.mockResolvedValue({
      id: 'team-1',
      name: 'U15',
      clubIds: ['club-1'],
      createdAt: 'x',
    });

    const result = await controller.getTeam('club-1', 'team-1');

    expect(service.getTeam).toHaveBeenCalledWith('club-1', 'team-1');
    expect(result.id).toBe('team-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @basketeasy/server test -- teams.controller.spec.ts`
Expected: FAIL — `Cannot find module './teams.controller'`.

- [ ] **Step 3: Write `teams.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Team, TeamMember } from '@basketeasy/types/teams';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { AddTeamMemberDto } from './dto/add-team-member.dto';

@Controller('clubs/:clubId/teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  createTeam(@Param('clubId') clubId: string, @Body() dto: CreateTeamDto): Promise<Team> {
    return this.teamsService.createTeam(clubId, dto.name);
  }

  @Get()
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listTeams(@Param('clubId') clubId: string): Promise<Team[]> {
    return this.teamsService.listTeamsForClub(clubId);
  }

  @Get(':teamId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  getTeam(@Param('clubId') clubId: string, @Param('teamId') teamId: string): Promise<Team> {
    return this.teamsService.getTeam(clubId, teamId);
  }

  @Post(':teamId/members')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  addMember(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddTeamMemberDto,
  ): Promise<TeamMember> {
    return this.teamsService.addMember(clubId, teamId, dto.userId);
  }

  @Get(':teamId/members')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN', 'MEMBER')
  listMembers(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
  ): Promise<TeamMember[]> {
    return this.teamsService.listMembers(clubId, teamId);
  }

  @Delete(':teamId/members/:userId')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.teamsService.removeMember(clubId, teamId, userId);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @basketeasy/server test -- teams.controller.spec.ts`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/src/teams/teams.controller.ts server/src/teams/teams.controller.spec.ts
git commit -m "feat(server): TeamsController routes"
```

---

## Task 22: TeamsModule + AppModule wiring

**Files:**

- Create: `server/src/teams/teams.module.ts`
- Modify: `server/src/app.module.ts`

- [ ] **Step 1: Write `teams.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [AuthModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
```

- [ ] **Step 2: Register `TeamsModule` in `app.module.ts`**

Add the import and add `TeamsModule` to the `imports` array, after `ClubsModule`:

```typescript
import { TeamsModule } from './teams/teams.module';
// ...
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    HealthModule,
    AuthModule,
    ClubsModule,
    TeamsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Verify the app builds and the full server suite passes**

Run: `DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" JWT_ACCESS_SECRET="test-secret-at-least-32-characters-long" pnpm --filter @basketeasy/server exec nest build`
Then: `pnpm --filter @basketeasy/server test`
Expected: both exit 0 / all suites green (health + auth + clubs + teams).

- [ ] **Step 4: Commit**

```bash
git add server/src/teams/teams.module.ts server/src/app.module.ts
git commit -m "feat(server): wire TeamsModule into AppModule"
```

---

## Task 23: Frontend — teams query keys, hooks, error messages

**Files:**

- Create: `app/src/teams/queryKeys.ts`
- Create: `app/src/teams/useTeamCreate.ts` (+ `.test.ts`, following `useClubCreate.test.ts`'s pattern — Task 10 Step 2 of the original plan)
- Create: `app/src/teams/useTeamList.ts`
- Create: `app/src/teams/useTeamShow.ts`
- Create: `app/src/teams/useTeamMemberAdd.ts`
- Create: `app/src/teams/useTeamMemberList.ts`
- Create: `app/src/teams/useTeamMemberRemove.ts`
- Create: `app/src/teams/teamErrorMessages.ts`

**Interfaces:**

- Produces: `useTeamCreate(clubId)`, `useTeamList(clubId)`, `useTeamShow(clubId, teamId)`, `useTeamMemberAdd(clubId, teamId)`, `useTeamMemberList(clubId, teamId)`, `useTeamMemberRemove(clubId, teamId)`, `getTeamErrorMessage(err)`.
- Consumed by: `TeamCreateForm`/`TeamMemberAddForm` (Task 24), `ClubTeamsPage`/`TeamMembersPage` (Task 25).

- [ ] **Step 1: Write `queryKeys.ts`**

```typescript
export const clubTeamsQueryKey = (clubId: string) => ['clubs', clubId, 'teams'] as const;
export const teamQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId] as const;
export const teamMembersQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'members'] as const;
```

- [ ] **Step 2: Write `useTeamCreate.ts` (+ test)**

```typescript
// app/src/teams/useTeamCreate.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateTeamRequest, Team } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { clubTeamsQueryKey } from './queryKeys';

export function useTeamCreate(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateTeamRequest) => apiClient.post<Team>(`/clubs/${clubId}/teams`, dto),
    onSuccess: (team) => {
      queryClient.setQueryData<Team[]>(clubTeamsQueryKey(clubId), (prev) => [
        ...(prev ?? []),
        team,
      ]);
    },
  });
}
```

Test file follows `useClubCreate.test.ts`'s pattern exactly (assert the POST body, assert the cache write to `['clubs', clubId, 'teams']`).

- [ ] **Step 3: Write `useTeamList.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { Team } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { clubTeamsQueryKey } from './queryKeys';

export function useTeamList(clubId: string) {
  return useQuery({
    queryKey: clubTeamsQueryKey(clubId),
    queryFn: () => apiClient.get<Team[]>(`/clubs/${clubId}/teams`),
  });
}
```

- [ ] **Step 4: Write `useTeamShow.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { Team } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamQueryKey } from './queryKeys';

export function useTeamShow(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<Team>(`/clubs/${clubId}/teams/${teamId}`),
  });
}
```

- [ ] **Step 5: Write `useTeamMemberAdd.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddTeamMemberRequest, TeamMember } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamMembersQueryKey } from './queryKeys';

export function useTeamMemberAdd(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddTeamMemberRequest) =>
      apiClient.post<TeamMember>(`/clubs/${clubId}/teams/${teamId}/members`, dto),
    onSuccess: (member) => {
      queryClient.setQueryData<TeamMember[]>(teamMembersQueryKey(clubId, teamId), (prev) => [
        ...(prev ?? []),
        member,
      ]);
    },
  });
}
```

- [ ] **Step 6: Write `useTeamMemberList.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { TeamMember } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamMembersQueryKey } from './queryKeys';

export function useTeamMemberList(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamMembersQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<TeamMember[]>(`/clubs/${clubId}/teams/${teamId}/members`),
  });
}
```

- [ ] **Step 7: Write `useTeamMemberRemove.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamMember } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamMembersQueryKey } from './queryKeys';

export function useTeamMemberRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/members/${userId}`),
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<TeamMember[]>(teamMembersQueryKey(clubId, teamId), (prev) =>
        (prev ?? []).filter((m) => m.userId !== userId),
      );
    },
  });
}
```

- [ ] **Step 8: Write `teamErrorMessages.ts`**

Own file (not a reuse of `clubErrorMessages.ts`) because the 409 copy is different in the team context — "already on this team" vs. "already a member of this club":

```typescript
import { ApiError } from '../api/client';

const GENERIC_ERROR = 'Une erreur est survenue. Merci de réessayer.';

export function getTeamErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 400:
        return 'Certaines informations saisies sont invalides.';
      case 403:
        return "Vous n'avez pas les droits nécessaires pour cette action.";
      case 404:
        return 'Ressource introuvable.';
      case 409:
        return 'Cette personne fait déjà partie de l’équipe.';
      default:
        return GENERIC_ERROR;
    }
  }
  return GENERIC_ERROR;
}
```

- [ ] **Step 9: Run tests, commit**

```bash
pnpm --filter @basketeasy/app test -- useTeamCreate.test.ts
git add app/src/teams/queryKeys.ts app/src/teams/useTeamCreate.ts app/src/teams/useTeamCreate.test.ts app/src/teams/useTeamList.ts app/src/teams/useTeamShow.ts app/src/teams/useTeamMemberAdd.ts app/src/teams/useTeamMemberList.ts app/src/teams/useTeamMemberRemove.ts app/src/teams/teamErrorMessages.ts
git commit -m "feat(app): team query keys, hooks, and error message mapping"
```

---

## Task 24: Frontend — `TeamCreateForm` (modal) and `TeamMemberAddForm` (club-member picker)

**Files:**

- Create: `app/src/teams/TeamCreateForm.tsx` (+ `.test.tsx`)
- Create: `app/src/teams/TeamMemberAddForm.tsx` (+ `.test.tsx`)

**Interfaces:**

- Consumes: `useTeamCreate`/`useTeamMemberAdd` (Task 23), `useClubMemberList` (existing, Task 11 of the original plan) to populate the member picker, `getTeamErrorMessage` (Task 23), `@basketeasy/ui` components including `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`.
- Consumed by: `ClubTeamsPage`/`TeamMembersPage` (Task 25) inside a `Dialog`, per the modal-first decision in this Addendum.
- Both forms take an optional `onSuccess?: () => void`, called after a successful submit — the page passes `() => setIsOpen(false)` to close the modal, same as `PlayerCreateForm`'s existing `onSuccess` prop.

- [ ] **Step 1: Write `TeamCreateForm.tsx`**

Mirrors `ClubCreateForm.tsx`'s structure, minus the `useNavigate` redirect (team creation stays on the teams list page — there's no dedicated "team just created" page to jump to):

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { useTeamCreate } from './useTeamCreate';
import { getTeamErrorMessage } from './teamErrorMessages';

const teamSchema = z.object({
  name: z.string().min(2, "Le nom de l'équipe doit contenir au moins 2 caractères"),
});

type TeamFormValues = z.infer<typeof teamSchema>;

export function TeamCreateForm({
  clubId,
  onSuccess,
}: {
  clubId: string;
  onSuccess?: () => void;
}) {
  const { mutate: createTeam, isPending } = useTeamCreate(clubId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeamFormValues>({ resolver: zodResolver(teamSchema) });

  const onSubmit = (values: TeamFormValues) => {
    createTeam(values, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
      onError: (err) => setError('root', { message: getTeamErrorMessage(err) }),
    });
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="flex flex-col gap-4"
    >
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <FormField
        label="Nom de l'équipe"
        id="team-name"
        error={errors.name?.message}
        {...register('name')}
      />

      <Button type="submit" disabled={isSubmitting || isPending}>
        Créer
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Write `TeamMemberAddForm.tsx`**

Uses react-hook-form's `Controller` to wire the Radix-based `Select` (a controlled component, unlike `register`-able `<input>`s). Excludes club members already on the team.

```typescript
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@basketeasy/ui/select';
import { useClubMemberList } from '../clubs/useClubMemberList';
import { useTeamMemberAdd } from './useTeamMemberAdd';
import { useTeamMemberList } from './useTeamMemberList';
import { getTeamErrorMessage } from './teamErrorMessages';

const memberSchema = z.object({
  userId: z.string().min(1, 'Choisissez un membre'),
});

type MemberFormValues = z.infer<typeof memberSchema>;

export function TeamMemberAddForm({
  clubId,
  teamId,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  onSuccess?: () => void;
}) {
  const { data: clubMembers } = useClubMemberList(clubId);
  const { data: teamMembers } = useTeamMemberList(clubId, teamId);
  const { mutate: addMember, isPending } = useTeamMemberAdd(clubId, teamId);
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormValues>({ resolver: zodResolver(memberSchema) });

  const teamMemberIds = new Set((teamMembers ?? []).map((m) => m.userId));
  const candidates = (clubMembers ?? []).filter((m) => !teamMemberIds.has(m.userId));

  const onSubmit = (values: MemberFormValues) => {
    addMember(values, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
      onError: (err) => setError('root', { message: getTeamErrorMessage(err) }),
    });
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        void handleSubmit(onSubmit)(e);
      }}
      className="flex flex-col gap-4"
    >
      {errors.root?.message && (
        <Alert variant="destructive">
          <AlertDescription>{errors.root.message}</AlertDescription>
        </Alert>
      )}

      <Controller
        name="userId"
        control={control}
        defaultValue=""
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger aria-label="Membre du club">
              <SelectValue placeholder="Choisir un membre du club" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((member) => (
                <SelectItem key={member.userId} value={member.userId}>
                  {member.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {errors.userId?.message && (
        <p role="alert" className="text-sm text-error">
          {errors.userId.message}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting || isPending || candidates.length === 0}>
        Ajouter à l'équipe
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Write component tests**

`TeamCreateForm.test.tsx` follows `ClubCreateForm.test.tsx`'s pattern (validation error, successful submit calling `onSuccess`, submit-level error on a mocked failure — see `PlayerCreateForm.test.tsx`'s `onSuccess` assertion, added in this same PR, for the exact shape).

`TeamMemberAddForm.test.tsx` follows the same pattern, plus: mock `GET /clubs/:clubId/members` and `GET /clubs/:clubId/teams/:teamId/members` to assert candidates already on the team are excluded from the `Select`'s options.

- [ ] **Step 4: Run tests, commit**

```bash
pnpm --filter @basketeasy/app test -- TeamCreateForm TeamMemberAddForm
git add app/src/teams/TeamCreateForm.tsx app/src/teams/TeamCreateForm.test.tsx app/src/teams/TeamMemberAddForm.tsx app/src/teams/TeamMemberAddForm.test.tsx
git commit -m "feat(app): team create and team-member-add forms"
```

---

## Task 25: Frontend — pages, routing, and nav

**Files:**

- Create: `app/src/pages/ClubTeamsPage.tsx` (+ `.test.tsx`)
- Create: `app/src/pages/TeamMembersPage.tsx` (+ `.test.tsx`)
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/AppHeader.tsx`

**Interfaces:**

- Consumes: forms/hooks from Tasks 23-24, `useIsClubAdmin(clubId)` (existing, added post-ship alongside the Player fixes in this PR) for role-gating — reused as-is since team authorization is club-scoped, not team-scoped.

- [ ] **Step 1: Write `ClubTeamsPage.tsx`**

Lists the club's teams; each team name links to its members page. Create-team behind a modal, same shape as `ClubPlayersPage`'s "Ajouter un joueur" dialog.

```typescript
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@basketeasy/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@basketeasy/ui/dialog';
import { useTeamList } from '../teams/useTeamList';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { TeamCreateForm } from '../teams/TeamCreateForm';

export function ClubTeamsPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { data: teams, isLoading } = useTeamList(clubId!);
  const isAdmin = useIsClubAdmin(clubId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="m-0 text-4xl">Équipes</h1>

        {isAdmin && (
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>Créer une équipe</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer une équipe</DialogTitle>
              </DialogHeader>
              <TeamCreateForm clubId={clubId!} onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p>Chargement...</p>
      ) : teams && teams.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                to={`/clubs/${clubId}/teams/${team.id}/members`}
                className="text-blue-green underline"
              >
                {team.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">Aucune équipe pour le moment.</p>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Write `TeamMembersPage.tsx`**

Mirrors `ClubMembersPage.tsx`'s shape (post-fix version in this PR — table + modal-triggered add form + remove-error surfaced via a local `Alert`, not silently swallowed):

```typescript
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@basketeasy/ui/table';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@basketeasy/ui/dialog';
import { useTeamMemberList } from '../teams/useTeamMemberList';
import { useTeamMemberRemove } from '../teams/useTeamMemberRemove';
import { useIsClubAdmin } from '../clubs/useIsClubAdmin';
import { TeamMemberAddForm } from '../teams/TeamMemberAddForm';
import { getTeamErrorMessage } from '../teams/teamErrorMessages';

export function TeamMembersPage() {
  const { clubId, teamId } = useParams<{ clubId: string; teamId: string }>();
  const { data: members, isLoading } = useTeamMemberList(clubId!, teamId!);
  const { mutate: removeMember } = useTeamMemberRemove(clubId!, teamId!);
  const isAdmin = useIsClubAdmin(clubId);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleRemove = (userId: string) => {
    setRemoveError(null);
    removeMember(userId, { onError: (err) => setRemoveError(getTeamErrorMessage(err)) });
  };

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="m-0 text-4xl">Membres de l'équipe</h1>

        {isAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>Ajouter un membre</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter un membre</DialogTitle>
              </DialogHeader>
              <TeamMemberAddForm
                clubId={clubId!}
                teamId={teamId!}
                onSuccess={() => setIsAddOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {removeError && (
        <Alert variant="destructive">
          <AlertDescription>{removeError}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <p>Chargement...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-mail</TableHead>
              {isAdmin && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members?.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>{member.email}</TableCell>
                {isAdmin && (
                  <TableCell>
                    <Button variant="outline" onClick={() => handleRemove(member.userId)}>
                      Retirer
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Wire routes in `App.tsx`**

Add inside the existing `<Route element={<ProtectedRoute />}>` block, after the players route:

```typescript
<Route path="/clubs/:clubId/teams" element={<ClubTeamsPage />} />
<Route path="/clubs/:clubId/teams/:teamId/members" element={<TeamMembersPage />} />
```

Plus the matching imports at the top of the file.

- [ ] **Step 4: Add an "Équipes" link to `AppHeader.tsx`**

Alongside the existing "Membres"/"Joueurs" buttons in the per-club section:

```typescript
<Button
  variant="ghost"
  className="justify-start"
  onClick={() => go(`/clubs/${club.id}/teams`)}
>
  Équipes
</Button>
```

- [ ] **Step 5: Write page tests**

`ClubTeamsPage.test.tsx`/`TeamMembersPage.test.tsx` follow `ClubPlayersPage.test.tsx`'s pattern exactly (render at a route with a mocked session + MSW, assert admin-only controls appear/don't appear based on `memberships`, assert the modal opens/fills/submits/closes — see `ClubPlayersPage.test.tsx`'s `'opens the add-player form in a modal...'` test, added in this same PR, for the exact shape to copy).

- [ ] **Step 6: Run tests, commit**

```bash
pnpm --filter @basketeasy/app test
git add app/src/pages/ClubTeamsPage.tsx app/src/pages/ClubTeamsPage.test.tsx app/src/pages/TeamMembersPage.tsx app/src/pages/TeamMembersPage.test.tsx app/src/App.tsx app/src/components/AppHeader.tsx
git commit -m "feat(app): team pages, routing, and nav link"
```

---

## Task 26: Manual verification against a running stack

**Files:** none (verification only)

- [ ] **Step 1: Bring up Postgres, apply migrations, start both apps**

```bash
docker compose up -d postgres
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" pnpm --filter @basketeasy/server exec prisma migrate deploy
pnpm dev
```

- [ ] **Step 2: Walkthrough**

1. As an existing club `ADMIN`, open the burger menu → "Équipes" → "Créer une équipe" — create "U15 Filles". Expect it to appear in the list immediately.
2. Open the team → "Ajouter un membre" — expect the picker to only list users who are members of _this_ club, and to exclude anyone already on the team.
3. Add a member — expect them to appear in the team's member list immediately, no manual refresh.
4. Log in as that club's `MEMBER` (non-admin) — expect the teams list and team member list to load (read access), but no "Créer une équipe"/"Ajouter un membre"/"Retirer" controls.
5. As the `MEMBER`, attempt `curl -X POST .../clubs/:id/teams/:teamId/members` directly with their access token — expect `403` (confirms the backend guard, not just the hidden UI, is the real enforcement).
6. Attempt to add a user who is _not_ a member of the club (a raw `curl` with a valid but unrelated `userId`) — expect `404`.
7. Note in the PR description that a team is currently only linked to the one club it was created from — linking a second club (the actual CTC handshake) is schema-ready (`TeamClub` is many-to-many) but not yet exposed in the API or UI.

- [ ] **Step 3:** Note the result of manual verification in the PR description (no commit for this task — verification only).

---

## Self-Review Notes (Addendum)

- **Scope coverage:** team creation linked to the acting club (Task 20), club-member-only team staffing with 404/409 semantics (Task 20), all routes guarded by the existing `JwtAuthGuard`/`ClubRolesGuard` with `:clubId` kept on every route so the guard needs zero changes (Task 21), frontend hooks named `use<Model><Method>` with `setQueryData` cache writes (Task 23), modal-first create/add forms consistent with the Player fix in this same PR (Task 24), role-gating reusing the existing `useIsClubAdmin` hook (Task 25).
- **Explicitly out of scope:** the actual cross-club linking flow (inviting a second club's admin to co-own a team) — the `TeamClub` join model supports it at the schema level, but no endpoint creates a second `TeamClub` row yet; team roles beyond "any admin of a linked club can manage it" (e.g. team captain); tracking which club added which member (affects nothing today since removal isn't club-scoped).
- **Known follow-up:** once cross-club linking ships, `TeamsService.addMember`'s "must be a member of `:clubId`" check will need to become "must be a member of _any_ linked club" if the intent shifts from "each club adds its own members" to "any co-owning club can add anyone already vetted by another linked club" — flagged here rather than guessed at now, since it's a product decision, not just an implementation detail.
