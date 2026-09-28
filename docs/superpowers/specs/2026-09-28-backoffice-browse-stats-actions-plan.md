# Back-office v2: implementation plan

Design record: [`2026-09-28-backoffice-browse-stats-actions-design.md`](./2026-09-28-backoffice-browse-stats-actions-design.md)

Six phases, one PR each, **stacked**: each branch starts from the previous one, and each PR
targets the previous phase's branch until that one merges (then it is retargeted to `main`).
Every phase leaves the app working and CI green on its own.

| Phase | Branch                             | Base    | Content                               |
| ----- | ---------------------------------- | ------- | ------------------------------------- |
| 0     | `claude/vigilant-einstein-c3zfvz`  | `main`  | This design record + plan (docs only) |
| 1     | `claude/backoffice-p1-read-api`    | phase 0 | Types, redaction, browse endpoints    |
| 2     | `claude/backoffice-p2-browse-ui`   | phase 1 | Canvas, then list/detail pages        |
| 3     | `claude/backoffice-p3-search`      | phase 2 | Search endpoint + header box + page   |
| 4     | `claude/backoffice-p4-stats`       | phase 3 | Stats endpoint + dashboards           |
| 5     | `claude/backoffice-p5-actions`     | phase 4 | Migration, support actions, dialogs   |
| 6     | `claude/backoffice-p6-create-club` | phase 5 | Club creation                         |

**Design gate (phases 2–6):** the first step of every phase with UI is a Claude Design canvas in
the Parquet system, shared with the product owner. No frontend code is written until it's
validated. The canvas link goes in the PR description; screenshots of the built pages
(`pnpm mock-api` + a fixtures file under `scripts/fixtures/`) go in the test plan.

Each PR description names every auth/guard/PII change it makes (the `pr-scope.yml` rule). Phases
1, 5 and 6 touch authorization and personal data, and must say so.

---

## Phase 1: read API

**Types** (`packages/@basketeasy/types`), new subpath files + `exports` entries:

- `platform-admin-browse.ts`: `AdminPersonRef`, `AdminClubSummary`, `AdminClubDetail`,
  `AdminClubMember`, `AdminTeamSummary`, `AdminTeamDetail`, `AdminRosterEntry`,
  `AdminUserSummary`, `AdminUserDetail`, `AdminPlayerSummary`, `AdminPlayerDetail`,
  `AdminEventSummary`, `AdminEventDetail`, `AdminScoresheetSummary`, and one `…Query` type per
  list.
- `platform-admin.ts` keeps login / retention / audit / export / erase. `RedactedUserSummary` and
  the v1 `PlatformUserDetail` are replaced by the browse types and deleted in the same change
  (dead-code rule).

**Server** (`server/src/platform-admin/`):

1. `redaction.ts`: `toPersonRef(role, row)`, `initialsOf`, `isMinor` reuse from
   `@basketeasy/types/parental-consent`. Spec: SUPPORT output never contains the name or local
   part; DATA_OFFICER output is complete.
2. `PlatformAdminGuard` already attaches the grant; expose the caller's `PlatformRole` to handlers
   through a `@CurrentPlatformRole()` decorator rather than a second lookup.
3. Split the service: `platform-admin-browse.service.ts` (lists + details), leaving login,
   retention, export and erasure in `platform-admin.service.ts`. One controller file per area
   (`admin-clubs.controller.ts`, `admin-teams.controller.ts`, `admin-users.controller.ts`,
   `admin-players.controller.ts`, `admin-events.controller.ts`), all `@Controller('admin/…')` with
   `JwtAuthGuard, PlatformAdminGuard`.
4. DTOs with `class-validator` for every list query (`IsUUID`, `IsEnum`, `IsBooleanString`,
   `IsISO8601`, page/pageSize bounds). `q` on people: the service applies substring vs exact
   e-mail per role, not the DTO.
5. `GET /admin/users/:id` opens to SUPPORT (redacted, no audit row). DATA_OFFICER keeps the
   awaited `ADMIN_PII_VIEWED` before returning. `GET /admin/players/:id` gets the same treatment
   with `subjectPlayerId`.
6. `GET /admin/users` gains the filters; `inactiveSoon=true` reproduces the v1 list. The v1
   `listInactiveSoonUsers` is folded in.
7. `GET /admin/audit-log` gains `playerId` (matches `metadata.subjectPlayerId`).

**Tests:** service specs per list (filters, pagination, bounded query count via Prisma mock call
counts), redaction spec, controller-level role spec (SUPPORT gets initials, DATA_OFFICER gets
names, audit row only for DATA_OFFICER detail).

**Frontend in this phase:** only what keeps the build green (`AdminUsersPage` /
`AdminUserDetailPage` adapted to the new types, no redesign).

**Docs:** update CLAUDE.md's Platform back-office section ("List views carry no PII" becomes the
per-role rule; `GET /admin/users/:id` open to SUPPORT redacted).

## Phase 2: browse UI

1. **Canvas:** list page (filters bar + table + mobile cards), club detail with tabs, user detail
   (linked clubs/teams/children), player detail, event detail, redacted vs full rendering of a
   person. Validate.
2. `app/src/admin/`: restructure into folders per area (`clubs/`, `teams/`, `users/`,
   `players/`, `events/`, `scoresheets/`, `shared/`).
3. `shared/`: `AdminPersonLink` (renders `AdminPersonRef`, masked badge), `AdminRecordLink`
   (club/team/event), `useAdminListParams` (filters + page in the URL), `AdminFilterBar`.
4. Pages + hooks per the design record's route table; `queryKeys.ts` extended; person detail
   queries keep `refetchOnWindowFocus: false` (each fetch is an audit row).
5. `AdminShell` nav: Tableau de bord (placeholder until phase 4), Clubs, Équipes, Utilisateurs,
   Joueurs, Feuilles de marque, Rétention, Journal d'audit.
6. Retention page moves to `/admin/retention`; `/admin` temporarily redirects to `/admin/clubs`.

**Tests:** Vitest + RTL per page: query branches, filter → URL, redacted rendering, links point to
the right routes. **Screenshots:** a new `scripts/fixtures/admin-browse.json`.

## Phase 3: global search

1. **Canvas:** header search box with grouped dropdown, full results page, "id not found" state.
2. `GET /admin/search?q=` (`platform-admin-search.service.ts`): UUID → parallel `findUnique`
   across the five tables; otherwise per-role matching, 5 per kind.
3. `AdminSearchBox` in `AdminShell` (debounced 300 ms, keyboard navigable, Enter on a single exact
   hit navigates), `/admin/search` page.

**Tests:** service spec (UUID in each table, SUPPORT exact e-mail only, DATA_OFFICER substring),
component tests for keyboard navigation and redirect.

## Phase 4: stats

1. **Canvas:** global dashboard (range picker, three sections of tiles, weekly series, bars),
   the same block embedded in club detail's Statistiques tab, empty/loading states. Follow the
   `dataviz` skill with the Parquet palette.
2. Types: `platform-admin-stats.ts` (`AdminStatsRange`, `AdminStats` with `growth`, `engagement`,
   `health`, each metric typed; series as `{ weekStart: string; value: number }[]`).
3. `platform-admin-stats.service.ts`: one method per section, each metric one aggregate query,
   all in `Promise.all`; weekly series via one `$queryRaw` per series with
   `date_trunc('week', "createdAt" AT TIME ZONE 'Europe/Paris')`; `clubId` scoping through
   `ClubMembership` / `ClubTeam` / `Player.clubId`. Season bounds reuse `seasonWindow` / `seasonYearFor` from `server/src/team-stats/team-stats.service.ts`.
4. `GET /admin/stats?range=&clubId=`, both roles (aggregates only, no person refs).
5. Frontend: `AdminStatsPanel` (shared by `/admin` and the club tab), tiles with a link to the
   pre-filtered list where the design record marks "(link)". Add any filter those links need that
   phase 1 missed.
6. `/admin` becomes the dashboard.

**Tests:** service spec per metric with fixture counts (including a CTC team counted in both
clubs, and the zero/empty case); a component test that each "(link)" tile builds the right URL.

## Phase 5: support actions

1. **Canvas:** "Actions support" card on user / club / team / player / scoresheet pages, the
   confirm dialog (summary + reason), danger variant, success toast.
2. Migration (hand-written, per the sandbox rule): `AuditEventType` + `ADMIN_SUPPORT_ACTION`,
   `ParentalConsentSource` + `PLATFORM_STAFF`; `prisma generate`.
3. Types: `platform-admin-actions.ts` (`AdminSupportAction` union, one request type per action,
   all extending `{ reason: string }`).
4. `platform-admin-actions.service.ts`: each action = domain-service call + audit row in one
   transaction. Where a domain method isn't transaction-aware, either give it an optional `tx`
   parameter or write the audit row after the write inside the same `$transaction`, never after
   it. The last-ADMIN refusal for role change / removal lives here.
5. Routes per the design record's table, both roles, `ReasonDto` shared with erase/export
   (extract the 10–500 rule into one DTO base).
6. Audit log page: `action` filter, human-readable action labels.
7. Frontend: one dialog per action, react-hook-form + zod, `setError('root')` for 409s,
   `toast()` on success, invalidate the affected detail and list queries.

**Tests:** per action: happy path writes both the change and the audit row, refusal paths
(already verified, last ADMIN, CONFIRMED sheet, club not linked), audit row absent when the
write fails. Component tests for reason validation and 409 display.

**Docs:** CLAUDE.md: back-office writes, the `ADMIN_SUPPORT_ACTION` rule, the new consent source.

## Phase 6: club creation

1. **Canvas:** "Créer un club" button on the clubs list, dialog with name, FFBB code, first-admin
   picker (search), unverified warning.
2. `POST /admin/clubs` → `ClubsService.createClub` + audit row (`CLUB_CREATED`) in one
   transaction; FFBB-code conflict surfaces as a field error.
3. Dialog → navigate to the new club's detail page on success.

**Tests:** creation + membership + audit row; FFBB conflict; unknown user 404.

## After phase 6

Write the impersonation spec (design record, "Next step") as its own document, with a threat
model, before any code.
