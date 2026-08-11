# Table filters + pagination Implementation Plan

**Goal:** Add search, sort, and offset pagination to all six existing list endpoints (club
members, players, teams, team-clubs/CTC partners, team roster, team events) and their table UIs,
so a 500+-member club doesn't fetch its whole membership on every page load. Full design
rationale in [`../specs/2026-08-11-table-filters-pagination-design.md`](../specs/2026-08-11-table-filters-pagination-design.md)
— read it first, this plan doesn't repeat the "why".

**Architecture:** Additive on the backend (new `@Query()` DTOs, `PaginatedResult<T>` response
shape replacing bare arrays — a breaking shape change, but there are no other API consumers
yet). Frontend: `apiClient.get` gains an optional params argument, list hooks gain a `params?`
argument and return `PaginatedResult<T>`, list-affecting mutations switch from `setQueryData` to
`invalidateQueries` (see spec's "Mutation cache-update convention change"). New shared
`Pagination` UI component; filter rows built inline per table section, not behind a generic
abstraction.

**Tech Stack:** no new dependencies — `class-validator`/`class-transformer` (backend),
`@tanstack/react-query` v5's `placeholderData`/`keepPreviousData` (frontend) are already in use.

## Global Constraints

- TypeScript strict mode; Prettier (`pnpm format`); ESLint per package.
- Jest for `server` (`*.spec.ts`), Vitest + RTL for `app`/`ui` (`*.test.ts(x)`).
- Types-first: `packages/@basketeasy/types` changes land before the DTOs/hooks that consume
  them, per root `CLAUDE.md`.
- `docs/frontend-stack.md`'s mutation-cache-update row gets updated alongside the hooks that
  now diverge from it (paginated lists use `invalidateQueries`; single-record caches
  unaffected).
- Every response-shape change (`T[]` → `PaginatedResult<T>`) touches: the service, the
  controller's return type, the frontend hook, and every test (backend spec + frontend MSW
  handler) that currently expects a bare array from that endpoint.

---

## File Structure

```
packages/@basketeasy/types/
  pagination.ts                                  # new — PaginatedResult<T>, PaginationParams, SortOrder
  club-members.ts                                # modify — ListClubMembersParams, ClubMemberSortBy
  players.ts                                      # modify — ListPlayersParams, PlayerSortBy
  teams.ts                                         # modify — ListTeamsParams/TeamSortBy, ListTeamClubsParams/TeamClubSortBy, ListTeamPlayersParams/TeamPlayerSortBy
  events.ts                                        # modify — ListEventsParams
  package.json                                     # modify — add "./pagination" export

server/src/
  common/
    pagination.ts                                  # new — resolvePagination(), MAX_PAGE_SIZE
    dto/pagination-query.dto.ts                    # new — PaginationQueryDto base class
  clubs/
    dto/list-club-members.dto.ts                   # new
    dto/list-players.dto.ts                        # new
    clubs.service.ts                                # modify — listMembers/listPlayers paginate+filter+sort
    clubs.service.spec.ts                           # modify
    clubs.controller.ts                             # modify — @Query() on both list routes
    clubs.controller.spec.ts                        # modify
  teams/
    dto/list-teams.dto.ts                           # new
    dto/list-team-clubs.dto.ts                      # new
    dto/list-team-players.dto.ts                    # new
    teams.service.ts                                # modify
    teams.service.spec.ts                           # modify
    teams.controller.ts                             # modify
    teams.controller.spec.ts                        # modify
  events/
    dto/list-events.dto.ts                          # new
    events.service.ts                               # modify
    events.service.spec.ts                          # modify
    events.controller.ts                            # modify
    events.controller.spec.ts                       # modify

packages/@basketeasy/ui/
  src/components/Pagination.tsx                     # new
  src/components/Pagination.test.tsx                # new
  src/components/Pagination.stories.tsx              # new
  package.json                                       # modify — add "./pagination" export

app/src/
  api/client.ts                                     # modify — get<T>(path, params?)
  api/client.test.ts                                 # modify
  hooks/useDebouncedValue.ts                         # new
  hooks/useDebouncedValue.test.ts                    # new
  clubs/
    queryKeys.ts                                     # modify — params-aware key factories
    useClubMemberList.ts                              # modify
    useClubMemberAdd.ts / useClubMemberRemove.ts      # modify — invalidateQueries
    usePlayerList.ts                                  # modify
    usePlayerCreate.ts / usePlayerUpdate.ts / usePlayerDelete.ts   # modify — invalidateQueries
    useTeamList.ts                                    # modify
    useTeamCreate.ts / useTeamUpdate.ts / useTeamDelete.ts          # modify — invalidateQueries
    useTeamClubList.ts                                # modify
    useTeamClubAdd.ts / useTeamClubRemove.ts          # modify — invalidateQueries
    useTeamPlayerList.ts                              # modify
    useTeamPlayerAdd.ts / useTeamPlayerRemove.ts      # modify — invalidateQueries
    useEventList.ts                                   # modify
    useEventCreate.ts / useEventUpdate.ts / useEventDelete.ts       # modify — invalidateQueries
  pages/
    MembersPage.tsx                                   # modify — filter rows + pagination, 3 tabs
    MembersPage.test.tsx                               # modify
    TeamDetailPage.tsx                                 # modify — filter rows + pagination, 3 sections
    TeamDetailPage.test.tsx                             # modify
  mocks/handlers.ts                                   # modify — paginated default shapes

docs/frontend-stack.md                               # modify — mutation cache-update convention split
```

---

## Task 1 — Shared pagination types

**Files:** create `packages/@basketeasy/types/pagination.ts`; modify `club-members.ts`,
`players.ts`, `teams.ts`, `events.ts`, `package.json`.

- [ ] `pagination.ts`:

  ```typescript
  export type SortOrder = 'asc' | 'desc';

  export interface PaginationParams {
    page?: number;
    pageSize?: number;
    search?: string;
  }

  export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
  }
  ```

- [ ] `club-members.ts` — add:

  ```typescript
  import type { PaginationParams, SortOrder } from './pagination';

  export type ClubMemberSortBy = 'name' | 'email' | 'joinedAt';

  export interface ListClubMembersParams extends PaginationParams {
    role?: ClubRole;
    sortBy?: ClubMemberSortBy;
    sortOrder?: SortOrder;
  }
  ```

- [ ] `players.ts` — add:

  ```typescript
  import type { PaginationParams, SortOrder } from './pagination';

  export type PlayerSortBy = 'name' | 'createdAt';

  export interface ListPlayersParams extends PaginationParams {
    sortBy?: PlayerSortBy;
    sortOrder?: SortOrder;
  }
  ```

- [ ] `teams.ts` — add:

  ```typescript
  import type { PaginationParams, SortOrder } from './pagination';

  export type TeamSortBy = 'name' | 'category' | 'createdAt';
  export interface ListTeamsParams extends PaginationParams {
    category?: TeamCategory;
    gender?: TeamGender;
    sortBy?: TeamSortBy;
    sortOrder?: SortOrder;
  }

  export type TeamClubSortBy = 'name' | 'linkedAt';
  export interface ListTeamClubsParams extends PaginationParams {
    sortBy?: TeamClubSortBy;
    sortOrder?: SortOrder;
  }

  export type TeamPlayerSortBy = 'name' | 'createdAt';
  export interface ListTeamPlayersParams extends PaginationParams {
    sortBy?: TeamPlayerSortBy;
    sortOrder?: SortOrder;
  }
  ```

- [ ] `events.ts` — add:

  ```typescript
  import type { PaginationParams, SortOrder } from './pagination';

  export interface ListEventsParams extends PaginationParams {
    from?: string;
    to?: string;
    sortOrder?: SortOrder;
  }
  ```

- [ ] `package.json` — add `"./pagination"` export entry alongside the existing ones.
- [ ] Verify: `pnpm --filter @basketeasy/types build` (or `tsc --noEmit` if there's no build
      script — check `package.json` scripts first).
- [ ] Commit: `feat(types): add pagination/filter/sort params for all list endpoints`

---

## Task 2 — Backend pagination helper + base DTO

**Files:** create `server/src/common/pagination.ts`, `server/src/common/dto/pagination-query.dto.ts`.

- [ ] `pagination.ts`:

  ```typescript
  export const DEFAULT_PAGE_SIZE = 25;
  export const MAX_PAGE_SIZE = 100;

  export interface PaginationArgs {
    page: number;
    pageSize: number;
    skip: number;
    take: number;
  }

  export function resolvePagination(page?: number, pageSize?: number): PaginationArgs {
    const resolvedPage = page && page > 0 ? page : 1;
    const resolvedPageSize =
      pageSize && pageSize > 0 ? Math.min(pageSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
    return {
      page: resolvedPage,
      pageSize: resolvedPageSize,
      skip: (resolvedPage - 1) * resolvedPageSize,
      take: resolvedPageSize,
    };
  }
  ```

- [ ] `dto/pagination-query.dto.ts`:

  ```typescript
  import { Transform, Type } from 'class-transformer';
  import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
  import type { PaginationParams } from '@basketeasy/types/pagination';

  export class PaginationQueryDto implements PaginationParams {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number;

    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsOptional()
    @IsString()
    @MaxLength(120)
    search?: string;
  }
  ```

- [ ] Add a `pagination.spec.ts` covering `resolvePagination`'s defaults, clamping above
      `MAX_PAGE_SIZE`, and page 2+'s `skip` math.
- [ ] Commit: `feat(server): add shared pagination DTO base and resolver`

---

## Task 3 — Club members: search, role filter, sort, pagination

**Files:** create `server/src/clubs/dto/list-club-members.dto.ts`; modify `clubs.service.ts`,
`clubs.service.spec.ts`, `clubs.controller.ts`, `clubs.controller.spec.ts`.

- [ ] `list-club-members.dto.ts` extends `PaginationQueryDto`, implements
      `ListClubMembersParams`, adds `role?: ClubRole` (`@IsIn(['ADMIN','MEMBER'])`),
      `sortBy?: ClubMemberSortBy` (`@IsIn(['name','email','joinedAt'])`), `sortOrder?: SortOrder`
      (`@IsIn(['asc','desc'])`), all `@IsOptional()`.
- [ ] `ClubsService.listMembers(clubId, query: ListClubMembersDto): Promise<PaginatedResult<ClubMember>>`
      — build `where: Prisma.ClubMembershipWhereInput` with `clubId`, optional `role`, optional
      `search` as `user: { OR: [email, firstName, lastName].map(contains-insensitive) }`; build
      `orderBy` via a small private switch (`email` → `user.email`; `joinedAt` → `createdAt`;
      default `name` → `[user.lastName, user.firstName]`); `Promise.all([findMany({..., skip,
  take}), count({where})])`; return `{ items, total, page, pageSize }`. Extract the existing
      inline membership→`ClubMember` mapping into a `toClubMember` private method (currently
      duplicated between `addMember` and `listMembers` — keep `addMember`'s inline shape as-is,
      it doesn't paginate).
- [ ] `ClubsController.listMembers` — add `@Query() query: ListClubMembersDto`, pass through,
      change return type to `Promise<PaginatedResult<ClubMember>>`.
- [ ] Update `clubs.service.spec.ts`/`clubs.controller.spec.ts` for the new signature; add cases:
      default call (no query) still orders by name; `role: 'ADMIN'` filters; `search` builds the
      OR clause; `sortBy: 'joinedAt', sortOrder: 'desc'`; `page: 2, pageSize: 10` computes
      `skip: 10, take: 10`; `count` is called with the same `where` as `findMany`.
- [ ] Run: `pnpm --filter @basketeasy/server test -- clubs.service.spec.ts clubs.controller.spec.ts`
- [ ] Commit: `feat(server): paginate, search, and filter club members list`

---

## Task 4 — Players: search, sort, pagination

**Files:** create `server/src/clubs/dto/list-players.dto.ts`; modify `clubs.service.ts` (same
file as Task 3 — do this task's edits in the same pass if convenient), `clubs.service.spec.ts`,
`clubs.controller.ts`, `clubs.controller.spec.ts`.

- [ ] `list-players.dto.ts` extends `PaginationQueryDto`, implements `ListPlayersParams`:
      `sortBy?: PlayerSortBy` (`@IsIn(['name','createdAt'])`), `sortOrder?: SortOrder`.
- [ ] `ClubsService.listPlayers(clubId, query: ListPlayersDto): Promise<PaginatedResult<Player>>`
      — `where` with `clubId` + optional `search` OR on `firstName`/`lastName`; `orderBy`
      defaults to `[lastName, firstName]` (matches current behavior), `createdAt` when
      `sortBy: 'createdAt'`; same `Promise.all([findMany, count])` shape as Task 3.
- [ ] `ClubsController.listPlayers` — `@Query() query: ListPlayersDto`, return type
      `Promise<PaginatedResult<Player>>`.
- [ ] Tests: default order unchanged, `search` filters, `sortBy: 'createdAt'`, pagination math,
      `count` uses the same `where`.
- [ ] Commit: `feat(server): paginate, search, and sort players list`

---

## Task 5 — Teams: search, category/gender filters, sort, pagination

**Files:** create `server/src/teams/dto/list-teams.dto.ts`; modify `teams.service.ts`,
`teams.service.spec.ts`, `teams.controller.ts`, `teams.controller.spec.ts`.

- [ ] `list-teams.dto.ts` extends `PaginationQueryDto`, implements `ListTeamsParams`:
      `category?: TeamCategory` (`@IsIn` the 7 enum values), `gender?: TeamGender`
      (`@IsIn(['MEN','WOMEN'])`), `sortBy?: TeamSortBy` (`@IsIn(['name','category','createdAt'])`),
      `sortOrder?: SortOrder`.
- [ ] `TeamsService.listTeams(clubId, query: ListTeamsDto): Promise<PaginatedResult<Team>>` —
      `where` keeps the existing `clubTeams: { some: { clubId } }` plus optional `category`,
      `gender`, and `search` as `name: { contains, mode: 'insensitive' }`; `orderBy` defaults to
      `name`, supports `category`/`createdAt`.
- [ ] `TeamsController.listTeams` — `@Query() query: ListTeamsDto`, return type
      `Promise<PaginatedResult<Team>>`.
- [ ] Tests: category filter, gender filter, combined, search, each `sortBy`, pagination math.
- [ ] Commit: `feat(server): paginate, search, and filter teams list`

---

## Task 6 — Team-clubs (CTC partners): search, sort, pagination

**Files:** create `server/src/teams/dto/list-team-clubs.dto.ts`; modify `teams.service.ts` (same
file as Task 5), `teams.service.spec.ts`, `teams.controller.ts`, `teams.controller.spec.ts`.

- [ ] `list-team-clubs.dto.ts` extends `PaginationQueryDto`, implements `ListTeamClubsParams`:
      `sortBy?: TeamClubSortBy` (`@IsIn(['name','linkedAt'])`), `sortOrder?: SortOrder`.
- [ ] `TeamsService.listTeamClubs(clubId, teamId, query: ListTeamClubsDto): Promise<PaginatedResult<TeamClubLink>>`
      — keeps `assertTeamInClub` first; `where` adds optional `search` as
      `club: { name: { contains, mode: 'insensitive' } }`; `orderBy` **always** leads with
      `{ isOwner: 'desc' }` (per spec: owner-first is structural, not a sort option), then either
      `club.name` (default/`sortBy: 'name'`) or `createdAt` (`sortBy: 'linkedAt'`).
- [ ] `TeamsController.listTeamClubs` — `@Query() query: ListTeamClubsDto`, return type
      `Promise<PaginatedResult<TeamClubLink>>`.
- [ ] Tests: owner always first regardless of `sortBy`/`sortOrder`, search filters by club name,
      pagination math, `assertTeamInClub` still runs (404 for a team not in the club) before
      any filtering.
- [ ] Commit: `feat(server): paginate, search, and sort team-clubs (CTC partners) list`

---

## Task 7 — Team roster (team players): search, sort, pagination

**Files:** create `server/src/teams/dto/list-team-players.dto.ts`; modify `teams.service.ts`
(same file), `teams.service.spec.ts`, `teams.controller.ts`, `teams.controller.spec.ts`.

- [ ] `list-team-players.dto.ts` extends `PaginationQueryDto`, implements
      `ListTeamPlayersParams`: `sortBy?: TeamPlayerSortBy` (`@IsIn(['name','createdAt'])`),
      `sortOrder?: SortOrder`.
- [ ] `TeamsService.listTeamPlayers(clubId, teamId, query: ListTeamPlayersDto): Promise<PaginatedResult<TeamPlayer>>`
      — `where` adds optional `search` as `player: { OR: [firstName, lastName].map(contains-insensitive) }`;
      `orderBy` defaults to `[player.lastName, player.firstName]` (unchanged), `createdAt` when
      requested.
- [ ] `TeamsController.listTeamPlayers` — `@Query() query: ListTeamPlayersDto`, return type
      `Promise<PaginatedResult<TeamPlayer>>`.
- [ ] Tests: search filters, `sortBy: 'createdAt'`, pagination math, `assertTeamInClub` still
      gates access.
- [ ] Commit: `feat(server): paginate, search, and sort team roster list`

---

## Task 8 — Events: search, date-range filter, sort, pagination

**Files:** create `server/src/events/dto/list-events.dto.ts`; modify `events.service.ts`,
`events.service.spec.ts`, `events.controller.ts`, `events.controller.spec.ts`.

- [ ] `list-events.dto.ts` extends `PaginationQueryDto`, implements `ListEventsParams`:
      `from?: string`, `to?: string` (both `@IsOptional() @IsISO8601()`), `sortOrder?: SortOrder`
      (`@IsIn(['asc','desc'])`) — no `sortBy`, events only ever sort by `startsAt`.
- [ ] `EventsService.listEvents(clubId, teamId, query: ListEventsDto): Promise<PaginatedResult<TeamEvent>>`
      — keeps `assertTeamInClub` first; `where` adds `startsAt: { gte: from, lte: to }` (only the
      bounds that were provided) and `search` as `OR` on `location`/`notes` (case-insensitive
      `contains`; `notes` is nullable so Prisma's `contains` on a null column simply doesn't
      match, no special-casing needed); `orderBy: { startsAt: sortOrder ?? 'asc' }`.
- [ ] `EventsController.listEvents` — `@Query() query: ListEventsDto`, return type
      `Promise<PaginatedResult<TeamEvent>>`.
- [ ] Tests: `from`/`to` filter (each alone and combined), search matches location or notes,
      `sortOrder: 'desc'`, pagination math, note that `createEvent`'s return type (`TeamEvent[]`,
      recurrence occurrences) is untouched — only the `GET` list route changes shape.
- [ ] Commit: `feat(server): paginate, search, and date-filter team events list`

---

## Task 9 — `apiClient` query-param support

**Files:** modify `app/src/api/client.ts`, `app/src/api/client.test.ts`.

- [ ] Add a private `buildQuery(params?: Record<string, string | number | boolean | undefined>): string`
      helper using `URLSearchParams`, skipping `undefined`/empty-string values.
- [ ] `apiClient.get<T>(path: string, params?: Record<string, string | number | boolean | undefined>)`
      appends `buildQuery(params)` to `path` before calling `request`. Every other method
      (`post`/`patch`/`delete`) is unchanged.
- [ ] Test: `get` with params serializes them into the query string in the request URL; `get`
      with no params (or all-`undefined` params) hits the bare path, unchanged from today.
- [ ] Commit: `feat(app): apiClient.get accepts optional query params`

---

## Task 10 — Query keys become params-aware

**Files:** modify `app/src/clubs/queryKeys.ts`.

- [ ] Every list-key factory gains an optional params argument appended to the tuple, e.g.:

  ```typescript
  export const clubMembersQueryKey = (clubId: string, params?: ListClubMembersParams) =>
    ['clubs', clubId, 'members', params ?? {}] as const;
  ```

  Apply the same shape to `clubPlayersQueryKey`, `clubTeamsQueryKey`, `teamClubsQueryKey`,
  `teamPlayersQueryKey`, `teamEventsQueryKey`. `clubsQueryKey`, `clubQueryKey`, `teamQueryKey`
  (single-record, non-paginated) are untouched.

- [ ] Commit: `feat(app): thread pagination/filter params into list query keys`

---

## Task 11 — `useDebouncedValue` hook

**Files:** create `app/src/hooks/useDebouncedValue.ts`, `app/src/hooks/useDebouncedValue.test.ts`.

- [ ] `useDebouncedValue<T>(value: T, delayMs = 300): T` — standard `useState` + `useEffect`
      with a `setTimeout`/`clearTimeout` pair.
- [ ] Test with fake timers: rapid updates within the delay only produce one final debounced
      value; the debounced value updates after the delay elapses.
- [ ] Commit: `feat(app): add useDebouncedValue hook`

---

## Task 12 — Club member list hook + mutations

**Files:** modify `useClubMemberList.ts`, `useClubMemberAdd.ts`, `useClubMemberRemove.ts` (+ any
colocated tests, e.g. `useClubMemberAdd.test.ts`).

- [ ] `useClubMemberList(clubId, params?: ListClubMembersParams, options?: { enabled?: boolean })`
      — `queryKey: clubMembersQueryKey(clubId, params)`,
      `queryFn: () => apiClient.get<PaginatedResult<ClubMember>>(`/clubs/${clubId}/members`, params)`,
      `placeholderData: keepPreviousData` (import from `@tanstack/react-query`).
- [ ] `useClubMemberAdd`/`useClubMemberRemove` — replace the `setQueryData` splice with
      `queryClient.invalidateQueries({ queryKey: clubMembersQueryKey(clubId) })` in `onSuccess`
      (per spec's cache-update convention split).
- [ ] Update/extend the existing `useClubMemberAdd.test.ts` for the new cache-invalidation
      behavior (assert a refetch happens, not a spliced array).
- [ ] Commit: `feat(app): paginate club member list hook, invalidate on mutation`

---

## Task 13 — Player list hook + mutations

**Files:** modify `usePlayerList.ts`, `usePlayerCreate.ts`, `usePlayerUpdate.ts`,
`usePlayerDelete.ts` (+ colocated tests).

- [ ] Same shape as Task 12: `usePlayerList(clubId, params?: ListPlayersParams, options?)`
      returns `PaginatedResult<Player>` with `keepPreviousData`; the three mutations switch to
      `invalidateQueries({ queryKey: clubPlayersQueryKey(clubId) })`.
- [ ] Note: `TeamDetailPage` also calls `usePlayerList(clubId)` unfiltered to compute
      `addablePlayers` (players not yet on the roster) for `TeamPlayerAddForm` — per spec, this
      call site passes `{ pageSize: MAX_PAGE_SIZE }` (no search/sort) rather than becoming
      paginated UI itself; document this as the accepted picker-scale limit, not a bug.
- [ ] Commit: `feat(app): paginate player list hook, invalidate on mutation`

---

## Task 14 — Team, team-club, team-player, event hooks + mutations

**Files:** modify `useTeamList.ts` + `useTeamCreate/Update/Delete.ts`; `useTeamClubList.ts` +
`useTeamClubAdd/Remove.ts`; `useTeamPlayerList.ts` + `useTeamPlayerAdd/Remove.ts`;
`useEventList.ts` + `useEventCreate/Update/Delete.ts`.

- [ ] Same pattern as Tasks 12-13, four times over: list hook gains `params?`, returns
      `PaginatedResult<T>`, `keepPreviousData`; every mutation on that resource switches to
      `invalidateQueries({ queryKey: <list>QueryKey(clubId[, teamId]) })`.
- [ ] `useEventCreate` returns `TeamEvent[]` (recurrence) — its mutation type is unaffected by
      this change; only its `onSuccess` cache update moves to `invalidateQueries`.
- [ ] Commit: `feat(app): paginate team/team-club/team-player/event list hooks, invalidate on mutation`

---

## Task 15 — `Pagination` UI component

**Files:** create `packages/@basketeasy/ui/src/components/Pagination.tsx`, `.test.tsx`,
`.stories.tsx`; modify `packages/@basketeasy/ui/package.json`.

- [ ] Props: `page: number`, `pageSize: number`, `total: number`, `onPageChange: (page: number) => void`,
      optional `pageSizeOptions?: number[]` + `onPageSizeChange?: (pageSize: number) => void`.
      Renders: result range text ("1–25 sur 342" / "Aucun résultat" when `total === 0`),
      previous/next `Button`s (disabled at the first/last page or when `total <= pageSize`), a
      "Page P / N" label, and — when `onPageSizeChange` is provided — a compact page-size
      `Select`.
- [ ] `.test.tsx`: renders the right range text, `onPageChange` fires with `page - 1`/`page + 1`
      on prev/next click, prev disabled on page 1, next disabled on the last page, whole control
      still renders sanely when `total === 0`.
- [ ] `.stories.tsx`: default/first-page/last-page/empty/with-page-size-select variants,
      matching the story shape of `Table.stories.tsx` or another existing component's stories.
- [ ] Add `"./pagination"` to `package.json`'s `exports`, pointing at
      `./src/components/Pagination.tsx`.
- [ ] Run: `pnpm --filter @basketeasy/ui test -- Pagination.test.tsx` and
      `pnpm --filter @basketeasy/ui lint`.
- [ ] Commit: `feat(ui): add Pagination component`

---

## Task 16 — `MembersPage` filter rows + pagination (3 tabs)

**Files:** modify `app/src/pages/MembersPage.tsx`, `app/src/pages/MembersPage.test.tsx`.

- [ ] Local state per tab (or a small shared shape) for `search` (raw), debounced via
      `useDebouncedValue`, plus `sortBy`/`sortOrder`/`page`/`pageSize`/`role` (members)/
      `category`+`gender` (teams). Changing any filter or the debounced search resets `page` to 1.
- [ ] **Membres tab:** search `Input` (placeholder "Rechercher un membre…"), role `SelectField`
      (Tous/Administrateur/Membre), sort `SelectField` (Nom/E-mail/Date d'adhésion + direction —
      simplest: one combined `SelectField` with options like "Nom (A→Z)"/"Nom (Z→A)" mapping to
      `sortBy`+`sortOrder` pairs, matching how `SelectField` is used elsewhere in this file),
      `Pagination` footer under the table. Pass `{ search: debouncedSearch, role, sortBy,
  sortOrder, page, pageSize }` to `useClubMemberList`.
- [ ] **Joueurs tab:** search `Input`, sort `SelectField` (Nom/Date de création), `Pagination`
      footer. Note: `linkedUserIds`/`emailByUserId`/`linkedPlayerNameByUserId` (computed from
      `members`/`players`) now only see the _current page's_ members/players — acceptable per
      spec (these are cross-references for the visible table rows, not the picker `<select>`s,
      which use the separate unfiltered high-`pageSize` fetch from Task 13).
- [ ] **Équipes tab:** search `Input`, category `SelectField` (reuse `TEAM_CATEGORY_OPTIONS` from
      `teamLabels.ts` + an "Toutes" option), gender `SelectField` (reuse `TEAM_GENDER_OPTIONS` +
      "Tous"), sort `SelectField`, `Pagination` footer.
- [ ] Update `MembersPage.test.tsx`: every `HttpResponse.json([...])` stub for `/members`,
      `/players`, `/teams` becomes `HttpResponse.json({ items: [...], total: N, page: 1,
  pageSize: 25 })`. Add new tests: typing in the members search box eventually (after
      debounce/`waitFor`) requests with `?search=...`; selecting a role filters; clicking "next"
      on a 2-page result set requests `page=2`.
- [ ] Run: `pnpm --filter @basketeasy/app test -- MembersPage.test.tsx`
- [ ] Commit: `feat(app): search/filter/sort/paginate members, players, and teams tables`

---

## Task 17 — `TeamDetailPage` filter rows + pagination (3 sections)

**Files:** modify `app/src/pages/TeamDetailPage.tsx`, `app/src/pages/TeamDetailPage.test.tsx`.

- [ ] Same per-section local-state pattern as Task 16.
- [ ] **Clubs partenaires:** search `Input` only (no filter dropdown — see spec table), sort
      `SelectField` (Nom/Date d'association), `Pagination` footer. Owner row still always shows
      first (backend enforces this regardless of `sortBy`).
- [ ] **Effectif (roster):** search `Input`, sort `SelectField` (Nom/Date d'ajout), `Pagination`
      footer. `addablePlayers` computation (players not yet rostered, for
      `TeamPlayerAddForm`) keeps using the club-wide `clubPlayers` query from Task 13's
      high-`pageSize` call, not this section's paginated/filtered roster query.
- [ ] **Événements:** search `Input`, optional `from`/`to` date inputs (simple native
      `<input type="date">` via `FormField`, not a date-range picker component — out of scope to
      build one), sort direction `SelectField` (Plus proche d'abord / Plus lointain d'abord),
      `Pagination` footer.
- [ ] Update `TeamDetailPage.test.tsx`: same array→`PaginatedResult` migration as Task 16 for
      `/clubs`, `/players` (roster), `/events`, plus the club-wide `/clubs/:clubId/players` used
      for `addablePlayers`. Add a search/pagination test for at least one section (roster is the
      most representative — mirrors the 500-player scale concern).
- [ ] Run: `pnpm --filter @basketeasy/app test -- TeamDetailPage.test.tsx`
- [ ] Commit: `feat(app): search/filter/sort/paginate team-clubs, roster, and events tables`

---

## Task 18 — Default MSW handlers + remaining test sweep

**Files:** modify `app/src/mocks/handlers.ts`; sweep every other `*.test.tsx`/`*.test.ts` under
`app/src` that stubs one of the six list endpoints.

- [ ] `handlers.ts`'s default `/clubs/:clubId/teams` and
      `/clubs/:clubId/teams/:teamId/events` handlers return
      `{ items: [], total: 0, page: 1, pageSize: 25 }` instead of `[]`.
- [ ] Grep `app/src` for every remaining `HttpResponse.json([` on one of the six list paths
      (`/members`, `/players`, `/teams` (both club-level and, distinctly, none needed for
      `/teams/:teamId` singular), `/clubs` under a team, `/players` under a team, `/events`) —
      likely candidates beyond Tasks 16-17: `PlayerRow.test.tsx`, `TeamRow.test.tsx` (if they
      render inside a page that fetches lists), `App.test.tsx`, `DashboardPage.test.tsx`, any
      test that renders `<App />` and hits a club/team route. Update each to the paginated shape.
- [ ] Run the full frontend suite: `pnpm --filter @basketeasy/app test`
- [ ] Commit: `test(app): migrate remaining list-endpoint mocks to paginated response shape`

---

## Task 19 — Docs + full verification pass

**Files:** modify `docs/frontend-stack.md`.

- [ ] Update the "Mutation cache updates" row in `docs/frontend-stack.md` per the spec's
      "Mutation cache-update convention change" section — keep the existing `setQueryData`
      guidance for single-record caches, add the `invalidateQueries`-for-paginated-lists
      exception with a one-line rationale (correct row position across arbitrary cached
      page/filter/sort combinations isn't derivable from a mutation response alone).
- [ ] Run, from repo root: `pnpm format`, then `pnpm --filter @basketeasy/types build` (or
      equivalent), `pnpm --filter @basketeasy/server lint && pnpm --filter @basketeasy/server test`,
      `pnpm --filter @basketeasy/ui lint && pnpm --filter @basketeasy/ui test`,
      `pnpm --filter @basketeasy/app lint && pnpm --filter @basketeasy/app test`, and both
      apps' `build`/`tsc --noEmit` to confirm the whole workspace still typechecks end to end.
- [ ] Commit: `docs: document paginated-list cache-invalidation convention`
- [ ] Push the branch, open the PR (see repo's `.github/pull_request_template.md` if present).

---

## Notes for whoever picks this plan up

- Tasks 3-8 (backend) can be done in any order relative to each other — they touch disjoint
  route/service pairs except Tasks 3-4 sharing `clubs.service.ts`/`clubs.controller.ts` and
  Tasks 5-7 sharing `teams.service.ts`/`teams.controller.ts`. Doing the shared-file tasks
  back-to-back avoids re-reading the same file twice.
- Tasks 9-11 (client plumbing) must land before Tasks 12-14 (hooks) — the hooks import from all
  three.
- Tasks 16-17 (page UI) depend on Task 15 (`Pagination` component) and Tasks 12-14 (hooks)
  being done first.
- Task 18 is a sweep and is easiest done last, once the "shape changed" grep surface is fully
  known from having done Tasks 16-17.
