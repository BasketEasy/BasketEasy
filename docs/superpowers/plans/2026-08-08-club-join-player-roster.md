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
