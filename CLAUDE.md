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

## Events module

`server/src/events` (mounted at `clubs/:clubId/teams/:teamId/events`) implements plain CRUD for a team's calendar — the first slice of P0's "basic team-day tools" (calendar/convocations/RSVP), deliberately scoped down to just events with no attendance tracking yet:

- `Event` (`id`, `teamId`, `startsAt`, `location`, `notes?`) belongs to a single `Team` and cascade-deletes with it. No event `type` field yet — every event reads as a generic team-day event (see below for why that's deferred rather than pre-built).
- Same authorization shape as Teams: `EventsService.assertTeamInClub`/`assertEventInTeam` re-verify the team belongs to the route's `:clubId` (and the event to that team) before any mutation, mirroring `TeamsService`'s pattern rather than importing across modules. Any admin of a linked club can manage a team's events — ownership doesn't gate this the way CTC partner-club management does.
- **Recurrence:** `POST .../events` accepts an optional `recurrence: { frequency: 'WEEKLY', until }` and returns `TeamEvent[]` (always an array, even for a single non-recurring event) — `EventsService.buildOccurrences` materializes one independent `Event` row per week from `startsAt` through `until`, capped at `MAX_RECURRING_OCCURRENCES` (104, ~2 years) so a distant end date can't write unbounded rows. Rows aren't linked by a series id, so editing/deleting one occurrence never touches the others — there's no "edit the whole series" operation yet.
- **Next steps, in order, once this slice proves out:** (1) RSVP — a status per roster player on an event, the first cut deliberately dropped to keep this shippable; (2) convocations — targeted call-ups to specific players rather than open RSVP to the whole roster; (3) a `type` field to distinguish training from match events, feeding fair-playing-time tracking later; (4) series-level edit/delete for recurring events, once single-occurrence CRUD proves out; (5) folding in the P1 créneaux/gym-slot conflict detection once a Scheduling module exists. Don't build these speculatively — extend `Event`/`EventsService` when one of them is actually the next task.

## What's deliberately not here yet

No Scheduling (beyond the plain Events CRUD above), Scoresheet, Payments, Subvention, or Volunteer/Role domain modules; no cross-club/CTC governance dashboard (P2, tracked separately from the Teams module's CTC data model above); no Nx, no CD/deploy workflow, no i18n library wired in. This is the scaffold described in the README's "Status" section, now with Auth, Clubs/Players, Teams, and Events as the first domain modules — extend it module by module per `docs/feature-set.md` rather than bulk-generating the full domain model at once.
