# Team member roles (coach/player) + team-scoped admins Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Implement task by
> task, in order — later tasks depend on earlier ones (schema → types → DTOs → guard →
> service → controller → frontend).

**Goal:** Let a team's roster distinguish coaches from players (`TeamPlayer.role`), and let
club admins delegate day-to-day running of one specific team to one or more users
(`TeamAdmin`) without making them club-wide admins.

**Spec:** [`docs/superpowers/specs/2026-08-10-team-roles-admin-setup-design.md`](../specs/2026-08-10-team-roles-admin-setup-design.md)
— read it first for the full rationale (why CTC ownership actions stay excluded, why
`removeTeamAdmin` has no last-admin guard, the full route/guard table). This plan only
repeats what's needed to implement each task.

**Architecture:** Extends the existing `server/src/teams` module (mirrors its established
patterns: `assertTeamInClub` re-verification, `toX` mapper methods, `@ClubRoles` + guard
pairing) rather than a new module. One new guard (`TeamManagerGuard`) added to
`server/src/auth/guards`, alongside `ClubRolesGuard`, since both `TeamsModule` and
`EventsModule` already import `AuthModule` for DI. Frontend follows `app/src/clubs`'s
one-hook-per-file convention.

**Tech stack:** no new dependencies.

## Global Constraints

- TypeScript strict mode, Prettier, ESLint per package — per root `CLAUDE.md`.
- Jest for `server` (`*.spec.ts`), Vitest + RTL for `app` (`*.test.ts(x)`).
- Shared shapes go in `packages/@basketeasy/types` first, mirrored by backend DTOs.
- Route param naming is load-bearing for guards: `TeamManagerGuard` (like `ClubRolesGuard`)
  reads `request.params.clubId` and `request.params.teamId` — both already present on
  every route this plan touches (`clubs/:clubId/teams/:teamId/...`).
- **CTC ownership stays untouched:** `deleteTeam`, `addTeamClub`, `removeTeamClub` keep
  `@ClubRoles('ADMIN')` + `TeamsService.assertTeamOwner` exactly as-is. Do not swap their
  guard to `TeamManagerGuard` — see spec's "Scope" section for why.
- **Defense in depth is already in place and must stay that way:** `TeamManagerGuard` only
  checks "is this user ADMIN of `:clubId` or a `TeamAdmin` of `:teamId`" — it does **not**
  check that `:teamId` actually belongs to `:clubId`. That's fine because every service
  method it guards already calls `assertTeamInClub(clubId, teamId)` first (existing
  pattern) and throws `NotFoundException` if the team isn't linked to that club. Don't
  remove those `assertTeamInClub` calls when touching a method in this plan.

---

## File Structure

```
server/
  prisma/schema.prisma                         # modify
  prisma/migrations/<ts>_add_team_roles_and_admins/migration.sql  # generated
  src/
    auth/
      auth.module.ts                            # modify — provide/export TeamManagerGuard
      guards/
        team-manager.guard.ts                   # new
        team-manager.guard.spec.ts              # new
    teams/
      teams.service.ts                          # modify
      teams.service.spec.ts                     # modify
      teams.controller.ts                       # modify
      teams.controller.spec.ts                  # modify
      dto/
        add-team-player.dto.ts                  # modify — optional role
        update-team-player.dto.ts               # new
        add-team-admin.dto.ts                   # new
    events/
      events.controller.ts                      # modify — guard swap only

packages/@basketeasy/types/
  teams.ts                                      # modify
  team-admins.ts                                # new
  package.json                                  # modify — add "./team-admins" export

app/
  src/
    clubs/
      queryKeys.ts                              # modify
      teamLabels.ts                             # modify
      useIsTeamManager.ts                       # new
      useTeamAdminList.ts                       # new
      useTeamAdminAdd.ts                        # new
      useTeamAdminRemove.ts                     # new
      TeamAdminAddForm.tsx                      # new
      TeamAdminRow.tsx                          # new
      TeamPlayerAddForm.tsx                     # modify — role select
      TeamPlayerRow.tsx                         # modify — role badge + role change
      TeamPlayerRow.test.tsx                    # new
      useTeamPlayerRoleUpdate.ts                # new
      EventRow.tsx                              # modify — isAdmin → canManage rename
    pages/
      TeamDetailPage.tsx                        # modify — wire canManageTeam + admins section
      TeamDetailPage.test.tsx                   # modify

docs/CLAUDE.md                                  # modify — Teams module section
```

---

## Task 1: Prisma schema — `TeamMemberRole`, `TeamPlayer.role`, `TeamAdmin`

**Files:**

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_add_team_roles_and_admins/migration.sql` (generated)

- [ ] **Step 1: Edit `schema.prisma`**

Add the enum (near `TeamGender`):

```prisma
enum TeamMemberRole {
  COACH
  PLAYER
}
```

Update `TeamPlayer` — add `role`:

```prisma
model TeamPlayer {
  id        String         @id @default(uuid())
  teamId    String
  playerId  String
  role      TeamMemberRole @default(PLAYER)
  createdAt DateTime       @default(now())
  team      Team           @relation(fields: [teamId], references: [id], onDelete: Cascade)
  player    Player         @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@unique([teamId, playerId])
  @@index([playerId])
}
```

Add the new model, right after `TeamPlayer`:

```prisma
// A user granted admin rights scoped to a single team (distinct from
// club-level ClubRole.ADMIN). The first one for a team can only be created
// by a club ADMIN of one of the team's linked clubs; once at least one
// exists, any existing TeamAdmin can add/remove further ones for the same
// team — club ADMINs keep the same power throughout, they don't lose it by
// delegating. See docs/superpowers/specs/2026-08-10-team-roles-admin-setup-design.md.
model TeamAdmin {
  id        String   @id @default(uuid())
  teamId    String
  userId    String
  createdAt DateTime @default(now())
  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
  @@index([userId])
}
```

Add back-relations: `teamAdmins TeamAdmin[]` to both `model Team` and `model User`.

- [ ] **Step 2: Start local Postgres**

```bash
docker compose up -d postgres
docker compose ps postgres   # expect healthy
```

- [ ] **Step 3: Generate + apply the migration**

```bash
cd server
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" pnpm exec prisma migrate dev --name add_team_roles_and_admins --skip-seed
```

- [ ] **Step 4: Regenerate the Prisma client**

```bash
pnpm --filter @basketeasy/server exec prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): add TeamPlayer.role and TeamAdmin to schema"
```

---

## Task 2: Shared types

**Files:**

- Modify: `packages/@basketeasy/types/teams.ts`
- Create: `packages/@basketeasy/types/team-admins.ts`
- Modify: `packages/@basketeasy/types/package.json`

- [ ] **Step 1: Edit `teams.ts`**

Add near the top:

```typescript
export type TeamMemberRole = 'COACH' | 'PLAYER';
```

Update `TeamPlayer` and `AddTeamPlayerRequest`, and add `UpdateTeamPlayerRequest`:

```typescript
export interface TeamPlayer {
  id: string;
  teamId: string;
  playerId: string;
  firstName: string;
  lastName: string;
  clubId: string;
  role: TeamMemberRole;
  createdAt: string;
}

export interface AddTeamPlayerRequest {
  playerId: string;
  role?: TeamMemberRole;
}

export interface UpdateTeamPlayerRequest {
  role: TeamMemberRole;
}
```

- [ ] **Step 2: Write `team-admins.ts`**

```typescript
export interface TeamAdmin {
  userId: string;
  email: string;
  teamId: string;
  createdAt: string;
}

export interface AddTeamAdminRequest {
  email: string;
}
```

- [ ] **Step 3: Add the export**

Edit `packages/@basketeasy/types/package.json`, add to `"exports"`:

```json
"./team-admins": {
  "types": "./team-admins.ts",
  "default": "./team-admins.ts"
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter @basketeasy/types build
git add packages/@basketeasy/types/teams.ts packages/@basketeasy/types/team-admins.ts packages/@basketeasy/types/package.json
git commit -m "feat(types): add TeamMemberRole and TeamAdmin DTOs"
```

---

## Task 3: Backend DTOs

**Files:**

- Modify: `server/src/teams/dto/add-team-player.dto.ts`
- Create: `server/src/teams/dto/update-team-player.dto.ts`
- Create: `server/src/teams/dto/add-team-admin.dto.ts`

- [ ] **Step 1: Update `add-team-player.dto.ts`**

```typescript
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TeamMemberRole } from '@prisma/client';
import type { AddTeamPlayerRequest } from '@basketeasy/types/teams';

export class AddTeamPlayerDto implements AddTeamPlayerRequest {
  @IsUUID()
  playerId!: string;

  @IsOptional()
  @IsEnum(TeamMemberRole)
  role?: TeamMemberRole;
}
```

- [ ] **Step 2: Write `update-team-player.dto.ts`**

```typescript
import { IsEnum } from 'class-validator';
import { TeamMemberRole } from '@prisma/client';
import type { UpdateTeamPlayerRequest } from '@basketeasy/types/teams';

export class UpdateTeamPlayerDto implements UpdateTeamPlayerRequest {
  @IsEnum(TeamMemberRole)
  role!: TeamMemberRole;
}
```

- [ ] **Step 3: Write `add-team-admin.dto.ts`**

```typescript
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import type { AddTeamAdminRequest } from '@basketeasy/types/team-admins';

export class AddTeamAdminDto implements AddTeamAdminRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email!: string;
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm --filter @basketeasy/server exec tsc --noEmit -p tsconfig.json
git add server/src/teams/dto
git commit -m "feat(server): add role/team-admin DTOs"
```

---

## Task 4: `TeamManagerGuard`

**Files:**

- Create: `server/src/auth/guards/team-manager.guard.ts`
- Create: `server/src/auth/guards/team-manager.guard.spec.ts`
- Modify: `server/src/auth/auth.module.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// server/src/auth/guards/team-manager.guard.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TeamManagerGuard } from './team-manager.guard';
import { PrismaService } from '../../prisma/prisma.service';

function buildContext(
  user: { id: string } | undefined,
  clubId: string | undefined,
  teamId: string | undefined,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, params: { clubId, teamId } }),
    }),
  } as unknown as ExecutionContext;
}

describe('TeamManagerGuard', () => {
  let guard: TeamManagerGuard;
  let prisma: {
    clubMembership: { findUnique: jest.Mock };
    teamAdmin: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      clubMembership: { findUnique: jest.fn() },
      teamAdmin: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamManagerGuard, { provide: PrismaService, useValue: prisma }],
    }).compile();

    guard = module.get<TeamManagerGuard>(TeamManagerGuard);
  });

  it('allows a club ADMIN of :clubId', async () => {
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'ADMIN' });

    const result = await guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', 'team-1'));

    expect(result).toBe(true);
    expect(prisma.teamAdmin.findUnique).not.toHaveBeenCalled();
  });

  it('allows a TeamAdmin of :teamId who is not a club ADMIN', async () => {
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prisma.teamAdmin.findUnique.mockResolvedValue({ id: 'ta-1' });

    const result = await guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', 'team-1'));

    expect(result).toBe(true);
    expect(prisma.teamAdmin.findUnique).toHaveBeenCalledWith({
      where: { teamId_userId: { teamId: 'team-1', userId: 'user-1' } },
    });
  });

  it('denies a club MEMBER who is not a TeamAdmin', async () => {
    prisma.clubMembership.findUnique.mockResolvedValue({ role: 'MEMBER' });
    prisma.teamAdmin.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', 'team-1')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies with ForbiddenException when there is no authenticated user', async () => {
    await expect(guard.canActivate(buildContext(undefined, 'club-1', 'team-1'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.clubMembership.findUnique).not.toHaveBeenCalled();
  });

  it('denies with ForbiddenException when the route has no teamId param', async () => {
    await expect(
      guard.canActivate(buildContext({ id: 'user-1' }, 'club-1', undefined)),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.clubMembership.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @basketeasy/server test -- team-manager.guard.spec.ts
```

Expected: FAIL — `Cannot find module './team-manager.guard'`.

- [ ] **Step 3: Write `team-manager.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Grants access to a team's day-to-day management routes (roster, roster
 * roles, team-admin assignment, events) to either a club ADMIN of the
 * route's :clubId or a user holding a TeamAdmin row for the route's :teamId.
 *
 * Unlike ClubRolesGuard this isn't metadata-driven (no @TeamRoles decorator)
 * — every route it's applied to requires the same "manager" check, so it's
 * applied directly via @UseGuards(TeamManagerGuard).
 *
 * Does NOT verify :teamId actually belongs to :clubId — the service method
 * behind the route re-verifies that via assertTeamInClub, same
 * defense-in-depth split ClubRolesGuard already relies on.
 *
 * Must run after JwtAuthGuard, and only on routes with both :clubId and
 * :teamId params.
 */
@Injectable()
export class TeamManagerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;
    const clubId: string | undefined = request.params?.clubId;
    const teamId: string | undefined = request.params?.teamId;

    if (!userId || !clubId || !teamId) {
      throw new ForbiddenException('Insufficient team role');
    }

    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (membership?.role === 'ADMIN') {
      return true;
    }

    const teamAdmin = await this.prisma.teamAdmin.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (teamAdmin) {
      return true;
    }

    throw new ForbiddenException('Insufficient team role');
  }
}
```

- [ ] **Step 4: Wire into `auth.module.ts`**

```typescript
import { TeamManagerGuard } from './guards/team-manager.guard';
// ...
@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, ClubRolesGuard, TeamManagerGuard],
  exports: [JwtAuthGuard, ClubRolesGuard, TeamManagerGuard],
})
export class AuthModule {}
```

- [ ] **Step 5: Run tests to verify they pass, then commit**

```bash
pnpm --filter @basketeasy/server test -- team-manager.guard.spec.ts
git add server/src/auth/guards/team-manager.guard.ts server/src/auth/guards/team-manager.guard.spec.ts server/src/auth/auth.module.ts
git commit -m "feat(server): add TeamManagerGuard"
```

---

## Task 5: `TeamsService` — role support + team-admin methods

**Files:**

- Modify: `server/src/teams/teams.service.ts`
- Modify: `server/src/teams/teams.service.spec.ts`

- [ ] **Step 1: Extend the test file's prisma mock**

In `teams.service.spec.ts`, add to the `prisma` object built in `beforeEach`:

```typescript
user: { findUnique: jest.fn() },
clubMembership: { findFirst: jest.fn() },
teamAdmin: {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
},
```

(and add matching entries to the `prisma:` type annotation above `beforeEach`.)

- [ ] **Step 2: Add failing tests**

Append inside `describe('TeamsService', ...)`:

```typescript
describe('addTeamPlayer role', () => {
  it('defaults role to PLAYER when not given', async () => {
    prisma.clubTeam.findUnique
      .mockResolvedValueOnce({ isOwner: true }) // assertTeamInClub
      .mockResolvedValueOnce({ clubId: 'club-1', teamId: 'team-1' }); // player's club link check
    prisma.player.findUnique.mockResolvedValue({
      id: 'p1',
      clubId: 'club-1',
      firstName: 'A',
      lastName: 'B',
    });
    prisma.teamPlayer.create.mockResolvedValue({
      id: 'tp1',
      teamId: 'team-1',
      playerId: 'p1',
      role: 'PLAYER',
      createdAt: new Date('2026-01-01'),
      player: { firstName: 'A', lastName: 'B', clubId: 'club-1' },
    });

    await service.addTeamPlayer('club-1', 'team-1', 'p1');

    expect(prisma.teamPlayer.create).toHaveBeenCalledWith({
      data: { teamId: 'team-1', playerId: 'p1', role: 'PLAYER' },
      include: { player: true },
    });
  });

  it('passes an explicit role through', async () => {
    prisma.clubTeam.findUnique
      .mockResolvedValueOnce({ isOwner: true })
      .mockResolvedValueOnce({ clubId: 'club-1', teamId: 'team-1' });
    prisma.player.findUnique.mockResolvedValue({
      id: 'p1',
      clubId: 'club-1',
      firstName: 'A',
      lastName: 'B',
    });
    prisma.teamPlayer.create.mockResolvedValue({
      id: 'tp1',
      teamId: 'team-1',
      playerId: 'p1',
      role: 'COACH',
      createdAt: new Date('2026-01-01'),
      player: { firstName: 'A', lastName: 'B', clubId: 'club-1' },
    });

    const result = await service.addTeamPlayer('club-1', 'team-1', 'p1', 'COACH');

    expect(prisma.teamPlayer.create).toHaveBeenCalledWith({
      data: { teamId: 'team-1', playerId: 'p1', role: 'COACH' },
      include: { player: true },
    });
    expect(result.role).toBe('COACH');
  });
});

describe('updateTeamPlayerRole', () => {
  it('throws NotFoundException when the player is not on the team', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue({ clubId: 'club-1', teamId: 'team-1' });
    prisma.teamPlayer.findUnique.mockResolvedValue(null);

    await expect(service.updateTeamPlayerRole('club-1', 'team-1', 'p1', 'COACH')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.teamPlayer.update).not.toHaveBeenCalled();
  });

  it('updates the role', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue({ clubId: 'club-1', teamId: 'team-1' });
    prisma.teamPlayer.findUnique.mockResolvedValue({ id: 'tp1', teamId: 'team-1', playerId: 'p1' });
    prisma.teamPlayer.update.mockResolvedValue({
      id: 'tp1',
      teamId: 'team-1',
      playerId: 'p1',
      role: 'COACH',
      createdAt: new Date('2026-01-01'),
      player: { firstName: 'A', lastName: 'B', clubId: 'club-1' },
    });

    const result = await service.updateTeamPlayerRole('club-1', 'team-1', 'p1', 'COACH');

    expect(prisma.teamPlayer.update).toHaveBeenCalledWith({
      where: { id: 'tp1' },
      data: { role: 'COACH' },
      include: { player: true },
    });
    expect(result.role).toBe('COACH');
  });
});

describe('team admins', () => {
  it('lists team admins', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue({ clubId: 'club-1', teamId: 'team-1' });
    prisma.teamAdmin.findMany.mockResolvedValue([
      {
        userId: 'u1',
        teamId: 'team-1',
        createdAt: new Date('2026-01-01'),
        user: { email: 'a@b.com' },
      },
    ]);

    const result = await service.listTeamAdmins('club-1', 'team-1');

    expect(result).toEqual([
      { userId: 'u1', email: 'a@b.com', teamId: 'team-1', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  it('addTeamAdmin throws NotFoundException when no user has that email', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue({ clubId: 'club-1', teamId: 'team-1' });
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.addTeamAdmin('club-1', 'team-1', 'nobody@example.com')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.teamAdmin.create).not.toHaveBeenCalled();
  });

  it('addTeamAdmin throws BadRequestException when the user is not in a linked club', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue({ clubId: 'club-1', teamId: 'team-1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'a@b.com' });
    prisma.clubMembership.findFirst.mockResolvedValue(null);

    await expect(service.addTeamAdmin('club-1', 'team-1', 'a@b.com')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.teamAdmin.create).not.toHaveBeenCalled();
  });

  it('addTeamAdmin throws ConflictException when already a TeamAdmin', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue({ clubId: 'club-1', teamId: 'team-1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'a@b.com' });
    prisma.clubMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.teamAdmin.findUnique.mockResolvedValue({ id: 'ta1' });

    await expect(service.addTeamAdmin('club-1', 'team-1', 'a@b.com')).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.teamAdmin.create).not.toHaveBeenCalled();
  });

  it('addTeamAdmin creates the grant', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue({ clubId: 'club-1', teamId: 'team-1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', email: 'a@b.com' });
    prisma.clubMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.teamAdmin.findUnique.mockResolvedValue(null);
    prisma.teamAdmin.create.mockResolvedValue({
      userId: 'u2',
      teamId: 'team-1',
      createdAt: new Date('2026-01-02'),
      user: { email: 'a@b.com' },
    });

    const result = await service.addTeamAdmin('club-1', 'team-1', 'a@b.com');

    expect(prisma.teamAdmin.create).toHaveBeenCalledWith({
      data: { teamId: 'team-1', userId: 'u2' },
      include: { user: true },
    });
    expect(result.userId).toBe('u2');
  });

  it('removeTeamAdmin throws NotFoundException when there is no such grant', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue({ clubId: 'club-1', teamId: 'team-1' });
    prisma.teamAdmin.findUnique.mockResolvedValue(null);

    await expect(service.removeTeamAdmin('club-1', 'team-1', 'u2')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('removeTeamAdmin deletes the grant', async () => {
    prisma.clubTeam.findUnique.mockResolvedValue({ clubId: 'club-1', teamId: 'team-1' });
    prisma.teamAdmin.findUnique.mockResolvedValue({ id: 'ta1', userId: 'u2', teamId: 'team-1' });
    prisma.teamAdmin.delete.mockResolvedValue({});

    await service.removeTeamAdmin('club-1', 'team-1', 'u2');

    expect(prisma.teamAdmin.delete).toHaveBeenCalledWith({ where: { id: 'ta1' } });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter @basketeasy/server test -- teams.service.spec.ts
```

- [ ] **Step 4: Update `teams.service.ts`**

Add imports:

```typescript
import { TeamMemberRole } from '@prisma/client';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
```

Change `addTeamPlayer`'s signature and the `create` call:

```typescript
async addTeamPlayer(
  clubId: string,
  teamId: string,
  playerId: string,
  role: TeamMemberRole = 'PLAYER',
): Promise<TeamPlayer> {
  await this.assertTeamInClub(clubId, teamId);

  const player = await this.prisma.player.findUnique({ where: { id: playerId } });
  if (!player) {
    throw new NotFoundException('Player not found');
  }

  const playerClubLinked = await this.prisma.clubTeam.findUnique({
    where: { clubId_teamId: { clubId: player.clubId, teamId } },
  });
  if (!playerClubLinked) {
    throw new BadRequestException('Le joueur doit appartenir à un club associé à cette équipe');
  }

  try {
    const teamPlayer = await this.prisma.teamPlayer.create({
      data: { teamId, playerId, role },
      include: { player: true },
    });
    return this.toTeamPlayer(teamPlayer);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      throw new ConflictException("Ce joueur fait déjà partie de l'effectif");
    }
    throw err;
  }
}
```

Add, right after `addTeamPlayer`:

```typescript
async updateTeamPlayerRole(
  clubId: string,
  teamId: string,
  playerId: string,
  role: TeamMemberRole,
): Promise<TeamPlayer> {
  await this.assertTeamInClub(clubId, teamId);

  const teamPlayer = await this.prisma.teamPlayer.findUnique({
    where: { teamId_playerId: { teamId, playerId } },
  });
  if (!teamPlayer) {
    throw new NotFoundException('Player not found on this team');
  }

  const updated = await this.prisma.teamPlayer.update({
    where: { id: teamPlayer.id },
    data: { role },
    include: { player: true },
  });
  return this.toTeamPlayer(updated);
}
```

Add, after `removeTeamPlayer` (before the `private` helpers):

```typescript
async listTeamAdmins(clubId: string, teamId: string): Promise<TeamAdmin[]> {
  await this.assertTeamInClub(clubId, teamId);
  const teamAdmins = await this.prisma.teamAdmin.findMany({
    where: { teamId },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
  return teamAdmins.map((ta) => this.toTeamAdmin(ta));
}

async addTeamAdmin(clubId: string, teamId: string, email: string): Promise<TeamAdmin> {
  await this.assertTeamInClub(clubId, teamId);

  const user = await this.prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new NotFoundException('No account with that email');
  }

  const membership = await this.prisma.clubMembership.findFirst({
    where: { userId: user.id, club: { clubTeams: { some: { teamId } } } },
  });
  if (!membership) {
    throw new BadRequestException(
      "L'utilisateur doit être membre d'un club associé à cette équipe",
    );
  }

  const existing = await this.prisma.teamAdmin.findUnique({
    where: { teamId_userId: { teamId, userId: user.id } },
  });
  if (existing) {
    throw new ConflictException('Cet utilisateur est déjà administrateur de cette équipe');
  }

  const teamAdmin = await this.prisma.teamAdmin.create({
    data: { teamId, userId: user.id },
    include: { user: true },
  });
  return this.toTeamAdmin(teamAdmin);
}

async removeTeamAdmin(clubId: string, teamId: string, userId: string): Promise<void> {
  await this.assertTeamInClub(clubId, teamId);

  const teamAdmin = await this.prisma.teamAdmin.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!teamAdmin) {
    throw new NotFoundException('Team admin not found');
  }

  await this.prisma.teamAdmin.delete({ where: { id: teamAdmin.id } });
}
```

Update `toTeamPlayer` to map `role`, and add a `toTeamAdmin` mapper next to the other
`private toX` helpers:

```typescript
private toTeamPlayer(teamPlayer: {
  id: string;
  teamId: string;
  playerId: string;
  role: TeamMemberRole;
  createdAt: Date;
  player: { firstName: string; lastName: string; clubId: string };
}): TeamPlayer {
  return {
    id: teamPlayer.id,
    teamId: teamPlayer.teamId,
    playerId: teamPlayer.playerId,
    firstName: teamPlayer.player.firstName,
    lastName: teamPlayer.player.lastName,
    clubId: teamPlayer.player.clubId,
    role: teamPlayer.role,
    createdAt: teamPlayer.createdAt.toISOString(),
  };
}

private toTeamAdmin(teamAdmin: {
  userId: string;
  teamId: string;
  createdAt: Date;
  user: { email: string };
}): TeamAdmin {
  return {
    userId: teamAdmin.userId,
    email: teamAdmin.user.email,
    teamId: teamAdmin.teamId,
    createdAt: teamAdmin.createdAt.toISOString(),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass, then commit**

```bash
pnpm --filter @basketeasy/server test -- teams.service.spec.ts
git add server/src/teams/teams.service.ts server/src/teams/teams.service.spec.ts
git commit -m "feat(server): TeamsService role support and team-admin management"
```

---

## Task 6: `TeamsController` — wire new/changed routes

**Files:**

- Modify: `server/src/teams/teams.controller.ts`
- Modify: `server/src/teams/teams.controller.spec.ts`

- [ ] **Step 1: Extend the controller spec's service mock**

Add to the `service` mock object: `updateTeamPlayerRole: jest.fn()`, `listTeamAdmins: jest.fn()`,
`addTeamAdmin: jest.fn()`, `removeTeamAdmin: jest.fn()`.

Add tests:

```typescript
it('updateTeamPlayerRole delegates clubId, teamId, playerId, role', async () => {
  service.updateTeamPlayerRole.mockResolvedValue({
    id: 'tp1',
    teamId: 'team-1',
    playerId: 'p1',
    role: 'COACH',
    firstName: 'A',
    lastName: 'B',
    clubId: 'club-1',
    createdAt: 'x',
  });

  const result = await controller.updateTeamPlayerRole('club-1', 'team-1', 'p1', {
    role: 'COACH',
  });

  expect(service.updateTeamPlayerRole).toHaveBeenCalledWith('club-1', 'team-1', 'p1', 'COACH');
  expect(result.role).toBe('COACH');
});

it('addTeamAdmin delegates clubId, teamId, email', async () => {
  service.addTeamAdmin.mockResolvedValue({
    userId: 'u2',
    email: 'a@b.com',
    teamId: 'team-1',
    createdAt: 'x',
  });

  const result = await controller.addTeamAdmin('club-1', 'team-1', { email: 'a@b.com' });

  expect(service.addTeamAdmin).toHaveBeenCalledWith('club-1', 'team-1', 'a@b.com');
  expect(result.userId).toBe('u2');
});

it('removeTeamAdmin delegates clubId, teamId, userId', async () => {
  service.removeTeamAdmin.mockResolvedValue(undefined);

  await controller.removeTeamAdmin('club-1', 'team-1', 'u2');

  expect(service.removeTeamAdmin).toHaveBeenCalledWith('club-1', 'team-1', 'u2');
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
pnpm --filter @basketeasy/server test -- teams.controller.spec.ts
```

- [ ] **Step 3: Update `teams.controller.ts`**

Add imports:

```typescript
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
import { UpdateTeamPlayerDto } from './dto/update-team-player.dto';
import { AddTeamAdminDto } from './dto/add-team-admin.dto';
```

Swap the guard on `updateTeam`, `addTeamPlayer`, `removeTeamPlayer` from
`@UseGuards(ClubRolesGuard)` + `@ClubRoles('ADMIN')` to `@UseGuards(TeamManagerGuard)` (three
separate one-line edits — the method bodies don't change except `addTeamPlayer` now passes
`dto.role`):

```typescript
@Patch(':teamId')
@UseGuards(TeamManagerGuard)
updateTeam(...): Promise<Team> { ... }   // body unchanged

@Post(':teamId/players')
@UseGuards(TeamManagerGuard)
addTeamPlayer(
  @Param('clubId') clubId: string,
  @Param('teamId') teamId: string,
  @Body() dto: AddTeamPlayerDto,
): Promise<TeamPlayer> {
  return this.teamsService.addTeamPlayer(clubId, teamId, dto.playerId, dto.role);
}

@Delete(':teamId/players/:playerId')
@UseGuards(TeamManagerGuard)
@HttpCode(HttpStatus.NO_CONTENT)
removeTeamPlayer(...): Promise<void> { ... }   // body unchanged
```

Leave `deleteTeam`, `addTeamClub`, `removeTeamClub` exactly as they are
(`@UseGuards(ClubRolesGuard)` + `@ClubRoles('ADMIN')`) — see Global Constraints.

Add, after `removeTeamPlayer`:

```typescript
@Patch(':teamId/players/:playerId')
@UseGuards(TeamManagerGuard)
updateTeamPlayerRole(
  @Param('clubId') clubId: string,
  @Param('teamId') teamId: string,
  @Param('playerId') playerId: string,
  @Body() dto: UpdateTeamPlayerDto,
): Promise<TeamPlayer> {
  return this.teamsService.updateTeamPlayerRole(clubId, teamId, playerId, dto.role);
}

@Get(':teamId/admins')
@UseGuards(ClubRolesGuard)
@ClubRoles('ADMIN', 'MEMBER')
listTeamAdmins(
  @Param('clubId') clubId: string,
  @Param('teamId') teamId: string,
): Promise<TeamAdmin[]> {
  return this.teamsService.listTeamAdmins(clubId, teamId);
}

@Post(':teamId/admins')
@UseGuards(TeamManagerGuard)
addTeamAdmin(
  @Param('clubId') clubId: string,
  @Param('teamId') teamId: string,
  @Body() dto: AddTeamAdminDto,
): Promise<TeamAdmin> {
  return this.teamsService.addTeamAdmin(clubId, teamId, dto.email);
}

@Delete(':teamId/admins/:userId')
@UseGuards(TeamManagerGuard)
@HttpCode(HttpStatus.NO_CONTENT)
removeTeamAdmin(
  @Param('clubId') clubId: string,
  @Param('teamId') teamId: string,
  @Param('userId') userId: string,
): Promise<void> {
  return this.teamsService.removeTeamAdmin(clubId, teamId, userId);
}
```

- [ ] **Step 4: Run tests to verify they pass, then commit**

```bash
pnpm --filter @basketeasy/server test -- teams.controller.spec.ts
git add server/src/teams/teams.controller.ts server/src/teams/teams.controller.spec.ts
git commit -m "feat(server): wire team-player-role and team-admin routes"
```

---

## Task 7: `EventsController` — guard swap

**Files:**

- Modify: `server/src/events/events.controller.ts`

Events don't get new routes — only the three mutating routes move from club-ADMIN-only to
`TeamManagerGuard`, so a team admin can run a team's calendar without club-wide admin.

- [ ] **Step 1: Update the controller**

```typescript
import { TeamManagerGuard } from '../auth/guards/team-manager.guard';
```

On `createEvent`, `updateEvent`, `deleteEvent`: replace `@UseGuards(ClubRolesGuard)` +
`@ClubRoles('ADMIN')` with `@UseGuards(TeamManagerGuard)`. Leave `listEvents` unchanged
(`@ClubRoles('ADMIN', 'MEMBER')`) — its imports of `ClubRolesGuard`/`ClubRoles` stay, since
`listEvents` still uses both.

- [ ] **Step 2: Run the existing event tests (should still pass unchanged — controller specs test delegation, not guard wiring) and the full server suite**

```bash
pnpm --filter @basketeasy/server test
```

- [ ] **Step 3: Commit**

```bash
git add server/src/events/events.controller.ts
git commit -m "feat(server): let team admins manage a team's events"
```

---

## Task 8: Frontend — query keys + labels

**Files:**

- Modify: `app/src/clubs/queryKeys.ts`
- Modify: `app/src/clubs/teamLabels.ts`

- [ ] **Step 1: Add to `queryKeys.ts`**

```typescript
export const teamAdminsQueryKey = (clubId: string, teamId: string) =>
  ['clubs', clubId, 'teams', teamId, 'admins'] as const;
```

- [ ] **Step 2: Add to `teamLabels.ts`**

```typescript
import type { TeamCategory, TeamGender, TeamMemberRole } from '@basketeasy/types/teams';

export const TEAM_MEMBER_ROLE_OPTIONS: { value: TeamMemberRole; label: string }[] = [
  { value: 'PLAYER', label: 'Joueur' },
  { value: 'COACH', label: 'Entraîneur' },
];

const teamMemberRoleLabels = new Map(TEAM_MEMBER_ROLE_OPTIONS.map((o) => [o.value, o.label]));

export function teamMemberRoleLabel(role: TeamMemberRole): string {
  return teamMemberRoleLabels.get(role) ?? role;
}
```

(Update the existing `import type { TeamCategory, TeamGender }` line to include
`TeamMemberRole` rather than adding a second import.)

- [ ] **Step 3: Commit**

```bash
git add app/src/clubs/queryKeys.ts app/src/clubs/teamLabels.ts
git commit -m "feat(app): add team-admin query key and role labels"
```

---

## Task 9: Frontend — team-admin hooks + `useIsTeamManager`

**Files:**

- Create: `app/src/clubs/useTeamAdminList.ts`
- Create: `app/src/clubs/useTeamAdminAdd.ts`
- Create: `app/src/clubs/useTeamAdminRemove.ts`
- Create: `app/src/clubs/useIsTeamManager.ts`

- [ ] **Step 1: `useTeamAdminList.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { teamAdminsQueryKey } from './queryKeys';

export function useTeamAdminList(clubId: string, teamId: string) {
  return useQuery({
    queryKey: teamAdminsQueryKey(clubId, teamId),
    queryFn: () => apiClient.get<TeamAdmin[]>(`/clubs/${clubId}/teams/${teamId}/admins`),
  });
}
```

- [ ] **Step 2: `useTeamAdminAdd.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddTeamAdminRequest, TeamAdmin } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { teamAdminsQueryKey } from './queryKeys';

export function useTeamAdminAdd(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: AddTeamAdminRequest) =>
      apiClient.post<TeamAdmin>(`/clubs/${clubId}/teams/${teamId}/admins`, dto),
    onSuccess: (teamAdmin) => {
      queryClient.setQueryData<TeamAdmin[]>(teamAdminsQueryKey(clubId, teamId), (prev) => [
        ...(prev ?? []),
        teamAdmin,
      ]);
    },
  });
}
```

- [ ] **Step 3: `useTeamAdminRemove.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { apiClient } from '../api/client';
import { teamAdminsQueryKey } from './queryKeys';

export function useTeamAdminRemove(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete(`/clubs/${clubId}/teams/${teamId}/admins/${userId}`),
    onSuccess: (_data, userId) => {
      queryClient.setQueryData<TeamAdmin[]>(teamAdminsQueryKey(clubId, teamId), (prev) =>
        (prev ?? []).filter((a) => a.userId !== userId),
      );
    },
  });
}
```

- [ ] **Step 4: `useIsTeamManager.ts`**

Mirrors `useIsClubAdmin.ts` but also checks the team-admins list — the frontend-only "should
I show manage controls" signal; the backend `TeamManagerGuard` is the real enforcement, same
split already documented for `useIsClubAdmin` in
`docs/superpowers/plans/2026-08-08-club-join-player-roster.md`.

```typescript
import { useAccount } from '../auth/useAccount';
import { useIsClubAdmin } from './useIsClubAdmin';
import { useTeamAdminList } from './useTeamAdminList';

export function useIsTeamManager(clubId: string, teamId: string): boolean {
  const { user } = useAccount();
  const isClubAdmin = useIsClubAdmin(clubId);
  const { data: teamAdmins } = useTeamAdminList(clubId, teamId);

  if (isClubAdmin) {
    return true;
  }
  return teamAdmins?.some((admin) => admin.userId === user?.id) ?? false;
}
```

- [ ] **Step 5: Commit**

```bash
git add app/src/clubs/useTeamAdminList.ts app/src/clubs/useTeamAdminAdd.ts app/src/clubs/useTeamAdminRemove.ts app/src/clubs/useIsTeamManager.ts
git commit -m "feat(app): team-admin hooks and useIsTeamManager"
```

---

## Task 10: Frontend — `TeamAdminAddForm`, `TeamAdminRow`

**Files:**

- Create: `app/src/clubs/TeamAdminAddForm.tsx`
- Create: `app/src/clubs/TeamAdminRow.tsx`

- [ ] **Step 1: `TeamAdminAddForm.tsx`** (mirrors `ClubMemberAddForm.tsx` — email lookup, 404 →
      friendly message)

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { FormField } from '@basketeasy/ui/form-field';
import { ApiError } from '../api/client';
import { useTeamAdminAdd } from './useTeamAdminAdd';
import { getClubErrorMessage } from './clubErrorMessages';

const teamAdminSchema = z.object({
  email: z.string().email('Adresse e-mail invalide'),
});

type TeamAdminFormValues = z.infer<typeof teamAdminSchema>;

export function TeamAdminAddForm({
  clubId,
  teamId,
  onSuccess,
}: {
  clubId: string;
  teamId: string;
  onSuccess?: () => void;
}) {
  const { mutate: addTeamAdmin, isPending } = useTeamAdminAdd(clubId, teamId);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TeamAdminFormValues>({ resolver: zodResolver(teamAdminSchema) });

  const onSubmit = (values: TeamAdminFormValues) => {
    addTeamAdmin(values, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
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
        label="Adresse e-mail"
        id="team-admin-email"
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

- [ ] **Step 2: `TeamAdminRow.tsx`** (mirrors `TeamClubRow.tsx`)

```tsx
import { useState } from 'react';
import { Button } from '@basketeasy/ui/button';
import { FieldError } from '@basketeasy/ui/field-error';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { TeamAdmin } from '@basketeasy/types/team-admins';
import { useTeamAdminRemove } from './useTeamAdminRemove';
import { getClubErrorMessage } from './clubErrorMessages';

export function TeamAdminRow({
  clubId,
  teamId,
  admin,
  canManage,
}: {
  clubId: string;
  teamId: string;
  admin: TeamAdmin;
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const { mutate: removeTeamAdmin, isPending } = useTeamAdminRemove(clubId, teamId);

  return (
    <TableRow>
      <TableCell>{admin.email}</TableCell>
      <TableCell className="flex flex-col gap-2">
        {error && <FieldError>{error}</FieldError>}
        {canManage && (
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() =>
              removeTeamAdmin(admin.userId, {
                onError: (err) => setError(getClubErrorMessage(err)),
              })
            }
          >
            Retirer
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/clubs/TeamAdminAddForm.tsx app/src/clubs/TeamAdminRow.tsx
git commit -m "feat(app): TeamAdminAddForm and TeamAdminRow"
```

---

## Task 11: Frontend — roster role UI + wire everything into `TeamDetailPage`

**Files:**

- Modify: `app/src/clubs/TeamPlayerAddForm.tsx`
- Modify: `app/src/clubs/TeamPlayerRow.tsx`
- Create: `app/src/clubs/useTeamPlayerRoleUpdate.ts`
- Modify: `app/src/clubs/EventRow.tsx`
- Modify: `app/src/pages/TeamDetailPage.tsx`
- Modify: `app/src/pages/TeamDetailPage.test.tsx`
- Create: `app/src/clubs/TeamPlayerRow.test.tsx`

- [ ] **Step 1: `useTeamPlayerRoleUpdate.ts`**

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TeamMemberRole, TeamPlayer } from '@basketeasy/types/teams';
import { apiClient } from '../api/client';
import { teamPlayersQueryKey } from './queryKeys';

export function useTeamPlayerRoleUpdate(clubId: string, teamId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ playerId, role }: { playerId: string; role: TeamMemberRole }) =>
      apiClient.patch<TeamPlayer>(`/clubs/${clubId}/teams/${teamId}/players/${playerId}`, {
        role,
      }),
    onSuccess: (teamPlayer) => {
      queryClient.setQueryData<TeamPlayer[]>(teamPlayersQueryKey(clubId, teamId), (prev) =>
        (prev ?? []).map((tp) => (tp.playerId === teamPlayer.playerId ? teamPlayer : tp)),
      );
    },
  });
}
```

- [ ] **Step 2: Add a role select to `TeamPlayerAddForm.tsx`**

Extend the schema and add a `SelectField` for role, defaulting to `PLAYER`:

```typescript
import type { Player } from '@basketeasy/types/players';
import type { TeamMemberRole } from '@basketeasy/types/teams';
import { TEAM_MEMBER_ROLE_OPTIONS } from './teamLabels';

const teamPlayerSchema = z.object({
  playerId: z.string().min(1, 'Joueur requis'),
  role: z.enum(['COACH', 'PLAYER']),
});

type TeamPlayerFormValues = z.infer<typeof teamPlayerSchema>;
```

`useForm` gets `defaultValues: { playerId: '', role: 'PLAYER' }`. Add a second `Controller`
below the existing `playerId` one:

```tsx
<Controller
  control={control}
  name="role"
  render={({ field }) => (
    <SelectField
      label="Rôle"
      id="team-player-role-select"
      options={TEAM_MEMBER_ROLE_OPTIONS}
      value={field.value}
      onValueChange={(value) => field.onChange(value as TeamMemberRole)}
    />
  )}
/>
```

And the submit handler passes `{ playerId: values.playerId, role: values.role }` instead of
just `{ playerId: values.playerId }`.

- [ ] **Step 3: `TeamPlayerRow.tsx`** — show the role, add a role-change control, rename
      `isAdmin` prop to `canManage` (semantics broadened: club admin OR team admin, computed by
      the caller via `useIsTeamManager`)

```tsx
import { useState } from 'react';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { FieldError } from '@basketeasy/ui/field-error';
import { SelectField } from '@basketeasy/ui/select-field';
import { TableCell, TableRow } from '@basketeasy/ui/table';
import type { TeamMemberRole, TeamPlayer } from '@basketeasy/types/teams';
import { useTeamPlayerRemove } from './useTeamPlayerRemove';
import { useTeamPlayerRoleUpdate } from './useTeamPlayerRoleUpdate';
import { getClubErrorMessage } from './clubErrorMessages';
import { TEAM_MEMBER_ROLE_OPTIONS, teamMemberRoleLabel } from './teamLabels';

export function TeamPlayerRow({
  clubId,
  teamId,
  teamPlayer,
  canManage,
}: {
  clubId: string;
  teamId: string;
  teamPlayer: TeamPlayer;
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const { mutate: removeTeamPlayer, isPending: isRemoving } = useTeamPlayerRemove(clubId, teamId);
  const { mutate: updateRole, isPending: isUpdatingRole } = useTeamPlayerRoleUpdate(clubId, teamId);

  return (
    <TableRow>
      <TableCell>{teamPlayer.firstName}</TableCell>
      <TableCell>{teamPlayer.lastName}</TableCell>
      <TableCell>
        {canManage ? (
          <SelectField
            label="Rôle"
            id={`team-player-role-${teamPlayer.playerId}`}
            options={TEAM_MEMBER_ROLE_OPTIONS}
            value={teamPlayer.role}
            disabled={isUpdatingRole}
            onValueChange={(value) =>
              updateRole(
                { playerId: teamPlayer.playerId, role: value as TeamMemberRole },
                { onError: (err) => setError(getClubErrorMessage(err)) },
              )
            }
          />
        ) : (
          <Badge variant="secondary">{teamMemberRoleLabel(teamPlayer.role)}</Badge>
        )}
      </TableCell>
      <TableCell className="flex flex-col gap-2">
        {error && <FieldError>{error}</FieldError>}
        {canManage && (
          <Button
            variant="outline"
            disabled={isRemoving}
            onClick={() =>
              removeTeamPlayer(teamPlayer.playerId, {
                onError: (err) => setError(getClubErrorMessage(err)),
              })
            }
          >
            Retirer
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
```

`SelectField`'s props (`packages/@basketeasy/ui/src/components/SelectField.tsx`) already
confirmed: `label: string` (required, renders visibly above the trigger — passing `"Rôle"`
duplicates the new column header text but that's an accepted, common admin-table tradeoff,
not a blocker), `value`/`onValueChange`/`disabled` all present and typed as expected.

- [ ] **Step 4: `EventRow.tsx`** — rename the `isAdmin` prop to `canManage` (no behavior
      change beyond the name — same two buttons, same condition)

- [ ] **Step 5: `TeamDetailPage.tsx`** — add `canManageTeam`, wire the admins section, pass
      `canManage` instead of `isAdmin` to `TeamPlayerRow`/`EventRow`/their add-dialogs

```typescript
import { useIsTeamManager } from '../clubs/useIsTeamManager';
import { useTeamAdminList } from '../clubs/useTeamAdminList';
import { TeamAdminAddForm } from '../clubs/TeamAdminAddForm';
import { TeamAdminRow } from '../clubs/TeamAdminRow';
```

```typescript
const isAdmin = useIsClubAdmin(clubId);
const canManageTeam = useIsTeamManager(clubId!, teamId!);
const { data: teamAdmins, isLoading: isLoadingAdmins } = useTeamAdminList(clubId!, teamId!);
```

- The "Modifier" (edit-team) button's guard changes from `isAdmin` to `canManageTeam` —
  `PATCH .../teams/:teamId` moved to `TeamManagerGuard` in Task 6, so the button must follow.
  It currently sits inside `{isAdmin && (...)}` alongside the delete button; split that
  block so "Modifier" checks `canManageTeam` and "Supprimer" (delete) keeps checking
  `isAdmin && isOwner` (delete-team guard is untouched — Global Constraints).
- The CTC "Associer un club" dialog trigger stays `isAdmin && isOwner` (owner-only,
  unchanged — `addTeamClub`'s guard wasn't touched).
- Change the "Ajouter un joueur" dialog trigger, the `TeamPlayerRow` `canManage` prop, the
  "Créer un événement" dialog trigger, and the `EventRow` `canManage` prop from `isAdmin` to
  `canManageTeam`.
- Add a `<TableHead>Rôle</TableHead>` between the existing `Nom` and blank action
  `TableHead`s in the roster `<Table>`'s header row — `TeamPlayerRow` now renders 4 cells,
  not 3.
- Add a new section after "Événements" (or before it — match the existing section order,
  roster then events then admins reads naturally):

```tsx
<section className="flex flex-col gap-4">
  <div className="flex flex-wrap items-center justify-between gap-4">
    <Heading as="h2" size="2xl" className="m-0">
      Administrateurs de l'équipe
    </Heading>
    {canManageTeam && (
      <Dialog open={isAddAdminOpen} onOpenChange={setIsAddAdminOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">Ajouter un administrateur</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un administrateur d'équipe</DialogTitle>
            <DialogDescription>
              Donnez à un membre du club la gestion de cette équipe (effectif, événements) sans en
              faire un administrateur du club.
            </DialogDescription>
          </DialogHeader>
          <TeamAdminAddForm
            clubId={clubId!}
            teamId={teamId!}
            onSuccess={() => setIsAddAdminOpen(false)}
          />
        </DialogContent>
      </Dialog>
    )}
  </div>

  <Card>
    <CardContent className="pt-6">
      {isLoadingAdmins ? (
        <Loader>Chargement...</Loader>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-mail</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamAdmins?.map((admin) => (
              <TeamAdminRow
                key={admin.userId}
                clubId={clubId!}
                teamId={teamId!}
                admin={admin}
                canManage={canManageTeam}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
</section>
```

Add `const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);` alongside the other
`isAdd*Open` state.

- [ ] **Step 6: Add a default MSW handler + update `TeamDetailPage.test.tsx`**

`app/src/mocks/handlers.ts` already has this exact pattern for teams/events (`"Default: no
teams for any club" ... http.get('/api/clubs/:clubId/teams', ...)`) — add one more entry to
the `handlers` array immediately after the events default:

```typescript
// Default: no team admins for any team. TeamDetailPage always queries this;
// team-admin-focused tests override it with server.use(...).
http.get('/api/clubs/:clubId/teams/:teamId/admins', () => HttpResponse.json([])),
```

Then in `TeamDetailPage.test.tsx`, add at least one test asserting a `TeamAdmin`
(non-club-admin) user sees roster/event-management controls when `server.use(...)` returns
their own `userId` in the `GET .../admins` response — this is what actually exercises
`useIsTeamManager`'s non-club-admin branch.

- [ ] **Step 7: `TeamPlayerRow.test.tsx`** — new, covering: role badge renders for
      `canManage={false}`, role select renders and fires `useTeamPlayerRoleUpdate` for
      `canManage={true}` (follow whichever RTL/MSW pattern `useTeamCreate.test.ts` or an existing
      component test in `app/src/clubs`/`app/src/pages` already uses for hook-backed
      interaction tests).

- [ ] **Step 8: Run the frontend suite, then commit**

```bash
pnpm --filter @basketeasy/app test
```

```bash
git add app/src/clubs/TeamPlayerAddForm.tsx app/src/clubs/TeamPlayerRow.tsx app/src/clubs/TeamPlayerRow.test.tsx app/src/clubs/useTeamPlayerRoleUpdate.ts app/src/clubs/EventRow.tsx app/src/pages/TeamDetailPage.tsx app/src/pages/TeamDetailPage.test.tsx
git commit -m "feat(app): roster role UI and team-admin management on TeamDetailPage"
```

---

## Task 12: Docs — `CLAUDE.md` Teams module section

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Extend the "Teams module" section**

Add two short paragraphs (matching the section's existing terse, bullet-per-fact style):

- `TeamPlayer.role: COACH | PLAYER` (default `PLAYER`) labels a roster entry; no
  role-specific permissions exist yet (a coach isn't automatically a `TeamAdmin`).
- `TeamAdmin` grants a `User` admin rights over one specific `Team` (roster, roster roles,
  events, team info edit) without club-wide `ClubRole.ADMIN`. The first `TeamAdmin` for a
  team must be created by a club `ADMIN` of a linked club; after that, existing
  `TeamAdmin`s can add/remove further ones too. Enforced by `TeamManagerGuard`
  (`server/src/auth/guards/team-manager.guard.ts`), which does **not** cover CTC ownership
  actions (delete team, add/remove partner club) — those stay owner-club-`ADMIN`-only via
  `assertTeamOwner`.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document TeamPlayer role and TeamAdmin in CLAUDE.md"
```

---

## Task 13: Full verification

- [ ] **Step 1: Format, lint, build, test — both packages**

```bash
pnpm format
pnpm --filter @basketeasy/server exec eslint .
pnpm --filter @basketeasy/app exec eslint .
DATABASE_URL="postgresql://basketeasy:basketeasy@localhost:5432/basketeasy" JWT_ACCESS_SECRET="test-secret-at-least-32-characters-long" pnpm --filter @basketeasy/server exec nest build
pnpm --filter @basketeasy/server test
pnpm --filter @basketeasy/app test
pnpm --filter @basketeasy/app exec tsc --noEmit
```

- [ ] **Step 2: Manual sanity check (if a browser is available in the working environment)**

Start `docker compose up -d`, register two users, have user A create a club + team, have
user A add user B (already registered, not a club member) as `TeamAdmin` via the new UI,
log in as user B, confirm they can manage the team's roster/events but cannot see a delete-
team or add-partner-club affordance.

- [ ] **Step 3: Commit any formatting fixups**

```bash
git add -A
git commit -m "chore: format fixups"
```
