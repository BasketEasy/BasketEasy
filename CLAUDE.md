# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repository.

## What BasketEasy is

A website/app to help amateur basketball clubs manage rosters, attendance, trainings, matches, results, and everything around club organization — launching Loire-Atlantique (CD44, France) first. See [`docs/brand.md`](./docs/brand.md) for brand and [`docs/market-research.md`](./docs/market-research.md) for the market this is built for.

**Positioning:** a companion layer to the FFBB's mandatory federal stack (FBI licensing, e-Marque V2 scoresheets), not a replacement for it — solving what neither the federation nor the generic incumbents (Kalisport, AssoConnect, SportEasy) cover: basketball-specific team-day tooling, multi-club team (CTC/entente) support, and shared municipal gym-slot visibility. Full detail in [`docs/brand.md`](./docs/brand.md).

**Brand:** BasketEasy · *"La gestion d'équipe, simplifiée."* · orange `#D4622A` / blue-green `#1E5F74` / cream `#FAF5EF` / charcoal `#23201C` · Barlow Condensed (headings) + Inter (body). Full tokens in [`docs/brand.md`](./docs/brand.md).

## Architecture

Full diagrams (global, frontend, backend, ER model) are in [`docs/architecture.md`](./docs/architecture.md). Summary:

- **Client:** React SPA (Vite), calling the API through a single `ApiClient` wrapper (`app/src/api/client.ts`). TanStack Query owns server state once domain pages land; Context owns local UI state (auth, multi-club switcher).
- **API Gateway:** NestJS, REST, global `/api` prefix, guards + DTO validation pipes.
- **Domain modules (planned, not yet built):** Auth, Clubs/CTC, Teams/Players, Scheduling (créneaux + conflict detection), Scoresheet (AI-assisted capture), Payments (HelloAsso), Subvention, Volunteer/Role.
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
packages/types  Shared TS types/DTOs (currently just HealthResponse) — add domain DTOs here as modules land, mirrored by backend class-validator DTOs. npm package @basketeasy/types.
docs/         Architecture, stack decisions, brand, feature set, market research — read before making structural changes.
```

`server` and `app` sit at the repo root (not nested under an `apps/` folder) — deliberate, so top-level `ls` reads as "here's the backend, here's the frontend" rather than requiring a detour into `apps/`. Every workspace package (`server`, `app`, `packages/types`) is a real npm package with its own `package.json`, named `@basketeasy/<name>`. Add new shared packages under `packages/` following that same convention.

This is a **pnpm workspace**, not yet an Nx workspace, despite the stack docs describing Nx as the eventual monorepo tool (for build/lint/test caching and enforced package boundaries). Don't assume Nx commands (`nx run`, `nx.json`, `project.json`) exist — they don't yet. If adding Nx, update this file and both stack docs' "Open decisions" sections.

## Working conventions

- **Language:** TypeScript everywhere, strict mode on. Shared shapes go in `packages/types`, mirrored (not auto-generated yet) by backend DTOs.
- **Formatting:** Prettier (`pnpm format:check` is what CI runs — run `pnpm format` before committing).
- **Linting:** ESLint per package (`server`, `app` each have their own config — Nest's decorator-heavy style differs from the frontend's React rules).
- **Tests:** Jest for the API (`server`, colocated `*.spec.ts`), Vitest + React Testing Library for the frontend (`app`, colocated `*.test.tsx`). Add tests alongside new modules/components, not in a separate mirror tree.
- **API contract changes:** update `packages/types` first, then the NestJS DTO, then the frontend caller — keeps the "shared types" promise honest instead of drifting.
- **Health endpoint:** `server/src/health/health.controller.ts` is intentionally dependency-free (no DB/Redis indicators) until Prisma/Redis modules exist. When adding them, wire real Terminus indicators (`TypeOrmHealthIndicator`-equivalent for Prisma, `MemoryHealthIndicator`, a Redis ping) into the `check()` array instead of adding a second endpoint.
- **Docker:** each of `server` and `app` has its own multi-stage `Dockerfile` (deps → build → runtime) built from the **repo root** as context (see `docker-compose.yml`) so both can reach `packages/types`. Don't change the build context to the package subdirectory without updating both Dockerfiles' COPY paths.
- **CI:** `.github/workflows/ci.yml` runs format check → lint → test → build, in that order, per app. `.github/workflows/docker-build.yml` validates both Dockerfiles build (no push yet — add registry push + secrets when a deploy target exists). Keep new workflows scoped to one concern (don't fold deploy logic into `ci.yml`).
- **Locale:** product-facing copy is French-first (`fr` default locale, per `docs/frontend-stack.md`'s i18n choice) — the landing tagline and marketing copy in `docs/brand.md` are the source of truth for tone, not translations of English drafts.

## What's deliberately not here yet

No Auth module, no Prisma schema, no domain modules, no Nx, no CD/deploy workflow, no i18n library wired in. This is the scaffold described in the README's "Status" section — extend it module by module per `docs/feature-set.md` rather than bulk-generating the full domain model at once.
