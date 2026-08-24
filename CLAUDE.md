# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repository.

## What BasketEasy is

A website/app to help amateur basketball clubs manage rosters, attendance, trainings, matches, results, and everything around club organization — launching Loire-Atlantique (CD44, France) first. See [`docs/brand.md`](./docs/brand.md) for brand and [`docs/market-research.md`](./docs/market-research.md) for the market this is built for.

**Positioning:** a companion layer to the FFBB's mandatory federal stack (FBI licensing, e-Marque V2 scoresheets), not a replacement for it — solving what neither the federation nor the generic incumbents (Kalisport, AssoConnect, SportEasy) cover: basketball-specific team-day tooling, multi-club team (CTC/entente) support, and shared municipal gym-slot visibility. Full detail in [`docs/brand.md`](./docs/brand.md).

**Brand:** BasketEasy · _"La gestion d'équipe, simplifiée."_ · orange `#D4622A` / blue-green `#1E5F74` / cream `#FAF5EF` / charcoal `#23201C` · Barlow Condensed (headings) + Inter (body). Full tokens in [`docs/brand.md`](./docs/brand.md).

## Architecture

Full diagrams (global, frontend, backend, ER model) are in [`docs/architecture.md`](./docs/architecture.md). Summary:

- **Client:** React SPA (Vite), calling the API through a single `ApiClient` wrapper (`app/src/api/client.ts`). TanStack Query owns server state once domain pages land; Context owns local UI state (auth, multi-club switcher).
- **API Gateway:** NestJS, REST, global `/api` prefix, guards + DTO validation pipes.
- **Domain modules:** Auth (built — see below); Clubs/Players (built, `server/src/clubs`); Teams (built — see below); Scheduling (créneaux + conflict detection), Scoresheet (AI-assisted capture), Payments (HelloAsso), Subvention, Volunteer/Role (planned, not yet built).
- **Async:** BullMQ (Redis-backed) for scoresheet OCR parsing and scheduled reminders.
- **Data:** PostgreSQL (Prisma ORM) as primary store, Redis for cache + queue, Scaleway S3 for scoresheet photos.
- **External:** LLM vision API (scoresheet OCR — provider TBD), HelloAsso (payments), Brevo (email).

Stack rationale and alternatives considered (why NestJS over Fastify, Prisma over Drizzle, BullMQ over RabbitMQ/Temporal, Brevo over SES, etc.) live in [`docs/backend-stack.md`](./docs/backend-stack.md) and [`docs/frontend-stack.md`](./docs/frontend-stack.md) — read those before proposing a stack change.

## Feature roadmap

Full list with priority tiers and explicit scope cuts: [`docs/feature-set.md`](./docs/feature-set.md).

- **P0 (table stakes):** France/EU RGPD-compliant hosting, HelloAsso-style payment collection, calendar/convocations/RSVP.
- **P1 (differentiators):** multi-club (CTC) team support, internal créneaux scheduling with conflict flags, AI-assisted scoresheet capture, fair playing-time tracking.
- **P2 (leadership):** volunteer role management, subvention paperwork assistant, cross-club/CTC admin dashboard, mixed payment support, parent/player self-service, regional network effects.
- **Explicitly not building:** FFBB license number field, medical certificate tracking, e-Marque V2 direct bridge, referee assignment, gym-slot negotiation, generic website/accounting tools — see the doc for why each is cut.

## Repo structure

```
server        NestJS backend. Global prefix /api. Health check at GET /api/health (Terminus) and GET /api/health/ping. npm package @basketeasy/server.
app           React + Vite frontend. Calls the API via same-origin /api/* (Vite proxy in dev, nginx proxy in the Docker image). npm package @basketeasy/app.
packages/@basketeasy/types  Shared TS types/DTOs, exposed via package.json subpath exports (e.g. `@basketeasy/types/health`), not a barrel index.ts — add a new file + a matching "exports" entry per domain area as modules land, mirrored by backend class-validator DTOs. npm package @basketeasy/types.
docs/         Architecture, stack decisions, brand, feature set, market research — read before making structural changes.
```

`server` and `app` sit at the repo root (not nested under an `apps/` folder) — deliberate, so top-level `ls` reads as "here's the backend, here's the frontend" rather than requiring a detour into `apps/`. Every workspace package (`server`, `app`, `packages/@basketeasy/types`) is a real npm package with its own `package.json`, named `@basketeasy/<name>`. Shared packages live under `packages/@basketeasy/<name>` (scope in the folder path, matching the npm name) — add new ones following that convention, in `pnpm-workspace.yaml`'s `packages/@basketeasy/*` glob.

This is a **pnpm workspace**, not yet an Nx workspace, despite the stack docs describing Nx as the eventual monorepo tool (for build/lint/test caching and enforced package boundaries). Don't assume Nx commands (`nx run`, `nx.json`, `project.json`) exist — they don't yet. If adding Nx, update this file and both stack docs' "Open decisions" sections.

## Working conventions

- **Language:** TypeScript everywhere, strict mode on. Shared shapes go in `packages/@basketeasy/types`, mirrored (not auto-generated yet) by backend DTOs. No barrel `index.ts` — each module (e.g. `health.ts`) is exposed as its own subpath via the package's `exports` field in `package.json` and imported as `@basketeasy/types/health`. Add a new file + a matching `exports` entry together when adding a domain area, rather than growing a single re-export file.
- **Formatting:** Prettier (`pnpm format:check` is what CI runs — run `pnpm format` before committing).
- **Linting:** ESLint per package (`server`, `app` each have their own config — Nest's decorator-heavy style differs from the frontend's React rules).
- **Tests:** Jest for the API (`server`, colocated `*.spec.ts`), Vitest + React Testing Library for the frontend (`app`, colocated `*.test.tsx`). Add tests alongside new modules/components, not in a separate mirror tree.
- **API contract changes:** update `packages/@basketeasy/types` first, then the NestJS DTO, then the frontend caller — keeps the "shared types" promise honest instead of drifting.
- **Health endpoint:** `server/src/health/health.controller.ts` is intentionally dependency-free (no DB/Redis indicators) until Prisma/Redis modules exist. When adding them, wire real Terminus indicators (`TypeOrmHealthIndicator`-equivalent for Prisma, `MemoryHealthIndicator`, a Redis ping) into the `check()` array instead of adding a second endpoint.
- **Docker:** each of `server` and `app` has its own multi-stage `Dockerfile` (deps → build → runtime) built from the **repo root** as context (see `docker-compose.yml`) so both can reach `packages/@basketeasy/types`. Don't change the build context to the package subdirectory without updating both Dockerfiles' COPY paths.
- **CI:** `.github/workflows/ci.yml` runs format check → lint → test → build, in that order, per app. `.github/workflows/docker-build.yml` validates both Dockerfiles build (no push yet — add registry push + secrets when a deploy target exists). Keep new workflows scoped to one concern (don't fold deploy logic into `ci.yml`).
- **Locale:** product-facing copy is French-first (`fr` default locale, per `docs/frontend-stack.md`'s i18n choice) — the landing tagline and marketing copy in `docs/brand.md` are the source of truth for tone, not translations of English drafts.
- **Modals vs. inline editing:** the reusable `Dialog` at `@basketeasy/ui/dialog` (Radix-based — focus trap, Escape-to-close, and a built-in close button come for free) is the project's one blessed modal primitive; reuse it rather than building a second one. Reach for it when an action is a **focused, self-contained, relatively infrequent edit of a multi-field record**, or a **destructive/hard-to-reverse action that deserves an explicit confirm step** — creating or editing an entity end-to-end (see every "Ajouter/Créer …" flow in `TeamDetailPage.tsx` and `EventRow`'s `EventEditModal`) benefits from the context switch: it removes surrounding table/list clutter, gives the form room to breathe, and makes "did this save?" unambiguous via an explicit close-on-success. `EventRow`'s `EventDeleteModal` is the destructive-confirmation case: even a single-field choice (the delete scope) still gets a modal once the action it gates is irreversible — the trigger button, scope selector, and confirm/cancel controls stay together in one focused step rather than firing on a stray click. Default to **inline controls** (a button, a `SelectField` next to the row, a disabled-until-confirmed state) instead when the action is **single-field, low-risk, non-destructive, and high-frequency** — e.g. `TeamPlayerRow`'s roster-role `SelectField` stays inline, since a wrong pick is a one-click fix, not something worth a context switch to guard against. Never nest a `Dialog` inside another `Dialog`; never use a modal for a multi-step flow that doesn't fit on one screen (that's a dedicated route, not a bigger dialog).

## Auth module

`server/src/auth` implements register/login/refresh/logout/me over a minimal `Club`/`ClubMembership` schema (`server/prisma/schema.prisma`):

- Passwords hashed with argon2; JWT access tokens (short-lived, `JwtStrategy` + `JwtAuthGuard`) plus rotating opaque refresh tokens stored hashed in `RefreshToken`, grouped by `familyId` for reuse detection (a reused/already-revoked refresh token revokes the whole family).
- `ClubRolesGuard` + `@ClubRoles()` decorator gate club-scoped routes by the caller's `ClubMembership.role`.
- `JWT_ACCESS_SECRET` env var is required — set in `docker-compose.yml`'s `server` service and `.env.example`.

## Teams module

`server/src/teams` (mounted at `clubs/:clubId/teams`) implements team CRUD, roster management, and multi-club (CTC/entente) ownership — a team can be linked to more than one club at once, per `docs/feature-set.md`'s P1 CTC requirement:

- `Team` is joined to `Club` through `ClubTeam` (many-to-many). The club that created the team gets `isOwner: true`; only the owning club can add/remove partner clubs or delete the team (`ClubTeam.clubId_teamId` is the composite key used throughout `TeamsService` to re-verify a team actually belongs to the `:clubId` in the route before any mutation — the same defense-in-depth pattern as `ClubsService.findPlayerInClub`).
- Roster entries (`TeamPlayer`) require the player's own club (`Player.clubId`) to be one of the team's linked clubs — enforced in `TeamsService.addTeamPlayer`, not the DB. Any admin of a linked club (owner or partner) can manage the shared roster.
- `TeamPlayer`/`ClubTeam` rows cascade-delete at the DB level (`onDelete: Cascade`) when their `Team` or, for `TeamPlayer`, their `Player` is deleted — so deleting a player or disbanding a team never needs a manual cleanup transaction.
- `TeamPlayer.role: COACH | PLAYER` (default `PLAYER`) labels a roster entry; no role-specific permissions exist yet — a `COACH` isn't automatically a `TeamAdmin`.
- `TeamAdmin` grants a `User` admin rights over one specific `Team` (roster, roster roles, events, team info edit) without club-wide `ClubRole.ADMIN`. The first `TeamAdmin` for a team must be created by a club `ADMIN` of a linked club; after that, existing `TeamAdmin`s can add/remove further ones too. Enforced by `TeamManagerGuard` (`server/src/auth/guards/team-manager.guard.ts`, club `ADMIN` of `:clubId` OR `TeamAdmin` of `:teamId`), which does **not** cover CTC ownership actions (delete team, add/remove partner club) — those stay owner-club-`ADMIN`-only via `assertTeamOwner`. `TeamsService.removeTeamAdmin` blocks only self-removal by the last `TeamAdmin` on a team (`BadRequestException`, checked via a `requestingUserId` the controller pulls off `@CurrentUser()`) — not last-admin removal in general, since a club `ADMIN` (or another `TeamAdmin`) can always revoke the last grant regardless; this guard exists purely so the last `TeamAdmin` can't accidentally lock themselves out.
- `GET /me/teams` (`MyTeamsController`, not club-scoped — there's no `:clubId` to key a "which teams am I part of" query off) returns every team the caller is a `TeamAdmin` of or is rostered on (via their linked `Player.userId`), merged into one row per team. Backs the frontend's "Mes équipes" nav link + `MyTeamsPage`, the only way a club `MEMBER` (who has no `AppHeader` entry to any specific club, unlike a club `ADMIN`) or a `TeamAdmin` who isn't a club `ADMIN` can navigate to a team they're part of.

## Events module

`server/src/events` (mounted at `clubs/:clubId/teams/:teamId/events`) implements CRUD for a team's calendar plus self-service RSVP — the first slice of P0's "basic team-day tools" (calendar/convocations/RSVP), still deliberately short of convocations (targeted call-ups) or fair-playing-time tracking:

- `Event` (`id`, `teamId`, `type`, `startsAt`, `location`, `notes?`, `opponentName?`, `recurrenceId?`) belongs to a single `Team` and cascade-deletes with it. `type: TRAINING | MATCH` is required on create and editable after. `opponentName` is a plain-text label (not a `Team`/`Club` relation — an opponent is by definition outside the club graph this app manages), required whenever the resulting `type` is `MATCH` and forced to `null` when it's `TRAINING`.
- Same authorization shape as Teams: `EventsService.assertTeamInClub`/`assertEventInTeam` re-verify the team belongs to the route's `:clubId` (and the event to that team) before any mutation, mirroring `TeamsService`'s pattern rather than importing across modules. `assertEventInTeam` returns the fetched row (not just an existence check) since `updateEvent`/`deleteEvent` need its `type`/`opponentName`/`recurrenceId`/`startsAt` to validate and resolve scope. Any admin of a linked club can manage a team's events — ownership doesn't gate this the way CTC partner-club management does.
- **Recurrence:** `POST .../events` accepts an optional `recurrence: { frequency: 'WEEKLY', until }` and returns `TeamEvent[]` (always an array, even for a single non-recurring event) — `EventsService.buildOccurrences` materializes one independent `Event` row per week from `startsAt` through `until`, capped at `MAX_RECURRING_OCCURRENCES` (104, ~2 years) so a distant end date can't write unbounded rows. Every occurrence in one recurring create shares a fresh `recurrenceId`; a single (non-recurring) event keeps `recurrenceId: null`.
- **Recurring-series scope:** `PATCH`/`DELETE .../events/:eventId` take an `EventUpdateScope` (`THIS` | `THIS_AND_FUTURE` | `ALL`, defaulting to `THIS`) resolved against the target event's `recurrenceId` (and, for `THIS_AND_FUTURE`, `startsAt >= ` the target's own). `scope !== 'THIS'` on an event with `recurrenceId: null` is a `400`. `startsAt` may only be changed with `scope: 'THIS'` (also `400` otherwise) — bulk _date_ shifting of a whole series is still deliberately not supported; see `docs/superpowers/specs/2026-08-11-event-types-recurring-scope-design.md` for why. `updateEvent` returns `TeamEvent[]` (matching `createEvent`'s "always an array" convention) rather than a bare `TeamEvent`.
- **Bulk hour-of-day update:** `PATCH .../events/:eventId/time` (`EventsService.updateEventTimeOfDay`) is the narrower, date-preserving case carved out of that cut — it changes only the time-of-day across a recurring series (`scope: 'THIS_AND_FUTURE' | 'ALL'` only; `THIS` doesn't apply, just edit the one event normally), leaving every occurrence's own date untouched. Since nothing in the schema stores a per-club/team timezone, the frontend resolves the user's chosen local wall-clock time against the _anchor_ event's own date (so DST is handled correctly for that one reference point) and sends the resulting UTC `hour`/`minute` once; the server applies that same UTC hour/minute to every row in scope via `setUTCHours`. Occurrences on the far side of a DST transition from the anchor can end up an hour off from the intended local time — a known, documented limitation until the app has real per-club timezone support, not a bug to chase for this cut.
- **RSVP:** a rostered team member (`TeamPlayer`, `PLAYER` or `COACH` — RSVP is per roster slot, not per basketball position) can self-report their own attendance status (`EventRsvpStatus: GOING | NOT_GOING | MAYBE`) via `PATCH .../events/:eventId/rsvp` and clear it via `DELETE .../events/:eventId/rsvp`, both guarded like `GET .../events` (`ClubRoles('ADMIN','MEMBER')`) and then narrowed in `EventsService` to "must hold a `TeamPlayer` row on this specific team" (`ForbiddenException` otherwise) — self-service only, resolved from `player.userId`, never a body-supplied id; see `docs/superpowers/specs/2026-08-24-event-rsvp-design.md`. No row means "no response yet," left implicit rather than a fourth enum value. `GET .../events/:eventId/rsvps` returns the full roster (not just responders) as `EventRsvpRosterEntry[]`, visible to the same audience as the event itself, each entry flagging `isMe`. `TeamEvent` gains `myRsvpStatus: EventRsvpStatus | null` — populated on `listEvents`/`createEvent`/`updateEvent`/`updateEventTimeOfDay` via a shared `resolveMyRsvpStatuses` helper bounded to at most two extra queries per call regardless of how many events are in the batch, deliberately not a per-event aggregate (a `groupBy` across the agenda view's up-to-100 unpaginated rows) — counts are instead derived client-side from the roster-breakdown response, lazily fetched only once a viewer opens it.
- **Next steps, in order, once this slice proves out:** (1) convocations — targeted call-ups to specific players rather than open RSVP to the whole roster; (2) folding in the P1 créneaux/gym-slot conflict detection once a Scheduling module exists. Don't build these speculatively — extend `Event`/`EventsService` when one of them is actually the next task.

## Dashboard module

`server/src/dashboard` backs the logged-in landing page (`GET /me/dashboard`, not club-scoped — same "no `:clubId` to key off" reasoning as `MyTeamsController`): a personalized greeting, stat tiles, a next-7-days agenda strip, and team cards, per `docs/ux-audit/scoping-plan.md` item 4.

- `DashboardService.getDashboard(userId, from?, to?)` queries `PrismaService` directly rather than injecting `TeamsService`/`EventsService` — same cross-module convention as Events (see above). "Joueurs au total" is club-scoped (`COUNT(Player) WHERE clubId IN <admin's clubs>`), not team-rostered, so a CTC-shared team's roster is never double-counted. Two of the four dashboard stat tiles ("Équipes gérées," "Clubs administrés") are computed client-side from data the app already fetches (`useMyTeamList()`, `useAdminClubs()`) — only "Joueurs au total" and the upcoming-events count need this endpoint.
- The agenda window defaults server-side to "now → +7 days" when `from`/`to` are omitted (`GetDashboardDto`, validated `IsISO8601`).
- Each `MyAgendaEvent`'s `clubId` is resolved the same way `TeamsService.toMyTeamSummary` picks a team's navigation club: prefer the club the caller actually belongs to among the event's team's linked clubs, so a CTC event always links to a club membership the caller has (avoiding a `ClubRolesGuard` 403 on click-through).
- `HealthStatus` lives at `/about` (`AboutPage.tsx`), not the default `/dashboard` view — kept off the landing page per the audit, given a permanent route instead of an env-flag toggle.

## What's deliberately not here yet

No Scheduling (beyond the plain Events CRUD above), Scoresheet, Payments, Subvention, or Volunteer/Role domain modules; no cross-club/CTC governance dashboard (P2, tracked separately from the Teams module's CTC data model above); no Nx, no CD/deploy workflow, no i18n library wired in. This is the scaffold described in the README's "Status" section, now with Auth, Clubs/Players, Teams, and Events as the first domain modules — extend it module by module per `docs/feature-set.md` rather than bulk-generating the full domain model at once.
