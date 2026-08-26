# Player Import from FBI Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a club `ADMIN` upload their FBI license export (Excel/CSV), map its columns to `Player` fields, preview the resulting create/update/skip/conflict actions, and commit — turning an 80-row manual retyping job into one guided import.

**Architecture:** Client-side spreadsheet parsing and column mapping (SheetJS `xlsx`); a read-only preview computed by a pure matching function mirrored on both sides; one new POST endpoint that re-derives matches server-side inside a Prisma transaction and never trusts a client-asserted action. `Player` gains `nationalId`/`licenseNumber`/`birthDate`/`gender`/`licenseType`; `TeamGender` is renamed to a shared `Gender` enum used by both `Team` and `Player`.

**Tech Stack:** NestJS + Prisma (server), React + Vite + TanStack Query + react-hook-form + zod (app), `xlsx` (SheetJS, new dependency) for spreadsheet parsing.

**Spec:** [docs/superpowers/specs/2026-08-26-player-import-design.md](../specs/2026-08-26-player-import-design.md)

## Global Constraints

- Match order: `nationalId` (global uniqueness check) → club-scoped `firstName + lastName + birthDate` (only when `birthDate` is mapped and populated on the row) → create.
- Rows with `licenseType` in `T`, `AS`, `AS HN`, `AGTSP` are filtered out before matching (not player rows).
- Rows missing `firstName` or `lastName` after mapping are skipped — the only two hard-required fields.
- A `nationalId` match against a `Player` at a **different** club is a conflict — never reassign a player's club, never write that row.
- The import page is a dedicated route (`/clubs/:clubId/import-players`), not a `Dialog` — multi-step flows get a route per `CLAUDE.md`.
- Server never trusts a client-computed action; `ClubsController`'s `importPlayers` re-derives create/update/conflict itself inside one `$transaction`.
- All new product-facing copy is French, per `CLAUDE.md`'s locale convention.

---

## File Structure

**Server:**
- Modify `server/prisma/schema.prisma` — rename `TeamGender` → `Gender`, add `Player.nationalId/licenseNumber/birthDate/gender/licenseType`.
- Modify `server/src/teams/teams.service.ts`, `server/src/teams/dto/{create-team,update-team,list-teams}.dto.ts` — `TeamGender` → `Gender` references.
- Create `server/src/clubs/dto/import-players.dto.ts` — request DTO for the import endpoint.
- Modify `server/src/clubs/clubs.service.ts` — add `importPlayers`, extend `toPlayer`.
- Modify `server/src/clubs/clubs.controller.ts` — add `POST clubs/:clubId/players/import`.
- Modify `server/src/clubs/clubs.service.spec.ts`, `server/src/clubs/clubs.controller.spec.ts` — new test coverage.

**Shared types:**
- Modify `packages/@basketeasy/types/teams.ts` — `TeamGender` → `Gender`.
- Modify `packages/@basketeasy/types/players.ts` — extend `Player`, add `ImportPlayersRequest`/`ImportPlayersRow`/`ImportPlayersResult`.

**App:**
- Modify `app/package.json` — add `xlsx` dependency.
- Modify `app/src/clubs/TeamEditModal.tsx`, `TeamCreateForm.tsx`, `teamLabels.ts`, `TeamRosterCards.tsx`, `app/src/pages/MembersPage.tsx` — `TeamGender` → `Gender` references.
- Create `app/src/clubs/playerImport/parseSpreadsheet.ts` — file → header row + raw rows, using `xlsx`.
- Create `app/src/clubs/playerImport/columnMapping.ts` — pure header-guessing function + the target field list.
- Create `app/src/clubs/playerImport/resolveImportRows.ts` — pure function: mapped rows + existing players → resolved actions. Mirrors the server's match logic exactly (same file structure as the server's, so a future rule change is easy to keep in sync).
- Create `app/src/clubs/playerImport/resolveImportRows.test.ts`.
- Create `app/src/clubs/playerImport/columnMapping.test.ts`.
- Create `app/src/clubs/usePlayerImport.ts` — mutation hook.
- Create `app/src/pages/PlayerImportPage.tsx` — route component, owns the 4-step state machine.
- Create `app/src/clubs/playerImport/PlayerImportUploadStep.tsx`.
- Create `app/src/clubs/playerImport/PlayerImportMappingStep.tsx`.
- Create `app/src/clubs/playerImport/PlayerImportPreviewStep.tsx` — preview table + confirm button (spec's steps 3+4 on one screen).
- Create `app/src/pages/PlayerImportPage.test.tsx`.
- Modify `app/src/App.tsx` — new route.
- Modify `app/src/pages/MembersPage.tsx` — "Importer les licenciés" entry button.

---

### Task 1: Rename `TeamGender` to shared `Gender`, add `Player` import columns (schema + migration)

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/src/teams/teams.service.ts:9,49,197,580,645`
- Modify: `server/src/teams/dto/create-team.dto.ts:3,16-17`
- Modify: `server/src/teams/dto/update-team.dto.ts:3,19-20`
- Modify: `server/src/teams/dto/list-teams.dto.ts:2,8`

**Interfaces:**
- Produces: Prisma enum `Gender` (`'MEN' | 'WOMEN'`), `Player.nationalId: string | null`, `Player.licenseNumber: string | null`, `Player.birthDate: Date | null`, `Player.gender: Gender | null`, `Player.licenseType: string | null`.

- [ ] **Step 1: Edit the schema**

In `server/prisma/schema.prisma`, rename the enum and update `Team.gender`'s type, and add the new `Player` columns:

```prisma
model Player {
  id            String    @id @default(uuid())
  firstName     String
  lastName      String
  clubId        String
  userId        String?
  nationalId    String?   @unique
  licenseNumber String?
  birthDate     DateTime?
  gender        Gender?
  licenseType   String?
  createdAt     DateTime  @default(now())
  club          Club      @relation(fields: [clubId], references: [id])
  user          User?     @relation(fields: [userId], references: [id])
  teamPlayers   TeamPlayer[]

  @@unique([clubId, userId])
  @@index([clubId])
}
```

Rename:

```prisma
enum Gender {
  MEN
  WOMEN
}
```

And change `Team.gender`'s type from `TeamGender` to `Gender`:

```prisma
model Team {
  id          String         @id @default(uuid())
  name        String
  category    TeamCategory
  gender      Gender
  createdAt   DateTime       @default(now())
  clubTeams   ClubTeam[]
  teamPlayers TeamPlayer[]
  events      Event[]
  teamAdmins  TeamAdmin[]
  ffbbLinks   TeamFfbbLink[]
}
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @basketeasy/server exec prisma migrate dev --name add_player_import_fields`

Expected: a new folder under `server/prisma/migrations/` containing `ALTER TYPE "TeamGender" RENAME TO "Gender"` (or Prisma's equivalent drop/recreate — accept whatever Prisma generates) plus `ALTER TABLE "Player" ADD COLUMN` statements for the five new columns, and a `CREATE UNIQUE INDEX` on `Player.nationalId`. The command also regenerates the Prisma client.

- [ ] **Step 3: Rename `TeamGender` → `Gender` in the four server files that import it**

In each of `server/src/teams/teams.service.ts`, `server/src/teams/dto/create-team.dto.ts`, `server/src/teams/dto/update-team.dto.ts`, `server/src/teams/dto/list-teams.dto.ts`: replace every `TeamGender` token with `Gender` (import from `@prisma/client` stays the same shape, just the imported name changes; `list-teams.dto.ts`'s import from `@basketeasy/types/teams` will be fixed in Task 2).

- [ ] **Step 4: Build to confirm the rename is complete**

Run: `pnpm --filter @basketeasy/server exec tsc --noEmit`
Expected: no errors referencing `TeamGender` in the four files above. (Errors from `@basketeasy/types/teams` are expected until Task 2 — ignore those for now.)

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/src/teams
git commit -m "feat(server): rename TeamGender to Gender, add Player import columns"
```

---

### Task 2: Shared types — `Gender` rename in `teams.ts`, `Player` additions, import request/response shapes

**Files:**
- Modify: `packages/@basketeasy/types/teams.ts`
- Modify: `packages/@basketeasy/types/players.ts`

**Interfaces:**
- Consumes: nothing (pure type definitions).
- Produces: `Gender` (exported from `@basketeasy/types/teams`), `Player` (extended), `ImportPlayersRow`, `ImportPlayersRequest`, `ImportPlayersResult` (exported from `@basketeasy/types/players`).

- [ ] **Step 1: Rename `TeamGender` to `Gender` in `teams.ts`**

In `packages/@basketeasy/types/teams.ts`, rename the `TeamGender` type declaration to `Gender` and update every field that referenced `TeamGender` (`Team.gender`, `CreateTeamRequest.gender`, `UpdateTeamRequest.gender`, `ListTeamsParams.gender`) to use `Gender`.

- [ ] **Step 2: Extend `Player` and add import types in `players.ts`**

```typescript
import type { PaginationParams, SortOrder } from './pagination';
import type { Gender } from './teams';

export interface Player {
  id: string;
  clubId: string;
  firstName: string;
  lastName: string;
  /** Club member this roster entry is linked to, if any. */
  userId: string | null;
  /** FBI's N° national — permanent, follows the player across clubs/seasons. */
  nationalId: string | null;
  /** FBI's N° licence — this season's number, changes yearly. Display only. */
  licenseNumber: string | null;
  birthDate: string | null;
  gender: Gender | null;
  /** Free-text license type code (C, C1, C2, L, ...). */
  licenseType: string | null;
  createdAt: string;
}

export interface CreatePlayerRequest {
  firstName: string;
  lastName: string;
  userId?: string;
}

export interface UpdatePlayerRequest {
  firstName?: string;
  lastName?: string;
  /** Pass null to unlink, a member's userId to link, or omit to leave unchanged. */
  userId?: string | null;
}

export type PlayerSortBy = 'name' | 'createdAt';

export interface ListPlayersParams extends PaginationParams {
  sortBy?: PlayerSortBy;
  sortOrder?: SortOrder;
}

export interface ImportPlayersRow {
  firstName: string;
  lastName: string;
  nationalId?: string;
  licenseNumber?: string;
  birthDate?: string;
  gender?: Gender;
  licenseType?: string;
}

export interface ImportPlayersRequest {
  rows: ImportPlayersRow[];
}

export interface ImportPlayersResult {
  created: number;
  updated: number;
  conflicts: number;
}
```

- [ ] **Step 3: Lint the package**

Run: `pnpm --filter @basketeasy/types exec eslint teams.ts players.ts --max-warnings 0`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/@basketeasy/types/teams.ts packages/@basketeasy/types/players.ts
git commit -m "feat(types): rename TeamGender to Gender, add player import types"
```

---

### Task 3: Fix up remaining `TeamGender` references (server DTO import, app)

**Files:**
- Modify: `server/src/teams/dto/list-teams.dto.ts:2`
- Modify: `app/src/clubs/TeamEditModal.tsx:8,36,83`
- Modify: `app/src/clubs/TeamCreateForm.tsx:9,112`
- Modify: `app/src/clubs/teamLabels.ts:1,13,25`
- Modify: `app/src/clubs/TeamRosterCards.tsx:5,15,26,67`
- Modify: `app/src/pages/MembersPage.tsx:33,341`

**Interfaces:**
- Consumes: `Gender` from `@basketeasy/types/teams` (Task 2).

- [ ] **Step 1: Update the server DTO import**

In `server/src/teams/dto/list-teams.dto.ts`, change:

```typescript
import type { TeamCategory, TeamGender, TeamSortBy } from '@basketeasy/types/teams';
```

to:

```typescript
import type { TeamCategory, Gender, TeamSortBy } from '@basketeasy/types/teams';
```

and update the `GENDERS: TeamGender[]` line to `GENDERS: Gender[]`.

- [ ] **Step 2: Update every app file**

In each of `TeamEditModal.tsx`, `TeamCreateForm.tsx`, `teamLabels.ts`, `TeamRosterCards.tsx`, `MembersPage.tsx`: replace every `TeamGender` token (type imports, generic parameters, casts) with `Gender`. No behavior changes — `TEAM_GENDER_OPTIONS`, `teamGenderLabel`, and every `'MEN'`/`'WOMEN'` literal stay as they are; only the type name changes.

- [ ] **Step 3: Build server and typecheck app**

Run: `pnpm --filter @basketeasy/server exec tsc --noEmit && pnpm --filter @basketeasy/app exec tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the existing team test suites to confirm no regression**

Run: `pnpm --filter @basketeasy/server test -- teams && pnpm --filter @basketeasy/app test -- Team`
Expected: PASS, same results as before the rename.

- [ ] **Step 5: Commit**

```bash
git add server/src/teams/dto/list-teams.dto.ts app/src/clubs/TeamEditModal.tsx app/src/clubs/TeamCreateForm.tsx app/src/clubs/teamLabels.ts app/src/clubs/TeamRosterCards.tsx app/src/pages/MembersPage.tsx
git commit -m "refactor: finish TeamGender to Gender rename across app and server DTO"
```

---

### Task 4: `POST clubs/:clubId/players/import` DTO and controller wiring

**Files:**
- Create: `server/src/clubs/dto/import-players.dto.ts`
- Modify: `server/src/clubs/clubs.controller.ts`
- Modify: `server/src/clubs/clubs.controller.spec.ts`

**Interfaces:**
- Consumes: `ImportPlayersRequest`, `ImportPlayersRow`, `ImportPlayersResult` from `@basketeasy/types/players` (Task 2); `ClubsService.importPlayers` (Task 5 — controller test mocks it, so this task doesn't block on Task 5 existing yet).
- Produces: `ImportPlayersDto` class, `POST clubs/:clubId/players/import` route.

- [ ] **Step 1: Write the DTO**

```typescript
// server/src/clubs/dto/import-players.dto.ts
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { Gender } from '@basketeasy/types/teams';
import type { ImportPlayersRequest, ImportPlayersRow } from '@basketeasy/types/players';

const GENDERS: Gender[] = ['MEN', 'WOMEN'];

class ImportPlayersRowDto implements ImportPlayersRow {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  licenseNumber?: string;

  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @IsOptional()
  @IsIn(GENDERS)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  licenseType?: string;
}

export class ImportPlayersDto implements ImportPlayersRequest {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportPlayersRowDto)
  rows!: ImportPlayersRowDto[];
}
```

- [ ] **Step 2: Add the controller route**

In `server/src/clubs/clubs.controller.ts`, add the import to the DTO list:

```typescript
import { ImportPlayersDto } from './dto/import-players.dto';
```

and add the route just after the existing `createPlayer` route (around line 97):

```typescript
  @Post(':clubId/players/import')
  @UseGuards(ClubRolesGuard)
  @ClubRoles('ADMIN')
  importPlayers(
    @Param('clubId') clubId: string,
    @Body() dto: ImportPlayersDto,
  ): Promise<ImportPlayersResult> {
    return this.clubsService.importPlayers(clubId, dto.rows);
  }
```

Add `ImportPlayersResult` to the existing `@basketeasy/types/players` type import at the top of the file.

- [ ] **Step 3: Write the controller test**

In `server/src/clubs/clubs.controller.spec.ts`, add `importPlayers: jest.Mock` to both the `service` type and the `beforeEach` mock object (next to `createPlayer`), then add:

```typescript
it('importPlayers delegates clubId and the row list', async () => {
  service.importPlayers.mockResolvedValue({ created: 2, updated: 1, conflicts: 0 });

  const rows = [{ firstName: 'A', lastName: 'B' }];
  const result = await controller.importPlayers('club-1', { rows });

  expect(service.importPlayers).toHaveBeenCalledWith('club-1', rows);
  expect(result).toEqual({ created: 2, updated: 1, conflicts: 0 });
});
```

- [ ] **Step 4: Run the controller test**

Run: `pnpm --filter @basketeasy/server test -- clubs.controller`
Expected: PASS (the new test), other `createPlayer`/etc. tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add server/src/clubs/dto/import-players.dto.ts server/src/clubs/clubs.controller.ts server/src/clubs/clubs.controller.spec.ts
git commit -m "feat(server): wire player import route through ClubsController"
```

---

### Task 5: `ClubsService.importPlayers` — matching, conflict detection, transaction

**Files:**
- Modify: `server/src/clubs/clubs.service.ts`

**Interfaces:**
- Consumes: `ImportPlayersRow`, `ImportPlayersResult` from `@basketeasy/types/players`.
- Produces: `ClubsService.importPlayers(clubId: string, rows: ImportPlayersRow[]): Promise<ImportPlayersResult>`.

- [ ] **Step 1: Add the method**

Add to `server/src/clubs/clubs.service.ts`, after `updatePlayer` (around line 258). Uses one interactive `$transaction` so the whole batch is atomic and re-reads are consistent:

```typescript
  async importPlayers(clubId: string, rows: ImportPlayersRow[]): Promise<ImportPlayersResult> {
    return this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      let conflicts = 0;

      for (const row of rows) {
        const data = {
          firstName: row.firstName,
          lastName: row.lastName,
          nationalId: row.nationalId ?? null,
          licenseNumber: row.licenseNumber ?? null,
          birthDate: row.birthDate ? new Date(row.birthDate) : null,
          gender: row.gender ?? null,
          licenseType: row.licenseType ?? null,
        };

        const byNationalId = row.nationalId
          ? await tx.player.findUnique({ where: { nationalId: row.nationalId } })
          : null;

        if (byNationalId) {
          if (byNationalId.clubId !== clubId) {
            conflicts++;
            continue;
          }
          await tx.player.update({ where: { id: byNationalId.id }, data });
          updated++;
          continue;
        }

        const byNameAndBirthDate =
          row.birthDate &&
          (await tx.player.findFirst({
            where: {
              clubId,
              firstName: row.firstName,
              lastName: row.lastName,
              birthDate: new Date(row.birthDate),
            },
          }));

        if (byNameAndBirthDate) {
          await tx.player.update({ where: { id: byNameAndBirthDate.id }, data });
          updated++;
          continue;
        }

        await tx.player.create({ data: { ...data, clubId } });
        created++;
      }

      return { created, updated, conflicts };
    });
  }
```

- [ ] **Step 2: Extend `toPlayer` to carry the new fields**

Update the private `toPlayer` method (around line 307) — its parameter type and return both need the new columns:

```typescript
  private toPlayer(player: {
    id: string;
    clubId: string;
    firstName: string;
    lastName: string;
    userId: string | null;
    nationalId: string | null;
    licenseNumber: string | null;
    birthDate: Date | null;
    gender: Gender | null;
    licenseType: string | null;
    createdAt: Date;
  }): Player {
    return {
      id: player.id,
      clubId: player.clubId,
      firstName: player.firstName,
      lastName: player.lastName,
      userId: player.userId,
      nationalId: player.nationalId,
      licenseNumber: player.licenseNumber,
      birthDate: player.birthDate ? player.birthDate.toISOString() : null,
      gender: player.gender,
      licenseType: player.licenseType,
      createdAt: player.createdAt.toISOString(),
    };
  }
```

Add `Gender` to the `@prisma/client` import at the top of the file, and `ImportPlayersResult`/`ImportPlayersRow` to the `@basketeasy/types/players` import.

- [ ] **Step 3: Build to confirm types line up**

Run: `pnpm --filter @basketeasy/server exec tsc --noEmit`
Expected: no errors. (`Player.findMany`/`create`/etc. calls elsewhere in the file that construct a `Player` via `toPlayer` will now require the new fields be present on the Prisma row — since they all come straight from `prisma.player.*` calls, the extra columns are already on every row Prisma returns, so no other call site needs changes.)

- [ ] **Step 4: Commit**

```bash
git add server/src/clubs/clubs.service.ts
git commit -m "feat(server): ClubsService.importPlayers matching and transaction logic"
```

---

### Task 6: `ClubsService.importPlayers` tests

**Files:**
- Modify: `server/src/clubs/clubs.service.spec.ts`

**Interfaces:**
- Consumes: `ClubsService.importPlayers` (Task 5).

- [ ] **Step 1: Extend the Prisma mock's `$transaction` to support the callback form**

The existing mock (`$transaction: jest.fn((ops: unknown[]) => Promise.all(ops))`) only supports the array form. `importPlayers` uses the interactive callback form. Update the mock in the `beforeEach` block to support both:

```typescript
$transaction: jest.fn((arg: unknown) =>
  typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as unknown[]),
),
```

- [ ] **Step 2: Write the failing tests**

Add to `clubs.service.spec.ts`, in a new `describe('importPlayers', ...)` block:

```typescript
describe('importPlayers', () => {
  it('creates a new player when nothing matches', async () => {
    prisma.player.findUnique.mockResolvedValue(null);
    prisma.player.findFirst.mockResolvedValue(null);
    prisma.player.create.mockResolvedValue({});

    const result = await service.importPlayers('club-1', [
      { firstName: 'Léa', lastName: 'Martin', nationalId: '1234567A' },
    ]);

    expect(prisma.player.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clubId: 'club-1', firstName: 'Léa', lastName: 'Martin' }),
    });
    expect(result).toEqual({ created: 1, updated: 0, conflicts: 0 });
  });

  it('updates an existing player at the same club matched by nationalId', async () => {
    prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'club-1' });
    prisma.player.update.mockResolvedValue({});

    const result = await service.importPlayers('club-1', [
      { firstName: 'Léa', lastName: 'Martin', nationalId: '1234567A' },
    ]);

    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({ firstName: 'Léa' }),
    });
    expect(result).toEqual({ created: 0, updated: 1, conflicts: 0 });
  });

  it('flags a nationalId match at a different club as a conflict and does not write', async () => {
    prisma.player.findUnique.mockResolvedValue({ id: 'p1', clubId: 'other-club' });

    const result = await service.importPlayers('club-1', [
      { firstName: 'Léa', lastName: 'Martin', nationalId: '1234567A' },
    ]);

    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.player.create).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, updated: 0, conflicts: 1 });
  });

  it('matches an existing player by name + birthDate when nationalId is absent', async () => {
    prisma.player.findUnique.mockResolvedValue(null);
    prisma.player.findFirst.mockResolvedValue({ id: 'p2', clubId: 'club-1' });
    prisma.player.update.mockResolvedValue({});

    const result = await service.importPlayers('club-1', [
      { firstName: 'Théo', lastName: 'Dupont', birthDate: '2009-11-04' },
    ]);

    expect(prisma.player.findFirst).toHaveBeenCalledWith({
      where: {
        clubId: 'club-1',
        firstName: 'Théo',
        lastName: 'Dupont',
        birthDate: new Date('2009-11-04'),
      },
    });
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p2' },
      data: expect.anything(),
    });
    expect(result).toEqual({ created: 0, updated: 1, conflicts: 0 });
  });

  it('does not attempt a name+birthDate match when birthDate is missing, and creates instead', async () => {
    prisma.player.findUnique.mockResolvedValue(null);
    prisma.player.create.mockResolvedValue({});

    const result = await service.importPlayers('club-1', [
      { firstName: 'Théo', lastName: 'Dupont' },
    ]);

    expect(prisma.player.findFirst).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 1, updated: 0, conflicts: 0 });
  });

  it('processes a mixed batch of rows in one transaction', async () => {
    prisma.player.findUnique
      .mockResolvedValueOnce({ id: 'p1', clubId: 'club-1' })
      .mockResolvedValueOnce(null);
    prisma.player.findFirst.mockResolvedValue(null);
    prisma.player.update.mockResolvedValue({});
    prisma.player.create.mockResolvedValue({});

    const result = await service.importPlayers('club-1', [
      { firstName: 'Léa', lastName: 'Martin', nationalId: '1234567A' },
      { firstName: 'Théo', lastName: 'Dupont' },
    ]);

    expect(result).toEqual({ created: 1, updated: 1, conflicts: 0 });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @basketeasy/server test -- clubs.service`
Expected: FAIL (if Task 5 wasn't done yet) or PASS (Task 5 is done in this plan's order, so this should already pass — run it to confirm rather than to see a red bar).

- [ ] **Step 4: Fix any mismatch and re-run**

If a test fails due to a call-shape mismatch (e.g. `findFirst`'s `where` clause ordering), adjust the test's expectation to match the actual call — the assertions above describe intent, not a byte-exact contract with `importPlayers`' internals.

Run: `pnpm --filter @basketeasy/server test -- clubs.service`
Expected: PASS, all 6 new tests plus every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
git add server/src/clubs/clubs.service.spec.ts
git commit -m "test(server): cover ClubsService.importPlayers matching rules"
```

---

### Task 7: `xlsx` dependency and `parseSpreadsheet` utility

**Files:**
- Modify: `app/package.json`
- Create: `app/src/clubs/playerImport/parseSpreadsheet.ts`

**Interfaces:**
- Produces: `parseSpreadsheet(file: File): Promise<ParsedSpreadsheet>`, `interface ParsedSpreadsheet { headers: string[]; rows: string[][] }`.

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @basketeasy/app add xlsx`

- [ ] **Step 2: Write the parser**

```typescript
// app/src/clubs/playerImport/parseSpreadsheet.ts
import { read, utils } from 'xlsx';

export interface ParsedSpreadsheet {
  headers: string[];
  rows: string[][];
}

export class SpreadsheetParseError extends Error {}

/**
 * Reads an uploaded .xlsx/.xls/.csv file into a header row + raw string
 * rows. Always reads the first sheet — FBI's own export and every prior
 * tool's export is single-sheet.
 */
export async function parseSpreadsheet(file: File): Promise<ParsedSpreadsheet> {
  const buffer = await file.arrayBuffer();
  let workbook;
  try {
    workbook = read(buffer, { type: 'array' });
  } catch {
    throw new SpreadsheetParseError('Impossible de lire ce fichier.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new SpreadsheetParseError('Le fichier ne contient aucune feuille.');
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });

  if (matrix.length === 0) {
    throw new SpreadsheetParseError('Le fichier est vide.');
  }

  const [headers, ...rows] = matrix;
  return { headers: headers.map((h) => String(h).trim()), rows };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @basketeasy/app exec tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/package.json pnpm-lock.yaml app/src/clubs/playerImport/parseSpreadsheet.ts
git commit -m "feat(app): add xlsx dependency and spreadsheet parsing utility"
```

---

### Task 8: Column-mapping guess function

**Files:**
- Create: `app/src/clubs/playerImport/columnMapping.ts`
- Create: `app/src/clubs/playerImport/columnMapping.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `IMPORT_TARGET_FIELDS: ImportTargetField[]`, `type ImportTargetField = 'firstName' | 'lastName' | 'nationalId' | 'licenseNumber' | 'birthDate' | 'gender' | 'licenseType'`, `guessColumnMapping(headers: string[]): Partial<Record<ImportTargetField, number>>` (maps each target field to a header index, when a confident guess exists).

- [ ] **Step 1: Write the failing test**

```typescript
// app/src/clubs/playerImport/columnMapping.test.ts
import { describe, expect, it } from 'vitest';
import { guessColumnMapping } from './columnMapping';

describe('guessColumnMapping', () => {
  it('matches known FBI French labels case-insensitively', () => {
    const headers = ['N° national', 'N° licence', 'Nom', 'Prénom', 'Sexe', 'Date de naissance', 'Type lic.'];
    const mapping = guessColumnMapping(headers);

    expect(mapping).toEqual({
      nationalId: 0,
      licenseNumber: 1,
      lastName: 2,
      firstName: 3,
      gender: 4,
      birthDate: 5,
      licenseType: 6,
    });
  });

  it('leaves a field unmapped when no header matches', () => {
    const mapping = guessColumnMapping(['Nom', 'Prénom']);

    expect(mapping.firstName).toBe(1);
    expect(mapping.lastName).toBe(0);
    expect(mapping.nationalId).toBeUndefined();
  });

  it('returns an empty mapping for an empty header list', () => {
    expect(guessColumnMapping([])).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @basketeasy/app exec vitest run columnMapping`
Expected: FAIL — `columnMapping.ts` doesn't exist yet.

- [ ] **Step 3: Implement**

```typescript
// app/src/clubs/playerImport/columnMapping.ts
export type ImportTargetField =
  | 'firstName'
  | 'lastName'
  | 'nationalId'
  | 'licenseNumber'
  | 'birthDate'
  | 'gender'
  | 'licenseType';

export const IMPORT_TARGET_FIELDS: { field: ImportTargetField; label: string; required: boolean }[] = [
  { field: 'firstName', label: 'Prénom', required: true },
  { field: 'lastName', label: 'Nom', required: true },
  { field: 'nationalId', label: 'N° national', required: false },
  { field: 'licenseNumber', label: 'N° licence', required: false },
  { field: 'birthDate', label: 'Date de naissance', required: false },
  { field: 'gender', label: 'Sexe', required: false },
  { field: 'licenseType', label: 'Type de licence', required: false },
];

// Known FBI/near-universal French header labels per target field, lowercased.
// Matched by exact (case/accent-insensitive) comparison, not substring, to
// avoid a field like "Nom de naissance" being mistaken for "Nom".
const KNOWN_LABELS: Record<ImportTargetField, string[]> = {
  firstName: ['prenom', 'prénom'],
  lastName: ['nom', 'nom*'],
  nationalId: ['n national', 'n° national', 'no national'],
  licenseNumber: ['n licence', 'n° licence', 'no licence'],
  birthDate: ['date de naissance'],
  gender: ['sexe'],
  licenseType: ['type lic.', 'type lic', 'type de licence'],
};

function normalize(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function guessColumnMapping(headers: string[]): Partial<Record<ImportTargetField, number>> {
  const normalized = headers.map(normalize);
  const mapping: Partial<Record<ImportTargetField, number>> = {};

  for (const { field } of IMPORT_TARGET_FIELDS) {
    const labels = KNOWN_LABELS[field].map(normalize);
    const index = normalized.findIndex((h) => labels.includes(h));
    if (index !== -1) {
      mapping[field] = index;
    }
  }

  return mapping;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @basketeasy/app exec vitest run columnMapping`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/clubs/playerImport/columnMapping.ts app/src/clubs/playerImport/columnMapping.test.ts
git commit -m "feat(app): column-mapping guess for player import"
```

---

### Task 9: `resolveImportRows` — client-side preview matching (mirrors server rules)

**Files:**
- Create: `app/src/clubs/playerImport/resolveImportRows.ts`
- Create: `app/src/clubs/playerImport/resolveImportRows.test.ts`

**Interfaces:**
- Consumes: `ImportTargetField` (Task 8); `Player`, `ImportPlayersRow` from `@basketeasy/types/players` (Task 2).
- Produces:
  ```typescript
  export type ImportRowAction =
    | { type: 'create' }
    | { type: 'update'; existingPlayer: Player }
    | { type: 'conflict'; existingPlayer: Player }
    | { type: 'skip'; reason: 'missing-name' }
    | { type: 'ignored'; reason: 'license-type' };

  export interface ResolvedImportRow {
    row: ImportPlayersRow;
    action: ImportRowAction;
  }

  export function resolveImportRows(
    rawRows: string[][],
    mapping: Partial<Record<ImportTargetField, number>>,
    existingPlayers: Player[],
    clubId: string,
  ): ResolvedImportRow[];
  ```

- [ ] **Step 1: Write the failing tests**

```typescript
// app/src/clubs/playerImport/resolveImportRows.test.ts
import { describe, expect, it } from 'vitest';
import type { Player } from '@basketeasy/types/players';
import { resolveImportRows } from './resolveImportRows';

const CLUB_ID = 'club-1';

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    clubId: CLUB_ID,
    firstName: 'Léa',
    lastName: 'Martin',
    userId: null,
    nationalId: '1234567A',
    licenseNumber: null,
    birthDate: '2011-03-12',
    gender: null,
    licenseType: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const MAPPING = { firstName: 0, lastName: 1, nationalId: 2, birthDate: 3, licenseType: 4 };

describe('resolveImportRows', () => {
  it('creates when nothing matches', () => {
    const [{ action }] = resolveImportRows(
      [['Théo', 'Dupont', '', '', 'C1']],
      MAPPING,
      [],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'create' });
  });

  it('filters out T/AS/AS HN/AGTSP license-type rows before matching', () => {
    for (const type of ['T', 'AS', 'AS HN', 'AGTSP']) {
      const [{ action }] = resolveImportRows(
        [['Théo', 'Dupont', '', '', type]],
        MAPPING,
        [],
        CLUB_ID,
      );
      expect(action).toEqual({ type: 'ignored', reason: 'license-type' });
    }
  });

  it('skips a row missing firstName or lastName', () => {
    const [{ action }] = resolveImportRows(
      [['', 'Dupont', '', '', 'C1']],
      MAPPING,
      [],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'skip', reason: 'missing-name' });
  });

  it('resolves an update when nationalId matches an existing player at this club', () => {
    const existing = player();
    const [{ action }] = resolveImportRows(
      [['Léa', 'Martin', '1234567A', '', 'C1']],
      MAPPING,
      [existing],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'update', existingPlayer: existing });
  });

  it('resolves a conflict when nationalId matches an existing player at a different club', () => {
    const existing = player({ clubId: 'other-club' });
    const [{ action }] = resolveImportRows(
      [['Léa', 'Martin', '1234567A', '', 'C1']],
      MAPPING,
      [existing],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'conflict', existingPlayer: existing });
  });

  it('falls back to club-scoped name+birthDate match when nationalId is unmapped/blank', () => {
    const existing = player({ nationalId: null, birthDate: '2011-03-12' });
    const [{ action }] = resolveImportRows(
      [['Léa', 'Martin', '', '2011-03-12', 'C1']],
      MAPPING,
      [existing],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'update', existingPlayer: existing });
  });

  it('does not use the name-only fallback when birthDate is blank on the row', () => {
    const existing = player({ nationalId: null });
    const [{ action }] = resolveImportRows(
      [['Léa', 'Martin', '', '', 'C1']],
      MAPPING,
      [existing],
      CLUB_ID,
    );
    expect(action).toEqual({ type: 'create' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @basketeasy/app exec vitest run resolveImportRows`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement**

```typescript
// app/src/clubs/playerImport/resolveImportRows.ts
import type { ImportPlayersRow, Player } from '@basketeasy/types/players';
import type { Gender } from '@basketeasy/types/teams';
import type { ImportTargetField } from './columnMapping';

const IGNORED_LICENSE_TYPES = new Set(['T', 'AS', 'AS HN', 'AGTSP']);

export type ImportRowAction =
  | { type: 'create' }
  | { type: 'update'; existingPlayer: Player }
  | { type: 'conflict'; existingPlayer: Player }
  | { type: 'skip'; reason: 'missing-name' }
  | { type: 'ignored'; reason: 'license-type' };

export interface ResolvedImportRow {
  row: ImportPlayersRow;
  action: ImportRowAction;
}

function cell(raw: string[], mapping: Partial<Record<ImportTargetField, number>>, field: ImportTargetField): string {
  const index = mapping[field];
  if (index === undefined) return '';
  return (raw[index] ?? '').trim();
}

function toImportRow(
  raw: string[],
  mapping: Partial<Record<ImportTargetField, number>>,
): ImportPlayersRow {
  const gender = cell(raw, mapping, 'gender').toUpperCase();
  return {
    firstName: cell(raw, mapping, 'firstName'),
    lastName: cell(raw, mapping, 'lastName'),
    nationalId: cell(raw, mapping, 'nationalId') || undefined,
    licenseNumber: cell(raw, mapping, 'licenseNumber') || undefined,
    birthDate: cell(raw, mapping, 'birthDate') || undefined,
    gender: gender === 'MEN' || gender === 'WOMEN' ? (gender as Gender) : undefined,
    licenseType: cell(raw, mapping, 'licenseType') || undefined,
  };
}

export function resolveImportRows(
  rawRows: string[][],
  mapping: Partial<Record<ImportTargetField, number>>,
  existingPlayers: Player[],
  clubId: string,
): ResolvedImportRow[] {
  return rawRows.map((raw) => {
    const row = toImportRow(raw, mapping);

    if (row.licenseType && IGNORED_LICENSE_TYPES.has(row.licenseType)) {
      return { row, action: { type: 'ignored', reason: 'license-type' } };
    }

    if (!row.firstName || !row.lastName) {
      return { row, action: { type: 'skip', reason: 'missing-name' } };
    }

    if (row.nationalId) {
      const byNationalId = existingPlayers.find((p) => p.nationalId === row.nationalId);
      if (byNationalId) {
        return {
          row,
          action:
            byNationalId.clubId === clubId
              ? { type: 'update', existingPlayer: byNationalId }
              : { type: 'conflict', existingPlayer: byNationalId },
        };
      }
    }

    if (row.birthDate) {
      const byNameAndBirthDate = existingPlayers.find(
        (p) =>
          p.clubId === clubId &&
          p.firstName === row.firstName &&
          p.lastName === row.lastName &&
          p.birthDate === row.birthDate,
      );
      if (byNameAndBirthDate) {
        return { row, action: { type: 'update', existingPlayer: byNameAndBirthDate } };
      }
    }

    return { row, action: { type: 'create' } };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @basketeasy/app exec vitest run resolveImportRows`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add app/src/clubs/playerImport/resolveImportRows.ts app/src/clubs/playerImport/resolveImportRows.test.ts
git commit -m "feat(app): client-side import row matching, mirrors server rules"
```

---

### Task 10: `usePlayerImport` mutation hook

**Files:**
- Create: `app/src/clubs/usePlayerImport.ts`

**Interfaces:**
- Consumes: `ImportPlayersRequest`, `ImportPlayersResult` from `@basketeasy/types/players`; `clubPlayersQueryKey` from `app/src/clubs/queryKeys.ts`.
- Produces: `usePlayerImport(clubId: string)` — TanStack mutation, `mutate(rows: ImportPlayersRow[])`.

- [ ] **Step 1: Implement**

```typescript
// app/src/clubs/usePlayerImport.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportPlayersRow, ImportPlayersResult } from '@basketeasy/types/players';
import { apiClient } from '../api/client';
import { clubPlayersQueryKey } from './queryKeys';

export function usePlayerImport(clubId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rows: ImportPlayersRow[]) =>
      apiClient.post<ImportPlayersResult>(`/clubs/${clubId}/players/import`, { rows }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clubPlayersQueryKey(clubId) });
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @basketeasy/app exec tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/clubs/usePlayerImport.ts
git commit -m "feat(app): usePlayerImport mutation hook"
```

---

### Task 11: `PlayerImportPage` — upload, mapping, and preview/confirm steps

No new design tokens are needed for this task. Every surface below (the
drag-over dropzone, the step indicator, the conflict badge, the segmented
preview filter) is built from tokens already in
`packages/@basketeasy/ui/tailwind-preset.cjs` — `orange-text`/`orange-tint`
for the active/drag state, `blue-green`/`blue-green-2` for structure and
the "done" step, `error`/`error-tint` for conflicts, and the existing
`shadow-segment-active` for the pressed filter chip (the same shadow
`EventRsvpControl.tsx` and `TeamDetailPage.tsx` already use for their own
segmented toggles). Two small, justified extensions to existing shared
primitives are needed instead (Step 1 below) — no new component or token.

**Files:**
- Modify: `packages/@basketeasy/ui/package.json` — add the missing `./icons/check` subpath export for the already-existing (but currently unexported) `Check.tsx` icon.
- Modify: `packages/@basketeasy/ui/src/components/Table.tsx` — add an optional `containerClassName` prop, forwarded to the wrapping scroll `<div>`.
- Create: `app/src/clubs/playerImport/PlayerImportSteps.tsx`
- Create: `app/src/clubs/playerImport/PlayerImportUploadStep.tsx`
- Create: `app/src/clubs/playerImport/PlayerImportMappingStep.tsx`
- Create: `app/src/clubs/playerImport/PlayerImportPreviewStep.tsx`
- Create: `app/src/pages/PlayerImportPage.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/pages/MembersPage.tsx`

**Interfaces:**
- Consumes: `parseSpreadsheet`/`ParsedSpreadsheet`/`SpreadsheetParseError` (Task 7); `guessColumnMapping`/`IMPORT_TARGET_FIELDS`/`ImportTargetField` (Task 8); `resolveImportRows`/`ResolvedImportRow` (Task 9); `usePlayerImport` (Task 10); `usePlayerList`/`useIsClubAdmin` (existing, `app/src/clubs/`); `useIsDesktopViewport` (existing, `app/src/hooks/useIsDesktopViewport.ts` — the same desktop-table/mobile-card split `MembersPage.tsx` already uses for its player list); `getClubErrorMessage` (existing, `app/src/clubs/clubErrorMessages.ts`).
- Produces: route `/clubs/:clubId/import-players`; "Importer les licenciés" button in `MembersPage`; `Table`'s new optional `containerClassName` prop; the `@basketeasy/ui/icons/check` subpath export.

- [ ] **Step 1: Extend two shared primitives**

The preview step's sticky table header (Step 4 below) needs the scroll
container to be `Table`'s own wrapping `<div>`, not a second `<div>`
wrapped around `<Table>` — `position: sticky` sticks relative to the
nearest ancestor that is itself a scroll container, and `Table` already
renders one (`<div className="w-full overflow-auto">`) that today has no
way to receive a height cap. `SelectField` and `FormField` already solve
this exact "style the wrapper, not the inner element" problem with a
`containerClassName` prop, so `Table` gets the same idiom rather than a
new one-off pattern:

```tsx
// packages/@basketeasy/ui/src/components/Table.tsx — replace the existing Table export
export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  /** className applied to the wrapping scroll <div>, not the <table> — e.g. to cap height for a sticky header. */
  containerClassName?: string;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className, containerClassName, ...props }, ref) => (
    <div className={cn('w-full overflow-auto', containerClassName)}>
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  ),
);
Table.displayName = 'Table';
```

The step indicator (Step 2 below) needs a checkmark for completed steps.
`Check.tsx` (`packages/@basketeasy/ui/src/components/icons/Check.tsx`)
already exists and is exactly right for this, but it's only used
internally by `Checkbox.tsx` today via a relative import, not exposed as
a subpath — every other icon (`UsersIcon`, `TrophyIcon`, `BuildingIcon`,
`CalendarIcon`, `ShieldIcon`, `Spinner`) has one. Add the missing entry to
`packages/@basketeasy/ui/package.json`'s `exports` map, next to the other
`./icons/*` entries:

```json
    "./icons/check": {
      "types": "./src/components/icons/Check.tsx",
      "default": "./src/components/icons/Check.tsx"
    },
```

- [ ] **Step 2: Run the existing Table test suite to confirm the primitive change is safe**

Run: `pnpm --filter @basketeasy/ui exec vitest run Table`
Expected: PASS, unchanged — the new prop is optional and additive.

- [ ] **Step 3: Step indicator component**

```tsx
// app/src/clubs/playerImport/PlayerImportSteps.tsx
import { Check } from '@basketeasy/ui/icons/check';
import { cn } from '@basketeasy/ui/cn';

export const PLAYER_IMPORT_STEP_LABELS = ['Fichier', 'Colonnes', 'Aperçu'] as const;

/**
 * Three-stop step indicator for the import wizard. Kept local to this
 * feature rather than promoted to @basketeasy/ui: it composes only
 * existing tokens, and nothing else in the app needs a numbered step row
 * yet. The repo's own precedent for a small bespoke on-brand control
 * living next to its one caller is EventRsvpControl's segmented toggle
 * (app/src/clubs/EventRsvpControl.tsx), not a shared primitive — a
 * generic multi-purpose Stepper component would be speculative for a
 * single 3-step flow, so it isn't built here.
 */
export function PlayerImportSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol aria-label="Étapes de l'import" className="flex list-none items-center gap-2">
      {PLAYER_IMPORT_STEP_LABELS.map((label, index) => {
        const isDone = index < current;
        const isCurrent = index === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  isDone && 'bg-blue-green text-cream',
                  isCurrent && 'bg-orange-text text-cream',
                  !isDone && !isCurrent && 'border border-border-strong bg-sunk text-muted',
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className={cn('text-sm font-medium', isCurrent ? 'text-charcoal' : 'text-muted')}>
                {label}
                {isCurrent && <span className="sr-only"> (étape actuelle)</span>}
              </span>
            </div>
            {index < PLAYER_IMPORT_STEP_LABELS.length - 1 && (
              <span aria-hidden="true" className="h-0.5 flex-grow rounded-sm bg-blue-green/20" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: Upload step component, with drag-and-drop**

Native HTML5 drag-and-drop events, no library — the browser's own
`dragover`/`drop` events are enough for a single-file drop target, and
this app already avoids adding dependencies for things the platform does
natively. Click-to-browse stays as the primary, always-visible path
(a phone in a gym has nothing to drag from), with the dropzone as an
enhancement for desktop admins:

```tsx
// app/src/clubs/playerImport/PlayerImportUploadStep.tsx
import { useRef, useState, type DragEvent, type RefObject } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Loader } from '@basketeasy/ui/loader';
import { cn } from '@basketeasy/ui/cn';
import { parseSpreadsheet, SpreadsheetParseError, type ParsedSpreadsheet } from './parseSpreadsheet';

const ACCEPTED_EXTENSIONS = ['.csv', '.xls', '.xlsx'];

export function PlayerImportUploadStep({
  headingRef,
  onParsed,
}: {
  headingRef: RefObject<HTMLHeadingElement>;
  onParsed: (parsed: ParsedSpreadsheet) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    setIsParsing(true);
    try {
      const parsed = await parseSpreadsheet(file);
      onParsed(parsed);
    } catch (err) {
      setError(err instanceof SpreadsheetParseError ? err.message : 'Une erreur est survenue.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-2xl font-bold text-charcoal outline-none"
      >
        Importer le fichier
      </h2>
      <p className="text-sm text-muted">
        Sélectionnez l&apos;export FBI (Éditions → export Excel) ou tout fichier .csv/.xlsx
        listant vos licenciés.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!isParsing) setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={isParsing ? undefined : handleDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
          isDragOver ? 'border-orange-text bg-orange-tint' : 'border-border-strong bg-surface-2',
        )}
      >
        {isParsing ? (
          <Loader>Analyse du fichier…</Loader>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-8 w-8 text-muted"
            >
              <path d="M12 16V4M12 4 7.5 8.5M12 4l4.5 4.5" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <p className="text-sm text-muted">Glissez-déposez le fichier ici, ou</p>
            <Button type="button" onClick={() => inputRef.current?.click()}>
              Choisir un fichier
            </Button>
            <p className="text-xs text-muted">Formats acceptés : .csv, .xls, .xlsx</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="sr-only"
        aria-label="Choisir un fichier à importer"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Mapping step component**

Pairs each target field directly against a live sample of the mapped
column (up to two non-empty values from the uploaded file), instead of a
flat stack of selects with a separate raw-data table underneath — seeing
"Théo, Marie" next to "Prénom" the moment a column is picked (or already
guessed) is a faster sanity check than cross-referencing a table below
against a form above. An unmapped required field blocks progress with a
visible, specific explanation (an `Alert`, matching the `errors.root`
pattern `PlayerCreateForm.tsx`/`PlayerCard.tsx` already use for a
form-level problem) rather than a silently disabled button, and also
marks the offending select (`aria-invalid` + a `border-error` outline)
so the explanation and the control it refers to are visually linked:

```tsx
// app/src/clubs/playerImport/PlayerImportMappingStep.tsx
import { useState, type RefObject } from 'react';
import { Button } from '@basketeasy/ui/button';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@basketeasy/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import type { ParsedSpreadsheet } from './parseSpreadsheet';
import { IMPORT_TARGET_FIELDS, guessColumnMapping, type ImportTargetField } from './columnMapping';

const UNMAPPED = '__unmapped__';
const SAMPLE_ROW_COUNT = 2;
const REQUIRED_ALERT_ID = 'player-import-mapping-required';

function sampleValues(parsed: ParsedSpreadsheet, columnIndex: number | undefined): string {
  if (columnIndex === undefined) return '—';
  const values = parsed.rows
    .slice(0, SAMPLE_ROW_COUNT)
    .map((row) => row[columnIndex]?.trim())
    .filter((value): value is string => !!value);
  return values.length > 0 ? values.join(', ') : '—';
}

export function PlayerImportMappingStep({
  parsed,
  initialMapping,
  headingRef,
  onBack,
  onConfirm,
}: {
  parsed: ParsedSpreadsheet;
  /** Restores the previous choice when the admin comes back from the preview step. */
  initialMapping?: Partial<Record<ImportTargetField, number>>;
  headingRef: RefObject<HTMLHeadingElement>;
  onBack: () => void;
  onConfirm: (mapping: Partial<Record<ImportTargetField, number>>) => void;
}) {
  const [mapping, setMapping] = useState(() => initialMapping ?? guessColumnMapping(parsed.headers));

  const columnOptions = parsed.headers.map((header, index) => ({
    value: String(index),
    label: header || `Colonne ${index + 1}`,
  }));

  const missingRequired = IMPORT_TARGET_FIELDS.filter(
    ({ field, required }) => required && mapping[field] === undefined,
  );
  const isValid = missingRequired.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="font-heading text-2xl font-bold text-charcoal outline-none"
      >
        Faire correspondre les colonnes
      </h2>
      <p className="text-sm text-muted">
        Associez chaque champ à une colonne du fichier. Seuls Prénom et Nom sont obligatoires,
        laissez les autres champs non mappés si le fichier ne les contient pas.
      </p>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Champ</TableHead>
              <TableHead>Colonne source</TableHead>
              <TableHead>Aperçu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {IMPORT_TARGET_FIELDS.map(({ field, label, required }) => {
              const columnIndex = mapping[field];
              const isMissing = required && columnIndex === undefined;
              return (
                <TableRow key={field}>
                  <TableCell className="font-medium text-charcoal">
                    {label}
                    {required && (
                      <span className="text-orange-text" aria-hidden="true">
                        {' '}
                        *
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={columnIndex !== undefined ? String(columnIndex) : UNMAPPED}
                      onValueChange={(value) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field]: value === UNMAPPED ? undefined : Number(value),
                        }))
                      }
                    >
                      <SelectTrigger
                        aria-label={`Colonne source pour ${label}`}
                        aria-invalid={isMissing}
                        aria-describedby={isMissing ? REQUIRED_ALERT_ID : undefined}
                        className={isMissing ? 'border-error' : undefined}
                      >
                        <SelectValue placeholder="Non mappé" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNMAPPED}>Non mappé</SelectItem>
                        {columnOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted">{sampleValues(parsed, columnIndex)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {!isValid && (
        <Alert id={REQUIRED_ALERT_ID} variant="destructive">
          <AlertDescription>
            {missingRequired.map(({ label }) => label).join(' et ')}{' '}
            {missingRequired.length > 1 ? 'doivent' : 'doit'} être mappé
            {missingRequired.length > 1 ? 's' : ''} pour continuer.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          Retour
        </Button>
        <Button type="button" disabled={!isValid} onClick={() => onConfirm(mapping)}>
          Continuer
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Preview + confirm step component**

At roster scale (an 80-player club) a flat table where most rows read
"Créer" buries the handful of exceptions an admin actually needs to
check. This adds a segmented filter (the same on-brand pressed-chip
pattern `EventRsvpControl.tsx` already uses for its RSVP toggle, reusing
`shadow-segment-active`) to jump straight to conflicts or ignored rows, a
sticky table header (via `Table`'s new `containerClassName` from Step 1)
so column labels stay visible while scrolling a long roster, and a
mobile card list in place of a cramped table — mirroring the same
desktop-table/mobile-card split `MembersPage.tsx` already uses for its
own player list, via the same `useIsDesktopViewport` hook. A genuinely
empty file (header row only, no data) gets `EmptyState` with a way back;
a file that resolves but leaves nothing committable (every row is a
conflict or gets skipped) keeps the audit table visible instead of
hiding it behind an empty state, since that table full of "Conflit" rows
*is* the useful information in that case:

```tsx
// app/src/clubs/playerImport/PlayerImportPreviewStep.tsx
import { useMemo, useState, type RefObject } from 'react';
import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Badge } from '@basketeasy/ui/badge';
import { Button } from '@basketeasy/ui/button';
import { Card } from '@basketeasy/ui/card';
import { EmptyState } from '@basketeasy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@basketeasy/ui/table';
import { cn } from '@basketeasy/ui/cn';
import { focusRing } from '@basketeasy/ui/focus-ring';
import { useIsDesktopViewport } from '../../hooks/useIsDesktopViewport';
import type { ResolvedImportRow } from './resolveImportRows';

type ActionType = ResolvedImportRow['action']['type'];
type FilterValue = 'all' | 'create' | 'update' | 'conflict' | 'excluded';

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'create', label: 'Créer' },
  { value: 'update', label: 'Mettre à jour' },
  { value: 'conflict', label: 'Conflits' },
  { value: 'excluded', label: 'Ignorées' },
];

const ACTION_LABEL: Record<ActionType, string> = {
  create: 'Créer',
  update: 'Mettre à jour',
  conflict: 'Conflit',
  skip: 'Ignorée : nom manquant',
  ignored: 'Ignorée : type de licence',
};

function badgeVariant(type: ActionType): 'secondary' | 'outline' {
  return type === 'update' ? 'secondary' : 'outline';
}

function badgeClassName(type: ActionType): string | undefined {
  if (type === 'conflict') return 'border-error bg-error-tint text-error';
  if (type === 'skip' || type === 'ignored') return 'text-muted';
  return undefined;
}

function matchesFilter(filter: FilterValue, type: ActionType): boolean {
  if (filter === 'all') return true;
  if (filter === 'excluded') return type === 'skip' || type === 'ignored';
  return filter === type;
}

function countFor(filter: FilterValue, counts: Record<ActionType, number>, total: number): number {
  if (filter === 'all') return total;
  if (filter === 'excluded') return counts.skip + counts.ignored;
  return counts[filter];
}

export function PlayerImportPreviewStep({
  resolvedRows,
  isSubmitting,
  headingRef,
  onBack,
  onConfirm,
}: {
  resolvedRows: ResolvedImportRow[];
  isSubmitting: boolean;
  headingRef: RefObject<HTMLHeadingElement>;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const isDesktop = useIsDesktopViewport();
  const [filter, setFilter] = useState<FilterValue>('all');

  const counts = useMemo(
    () =>
      resolvedRows.reduce(
        (acc, { action }) => {
          acc[action.type]++;
          return acc;
        },
        { create: 0, update: 0, conflict: 0, skip: 0, ignored: 0 },
      ),
    [resolvedRows],
  );
  const committable = counts.create + counts.update;
  const excluded = counts.skip + counts.ignored;

  const filteredRows = useMemo(
    () => resolvedRows.filter(({ action }) => matchesFilter(filter, action.type)),
    [resolvedRows, filter],
  );

  const heading = (
    <h2
      ref={headingRef}
      tabIndex={-1}
      className="font-heading text-2xl font-bold text-charcoal outline-none"
    >
      Vérifier et confirmer
    </h2>
  );

  if (resolvedRows.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {heading}
        <EmptyState
          title="Fichier vide"
          description="Le fichier ne contient aucune ligne de données après l'en-tête. Revenez à l'étape précédente pour vérifier le fichier ou le mappage."
          action={
            <Button variant="outline" onClick={onBack}>
              Retour
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {heading}

      <p aria-live="polite" className="text-sm text-muted">
        {counts.create} création{counts.create !== 1 ? 's' : ''}, {counts.update} mise
        {counts.update !== 1 ? 's' : ''} à jour, {counts.conflict} conflit
        {counts.conflict !== 1 ? 's' : ''}, {excluded} ligne{excluded !== 1 ? 's' : ''} ignorée
        {excluded !== 1 ? 's' : ''}.
      </p>

      {committable === 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            Aucune ligne ne sera importée avec le mappage actuel. Revenez à l&apos;étape
            précédente pour l&apos;ajuster, ou vérifiez les conflits ci-dessous.
          </AlertDescription>
        </Alert>
      )}

      <div
        role="group"
        aria-label="Filtrer l'aperçu"
        className="flex w-fit flex-wrap overflow-hidden rounded-md border border-border bg-sunk"
      >
        {FILTERS.map((option, index) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              'min-h-9 whitespace-nowrap px-3 text-sm font-medium transition-colors',
              focusRing,
              index > 0 && 'border-l border-border-strong',
              filter === option.value
                ? 'bg-blue-green text-cream shadow-segment-active'
                : 'bg-surface text-muted hover:bg-sunk',
            )}
          >
            {option.label} ({countFor(option.value, counts, resolvedRows.length)})
          </button>
        ))}
      </div>

      {filteredRows.length === 0 ? (
        <p className="text-sm text-muted">Aucune ligne ne correspond à ce filtre.</p>
      ) : isDesktop ? (
        <Table containerClassName="max-h-96 overflow-y-auto rounded-lg border border-border">
          <TableHeader className="sticky top-0 z-10 bg-surface">
            <TableRow>
              <TableHead>Prénom</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map(({ row, action }, index) => (
              <TableRow key={index}>
                <TableCell>{row.firstName || '—'}</TableCell>
                <TableCell>{row.lastName || '—'}</TableCell>
                <TableCell>
                  <Badge variant={badgeVariant(action.type)} className={badgeClassName(action.type)}>
                    {ACTION_LABEL[action.type]}
                  </Badge>
                  {action.type === 'conflict' && (
                    <span className="ml-2 text-xs text-muted">déjà licencié dans un autre club</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {filteredRows.map(({ row, action }, index) => (
            <Card key={index} className="flex flex-col gap-1.5 bg-surface-2 p-3">
              <span className="font-medium text-charcoal">
                {row.firstName || '—'} {row.lastName || '—'}
              </span>
              <div>
                <Badge variant={badgeVariant(action.type)} className={badgeClassName(action.type)}>
                  {ACTION_LABEL[action.type]}
                </Badge>
              </div>
              {action.type === 'conflict' && (
                <span className="text-xs text-muted">déjà licencié dans un autre club</span>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onBack}>
          Retour
        </Button>
        <Button type="button" disabled={committable === 0} loading={isSubmitting} onClick={onConfirm}>
          Importer {committable} joueur{committable !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Page component owning the step state machine**

Owns focus management (every step transition moves focus to the new
step's own `<h2>`, so a screen-reader or keyboard user gets clear
feedback that something happened) and preserves the mapping when the
admin goes back from preview to fix it, instead of losing it and
re-guessing from scratch:

```tsx
// app/src/pages/PlayerImportPage.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageContainer } from '@basketeasy/ui/page-container';
import { Heading } from '@basketeasy/ui/heading';
import { Card, CardContent } from '@basketeasy/ui/card';
import { toast } from '@basketeasy/ui/toast-store';
import type { ImportPlayersRow } from '@basketeasy/types/players';
import { usePlayerList } from '../clubs/usePlayerList';
import { usePlayerImport } from '../clubs/usePlayerImport';
import { getClubErrorMessage } from '../clubs/clubErrorMessages';
import { PlayerImportSteps } from '../clubs/playerImport/PlayerImportSteps';
import { PlayerImportUploadStep } from '../clubs/playerImport/PlayerImportUploadStep';
import { PlayerImportMappingStep } from '../clubs/playerImport/PlayerImportMappingStep';
import { PlayerImportPreviewStep } from '../clubs/playerImport/PlayerImportPreviewStep';
import type { ParsedSpreadsheet } from '../clubs/playerImport/parseSpreadsheet';
import type { ImportTargetField } from '../clubs/playerImport/columnMapping';
import { resolveImportRows } from '../clubs/playerImport/resolveImportRows';

type Step =
  | { name: 'upload' }
  | { name: 'map'; parsed: ParsedSpreadsheet }
  | { name: 'preview'; parsed: ParsedSpreadsheet; mapping: Partial<Record<ImportTargetField, number>> };

const STEP_INDEX: Record<Step['name'], 0 | 1 | 2> = { upload: 0, map: 1, preview: 2 };

export function PlayerImportPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ name: 'upload' });
  const [lastMapping, setLastMapping] = useState<Partial<Record<ImportTargetField, number>>>();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Every step transition, forward or back, moves focus to the new step's
  // own heading. Otherwise focus stays on whatever button triggered the
  // transition (gone from the DOM in the upload -> map case, or just
  // stale), which for a screen-reader or keyboard user reads as nothing
  // having happened.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step.name]);

  const { data: allPlayersResult } = usePlayerList(clubId!, { pageSize: 1000 });
  const existingPlayers = useMemo(() => allPlayersResult?.items ?? [], [allPlayersResult]);

  const { mutate: importPlayers, isPending } = usePlayerImport(clubId!);

  const resolvedRows = useMemo(() => {
    if (step.name !== 'preview') return [];
    return resolveImportRows(step.parsed.rows, step.mapping, existingPlayers, clubId!);
  }, [step, existingPlayers, clubId]);

  const handleConfirm = () => {
    const rows: ImportPlayersRow[] = resolvedRows
      .filter(({ action }) => action.type === 'create' || action.type === 'update')
      .map(({ row }) => row);

    importPlayers(rows, {
      onSuccess: (result) => {
        toast({
          variant: 'success',
          title: 'Import terminé',
          description: `${result.created} créé(s), ${result.updated} mis à jour, ${result.conflicts} conflit(s).`,
        });
        navigate(`/clubs/${clubId}/members?tab=players`);
      },
      onError: (err) =>
        toast({
          variant: 'destructive',
          title: "Échec de l'import",
          description: getClubErrorMessage(err),
        }),
    });
  };

  return (
    <PageContainer size="lg">
      <Heading as="h1" size="3xl">
        Importer les licenciés
      </Heading>

      <PlayerImportSteps current={STEP_INDEX[step.name]} />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          {step.name === 'upload' && (
            <PlayerImportUploadStep
              headingRef={headingRef}
              onParsed={(parsed) => setStep({ name: 'map', parsed })}
            />
          )}

          {step.name === 'map' && (
            <PlayerImportMappingStep
              parsed={step.parsed}
              initialMapping={lastMapping}
              headingRef={headingRef}
              onBack={() => setStep({ name: 'upload' })}
              onConfirm={(mapping) => {
                setLastMapping(mapping);
                setStep({ name: 'preview', parsed: step.parsed, mapping });
              }}
            />
          )}

          {step.name === 'preview' && (
            <PlayerImportPreviewStep
              resolvedRows={resolvedRows}
              isSubmitting={isPending}
              headingRef={headingRef}
              onBack={() => setStep({ name: 'map', parsed: step.parsed })}
              onConfirm={handleConfirm}
            />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
```

- [ ] **Step 8: Route and entry button**

In `app/src/App.tsx`, add inside the `ProtectedRoute` block, next to the members route:

```tsx
<Route path="/clubs/:clubId/import-players" element={<PlayerImportPage />} />
```

and import `PlayerImportPage` at the top.

In `app/src/pages/MembersPage.tsx`, add `Link` to the existing `react-router-dom` import (currently `import { useParams, useSearchParams } from 'react-router-dom';` — it does not import `Link` today, unlike some other page files, so this is a real addition, not a duplicate):

```tsx
import { Link, useParams, useSearchParams } from 'react-router-dom';
```

Then, inside the `players` tab's admin-only block (around the existing "Ajouter un joueur" `Dialog`, line ~552), add a link button next to it, following the same `Button asChild` + `Link` idiom `TeamRow.tsx` and `TeamListingCard.tsx` already use elsewhere in this codebase for a button that navigates instead of acting in place:

```tsx
{isAdmin && (
  <div className="flex flex-wrap gap-2">
    <Dialog open={isAddPlayerOpen} onOpenChange={setIsAddPlayerOpen}>
      {/* existing dialog trigger/content unchanged */}
    </Dialog>
    <Button asChild variant="outline">
      <Link to={`/clubs/${clubId}/import-players`}>Importer les licenciés</Link>
    </Button>
  </div>
)}
```

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter @basketeasy/ui exec tsc --noEmit && pnpm --filter @basketeasy/app exec tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 10: Manual verification in the dev server**

Run: start the app dev server (`pnpm --filter @basketeasy/app dev`), log in as a club admin, navigate to a club's Membres → Joueurs tab, click "Importer les licenciés". Verify: the dropzone accepts both a dragged-and-dropped file and a click-to-browse file; an unmapped required field blocks "Continuer" with a visible reason; the live sample column updates as columns are remapped; "Retour" from the preview step returns to mapping with the previous choices intact; the segmented filter narrows the preview table to just one action type; upload a small `.csv` with a header row (`Prénom,Nom`) and two data rows, walk through mapping and preview, confirm, and verify the toast and that the new players appear in the roster list.

- [ ] **Step 11: Commit**

```bash
git add packages/@basketeasy/ui/package.json packages/@basketeasy/ui/src/components/Table.tsx app/src/clubs/playerImport app/src/pages/PlayerImportPage.tsx app/src/App.tsx app/src/pages/MembersPage.tsx
git commit -m "feat(app): player import wizard (upload, map, preview, confirm)"
```

---

### Task 12: `PlayerImportPage` happy-path component test

**Files:**
- Create: `app/src/pages/PlayerImportPage.test.tsx`

**Interfaces:**
- Consumes: `PlayerImportPage` (Task 11); existing MSW test setup conventions used elsewhere in `app/src/pages/*.test.tsx` (check an existing page test, e.g. one covering `MembersPage`, for the exact MSW/QueryClient/router wrapper boilerplate this repo uses, and match it — this task doesn't repeat that boilerplate here since it must match whatever the existing pattern is).

- [ ] **Step 1: Locate the existing page-test wrapper pattern**

Before writing this test, read one existing `*.test.tsx` for a protected, club-scoped page (e.g. search `app/src/pages/*.test.tsx` for one that renders inside a `MemoryRouter` with a `QueryClientProvider` and an MSW `setupServer`) and copy its exact wrapper/render helper — this plan doesn't restate that boilerplate to avoid it drifting out of sync with the real pattern.

- [ ] **Step 2: Write the test**

Using the wrapper found in Step 1, write one test that:
1. Renders `PlayerImportPage` at route `/clubs/club-1/import-players` with an MSW handler for `GET /clubs/club-1/players` returning `{ items: [], total: 0, page: 1, pageSize: 1000 }` and one for `POST /clubs/club-1/players/import` returning `{ created: 1, updated: 0, conflicts: 0 }`.
2. Uploads a `File` built in-test from a CSV string (`new File(['Prénom,Nom\nThéo,Dupont'], 'export.csv', { type: 'text/csv' })`) via `fireEvent.change` on the file input (query it by `input[type="file"]` — it's visually hidden with `sr-only`, not `display: none`, but still queryable and present in the DOM either way).
3. Waits for the mapping step to render (`await screen.findByText('Continuer')`), clicks it (mapping is pre-guessed from the CSV headers, so no manual mapping needed — both required fields are mapped, so the button is enabled and no blocking `Alert` renders).
4. Waits for the preview step and asserts a row shows "Théo" / "Dupont" / "Créer" (the default filter is "Toutes", so the single row is visible without switching filters), then clicks **"Importer 1 joueur"** (singular — the button pluralizes on the count, so assert the exact singular form here, not "joueur(s)").
5. Asserts the POST body sent to MSW matched `{ rows: [{ firstName: 'Théo', lastName: 'Dupont' }] }` and that navigation occurred (or, if the wrapper doesn't support asserting navigation, that a success toast rendered).

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @basketeasy/app exec vitest run PlayerImportPage`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/pages/PlayerImportPage.test.tsx
git commit -m "test(app): player import happy-path coverage"
```

---

### Task 13: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Format check the touched files**

Run: `pnpm exec prettier --check server/src/clubs server/src/teams server/prisma/schema.prisma app/src/clubs app/src/pages/PlayerImportPage.tsx app/src/App.tsx packages/@basketeasy/types/teams.ts packages/@basketeasy/types/players.ts packages/@basketeasy/ui/package.json packages/@basketeasy/ui/src/components/Table.tsx`
Expected: no unformatted files. If any are flagged, run `pnpm format` and re-check.

- [ ] **Step 2: Lint the touched packages**

Run: `pnpm --filter @basketeasy/server exec eslint src/clubs src/teams --max-warnings 0`
Run: `pnpm --filter @basketeasy/app exec eslint src/clubs src/pages/PlayerImportPage.tsx src/App.tsx --max-warnings 0`
Run: `pnpm --filter @basketeasy/ui exec eslint src/components/Table.tsx --max-warnings 0`
Expected: no errors.

- [ ] **Step 3: Run the full server and app test suites**

Run: `pnpm --filter @basketeasy/server test`
Run: `pnpm --filter @basketeasy/app test`
Expected: PASS, no regressions from the `Gender` rename or the new import code.

- [ ] **Step 4: Build both packages**

Run: `pnpm --filter @basketeasy/server build`
Run: `pnpm --filter @basketeasy/app build`
Expected: both succeed.

- [ ] **Step 5: Note the FBI export caveat for whoever pilots this**

No code step — just a reminder carried from the spec: before relying on this with a real club, get one real FBI "Éditions" export and diff its header row against `KNOWN_LABELS` in `columnMapping.ts` (Task 8); add any missing label variants there rather than changing the underlying data model.
