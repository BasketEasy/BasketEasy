# Table filters + pagination — design

Status: approved
Date: 2026-08-11

## Why

Every list endpoint shipped so far (`GET /clubs/:clubId/members`, `.../players`, `.../teams`,
`.../teams/:teamId/clubs`, `.../teams/:teamId/players`, `.../teams/:teamId/events`) returns a
bare, unfiltered, unpaginated array. That's fine at demo scale but breaks down for the actual
target user: a CD44 club can have 500+ members and players. Fetching all of them on every page
load doesn't scale, and there's no way to find one member/player/event in a long list short of
`Ctrl+F`.

## Scope

All six existing list endpoints get: text search, pagination, and sort — plus the filters that
are actually meaningful for that resource (role for members, category/gender for teams). No new
tables are added; no new domain modules. `TeamsService`/`ClubsService`/`EventsService`'s
existing auth checks (`assertTeamInClub`, `findPlayerInClub`, etc.) are untouched — filtering
happens inside the same `where` clause, after those checks.

**Explicitly out of scope:** cursor pagination (offset is enough at this scale — see below),
a generic reusable "DataTable" abstraction (the six tables differ enough in columns/filters that
a one-size-fits-all component would fight every call site), and paginating the two
member-picker `<select>`s (`ClubMemberAddForm`'s implicit list via `ClubMember[]` prop,
`PlayerCreateForm`/`TeamPlayerAddForm`'s `linkableMembers`/`addablePlayers` props) — those need a
searchable combobox, not a paginated table, and stay on a single larger fetch (capped at the new
`MAX_PAGE_SIZE`) rather than growing this change into a combobox redesign.

## Pagination style: offset (page/pageSize), not cursor

Cursor pagination earns its cost at row counts orders of magnitude beyond what any single club
will have (hundreds, not millions), and these are admin-facing tables where "page 3 of 12" and
jump-to-page are the actual expected UX, not infinite scroll. Offset pagination is simpler to
implement, simpler for the frontend to reason about (`page` is state, not an opaque token to
thread through), and cheap enough at this scale.

## Response shape

New shared type, `packages/@basketeasy/types/pagination.ts`:

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

Every list endpoint's response changes from `T[]` to `PaginatedResult<T>`. This is a breaking
response-shape change — there are no other consumers of this API yet (no mobile client, no
public API contract), so no versioning/compat shim is needed; frontend hooks and their tests
change in the same PR.

Each domain's params type extends `PaginationParams` and lives in that domain's existing types
file (not a barrel in `pagination.ts`) — e.g. `packages/@basketeasy/types/club-members.ts` gets
`ListClubMembersParams`, per CLAUDE.md's "no barrel index.ts, one file per domain area, matching
`exports` entry" convention. `pagination.ts` only holds the two resource-agnostic shapes above.

Defaults: `page` defaults to 1, `pageSize` defaults to 25, capped at `MAX_PAGE_SIZE = 100`
server-side regardless of what the client requests (`server/src/common/pagination.ts`).

## Per-resource filters and sort fields

| Resource | Search matches | Extra filter(s) | `sortBy` options (default) | `sortOrder` default |
| --- | --- | --- | --- | --- |
| Club members | member email, first name, last name | `role` (`ADMIN`\|`MEMBER`) | `name` (default), `email`, `joinedAt` | `asc` |
| Players | first name, last name | — | `name` (default), `createdAt` | `asc` |
| Teams | team name | `category`, `gender` | `name` (default), `category`, `createdAt` | `asc` |
| Team-clubs (CTC partners) | partner club name | — | `name` (default), `linkedAt` | `asc` |
| Team roster (team players) | player first/last name | — | `name` (default), `createdAt` | `asc` |
| Events | location, notes | `from`/`to` (ISO date range on `startsAt`) | (`startsAt` always — no `sortBy` param, just `sortOrder`) | `asc` |

`name` sort always means "the human-readable label a user reads top-to-bottom" — last name then
first name for people, plain name for teams/clubs — matching each resource's existing default
`orderBy` (so the *default* list view is unchanged; only searching/filtering/paging are new).
Team-clubs keeps its existing "owner club always first" behavior as the primary sort key
regardless of `sortBy`, since that's a structural fact about the row (who can manage the CTC),
not a sortable attribute — `sortBy=name`/`linkedAt` only orders the partner clubs after it.

## Backend implementation

- `server/src/common/dto/pagination-query.dto.ts` — `PaginationQueryDto implements PaginationParams`,
  validated with `class-validator` (`@IsInt() @Min(1)` for `page`; `@IsInt() @Min(1) @Max(100)`
  for `pageSize`; `@IsString() @MaxLength(120)` + trim for `search`), all `@IsOptional()`. Every
  per-resource list DTO extends this and adds its own filter/sort fields, following the existing
  `class X implements Y` + `@Transform` trim pattern already used by `CreateClubDto` etc.
- `server/src/common/pagination.ts` — `resolvePagination(page?, pageSize?)` returning
  `{ page, pageSize, skip, take }`, with the `MAX_PAGE_SIZE` clamp as a defense-in-depth backstop
  behind the DTO's own `@Max(100)`.
- Each `listX` service method takes the validated DTO, builds a Prisma `where` (case-insensitive
  `contains` for search — Postgres `mode: 'insensitive'`), builds an `orderBy` from `sortBy`/
  `sortOrder`, and runs `Promise.all([findMany({ where, orderBy, skip, take }), count({ where })])`
  — one extra round trip, but the club/team ownership checks (`assertTeamInClub` etc.) already
  run before this, so there's no new authorization surface, just query shape.
- Controllers add `@Query() query: ListXDto` to the existing `@Get()` list route and pass it
  through unchanged — no new routes.

## Frontend implementation

- `apiClient.get<T>(path, params?)` gains an optional second argument: a
  `Record<string, string | number | boolean | undefined>` serialized to a query string
  (`undefined`/empty values dropped). This is additive — every existing no-param call site
  keeps working unchanged.
- Each `queryKeys.ts` list-key factory gains an optional params argument appended to the key
  tuple (e.g. `clubMembersQueryKey(clubId, params?)`). TanStack Query's default
  `invalidateQueries` prefix-matching means invalidating the bare `[..., 'members']` key still
  invalidates every paginated/filtered/sorted variant.
- Each list hook (`useClubMemberList`, `usePlayerList`, `useTeamList`, `useTeamClubList`,
  `useTeamPlayerList`, `useEventList`) gains a `params?: ListXParams` argument, threaded into
  both the query key and `apiClient.get`. Return type changes from `T[]` to
  `PaginatedResult<T>`. `placeholderData: keepPreviousData` (TanStack Query v5) keeps the old
  page's rows on screen while the next page loads, instead of a full-table loading flash.
- **Mutation cache-update convention change:** `docs/frontend-stack.md` currently mandates
  `setQueryData` with the mutation response over `invalidateQueries`, because the response has
  the full updated record. That still holds for single-record caches (`useClubShow`,
  `useTeamShow`), but breaks for paginated lists — a created/deleted row's correct position
  within an arbitrary cached `(page, search, sortBy, role, …)` combination isn't knowable from
  the mutation response alone, and there may be several such cached variants (e.g. the members
  tab open in one filter state, a stale cache entry from another). List-affecting mutations
  (`useClubMemberAdd`/`Remove`, `usePlayerCreate`/`Update`/`Delete`,
  `useTeamCreate`/`Update`/`Delete`, `useTeamClubAdd`/`Remove`, `useTeamPlayerAdd`/`Remove`,
  `useEventCreate`/`Update`/`Delete`) switch to
  `queryClient.invalidateQueries({ queryKey: <list>QueryKey(...) })` (prefix match, refetches
  every cached page/filter variant including the active one). `docs/frontend-stack.md`'s
  convention row is updated to document this split rather than silently diverging from it.
- New shared UI: `packages/@basketeasy/ui`'s `Pagination` component (prev/next, "page P / N",
  result count, optional page-size `Select`), with a colocated `.test.tsx` and `.stories.tsx`
  matching every other component in that package, plus a `./pagination` `exports` entry.
- New app-local hook `app/src/hooks/useDebouncedValue.ts` (not in the shared `ui` package — it's
  interaction logic, not a component) debounces the search `Input`'s value (300ms) before it
  flows into query params, so typing doesn't fire a request per keystroke.
- Each of the six table sections (three tabs in `MembersPage.tsx`, three sections in
  `TeamDetailPage.tsx`) gets a filter row (search `Input`, plus `SelectField`s for role/category/
  gender/sort where applicable) and a `Pagination` footer, built inline per section rather than
  behind a shared "table toolbar" abstraction — the filter sets genuinely differ per resource
  (members has a role filter, teams has two, roster/team-clubs/events have none beyond search),
  so a generic component would need as many escape hatches as sections it serves. Changing a
  filter or the search box resets `page` back to 1.

## Testing

- Backend: extend each service's `*.spec.ts` to assert the `where`/`orderBy`/`skip`/`take`
  passed to `findMany` and that `count` is called with the matching `where`; extend each
  controller's `*.spec.ts` to assert `@Query()` params are passed through. New cases: search
  filters correctly, role/category/gender filters correctly, sort direction, page 2 computes the
  right `skip`, `pageSize` is clamped to `MAX_PAGE_SIZE`.
- Frontend: `app/src/mocks/handlers.ts`'s default handlers move from bare `[]` to
  `{ items: [], total: 0, page: 1, pageSize: 25 }`; every existing `*.test.tsx`/`*.test.ts` that
  stubs one of the six list endpoints with `HttpResponse.json([...])` is updated to the
  paginated shape. New tests: typing in the search box filters (debounced), switching a filter
  select refetches with the right params and resets to page 1, clicking "next" advances the
  page and requests the right `skip`-equivalent (`page=2`), `Pagination` hides/disables
  appropriately at the first/last page and when `total <= pageSize`.

## Out of scope / explicit cuts

- Cursor pagination — not needed at this scale (see above).
- A generic `DataTable`/`useTable` abstraction — the six tables' filter sets differ enough that
  forcing a shared shape now would be premature; revisit if a seventh paginated table shows the
  pattern is actually uniform.
- Searchable combobox for the member/player picker `<select>`s in `ClubMemberAddForm`,
  `PlayerCreateForm`, `TeamPlayerAddForm` — these keep fetching a single page (capped at
  `MAX_PAGE_SIZE`) rather than becoming paginated/searchable themselves; a club past 100
  unlinked members hitting a truncated picker is a known, accepted gap to fix in a follow-up
  (typeahead combobox), not silently worked around here.
- URL-persisted filter/sort/page state (e.g. `?search=&sortBy=` query params on the page route,
  like the existing `?tab=` on `MembersPage`) — filters reset on navigation/reload. Worth adding
  later, not required for the 500-member scale problem this change targets.
