# BasketEasy

**La gestion d'équipe, simplifiée.**

BasketEasy centralizes calendars, gym slots (_créneaux_), and post-game scoresheets for amateur basketball clubs — starting with a Loire-Atlantique (CD44) first launch. It's a companion layer to the FFBB's official stack (FBI, e-Marque V2), not a replacement, purpose-built for volunteer-run clubs and the multi-club team (CTC/entente) reality of French grassroots basketball.

See [`CLAUDE.md`](./CLAUDE.md) for architecture, brand, positioning, and the full feature roadmap. Full reference docs live in [`docs/`](./docs).

## Stack

| Layer    | Choice                                                          |
| -------- | --------------------------------------------------------------- |
| Backend  | NestJS (TypeScript), PostgreSQL + Prisma, Redis + BullMQ        |
| Frontend | React 18 + Vite, TanStack Query, Tailwind + shadcn/ui           |
| Monorepo | pnpm workspaces (`server`, `app`, `packages/@basketeasy/types`) |
| Infra    | Docker, Scaleway (EU/RGPD-friendly hosting)                     |
| CI       | GitHub Actions (lint, format, test, build, Docker build)        |

Full rationale and alternatives considered: [`docs/backend-stack.md`](./docs/backend-stack.md), [`docs/frontend-stack.md`](./docs/frontend-stack.md).

## Repo layout

```
server/           NestJS backend — GET /api/health
app/              React + Vite frontend — calls /api/health, renders status
packages/
  @basketeasy/
    types/        Shared TypeScript types/DTOs between server and app,
                  exposed as package.json subpath exports (no barrel index.ts)
docs/             Architecture, stack rationale, brand, feature set, market research
.github/
  workflows/      CI: lint, format check, test, build, Docker build
```

## Quickstart — Docker (recommended)

Brings up Postgres, Redis, the API, and the web app together:

```bash
cp .env.example .env
docker compose up --build
```

- Web: http://localhost:5173 (shows live API health status)
- API: http://localhost:3000/api/health

This builds production images (compiled `dist/`, static nginx-served frontend) — no hot reload.

## Quickstart — Docker with hot reload

`docker-compose.dev.yml` bind-mounts `server/` and `app/` into the containers and runs `nest start --watch` / the Vite dev server instead, so edits on the host show up live:

```bash
cp .env.example .env
pnpm docker:dev
# equivalent to: docker compose -f docker-compose.dev.yml up --build
```

Same ports as above (web on :5173, API on :3000). It's a separate, standalone compose file rather than a `docker-compose.yml` override — see the comment at the top of `docker-compose.dev.yml` for why.

## Quickstart — local dev (without Docker)

Requires Node 20+ and pnpm.

```bash
corepack enable
pnpm install

# terminal 1 — API on :3000
pnpm dev:server

# terminal 2 — web on :5173 (Vite dev server proxies /api → :3000)
pnpm dev:app
```

## Common tasks

```bash
pnpm lint           # lint all workspace packages
pnpm format         # prettier --write
pnpm format:check   # prettier --check (what CI runs)
pnpm test           # run all test suites
pnpm build          # build all workspace packages
```

## Status

This is an initial scaffold plus its first domain modules: repo structure, Docker setup, CI, a working `/api/health` round-trip from backend to frontend, an Auth module (register/login/refresh/logout/me, JWT access tokens + rotating refresh tokens with reuse detection, argon2 password hashing, club-role guards), a Clubs/Players module (club creation, membership, roster), and a Teams module (team CRUD, roster, and multi-club/CTC ownership so a team can be shared across clubs). Remaining domain modules (Scheduling, Scoresheet, Payments, Subvention, Volunteer/Role) are not implemented yet — see [`docs/feature-set.md`](./docs/feature-set.md) for what's next.
