# Kluvo — Backend Technology Stack

Builds on `architecture.md`'s backend layer (API Gateway, Auth/Clubs/Teams/Scheduling/Scoresheet/Payments modules, async queue, Postgres/Redis/R2). This fills in the concrete picks and the alternatives considered for each.

## Core

| Concern   | Choice     | Alternatives considered             | Why                                                                                                                                                                                             |
| --------- | ---------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime   | Node.js    | Deno, Bun                           | most mature ecosystem, matches frontend TS skillset, best library support for what we need (Prisma, BullMQ, Nest)                                                                               |
| Framework | NestJS     | Express (bare), Fastify (bare), Koa | opinionated module structure maps directly onto the domain split (Auth/Clubs/Teams/Scheduling/Scoresheet/Payments); built-in DI, guards, pipes — less hand-rolled plumbing than bare Express    |
| Language  | TypeScript | plain JS                            | shares types/DTOs with frontend zod schemas, catches errors before runtime                                                                                                                      |
| API style | REST       | GraphQL, tRPC                       | simplest to reason about for CRUD-heavy domain; GraphQL's flexibility isn't needed yet (no complex nested client queries); tRPC would lock client+server into same monorepo tighter than needed |

## Data

| Concern          | Choice                        | Alternatives considered           | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary database | PostgreSQL                    | MySQL, MongoDB                    | relational fits the domain (clubs/teams/players/CTC many-to-many); MongoDB would fight the inherently relational CTC/multi-club model                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ORM              | Prisma                        | TypeORM, Drizzle, Kysely, raw SQL | best-in-class TypeScript type generation from schema; migrations are simple; Drizzle is a close competitor (lighter, faster) but Prisma has more mature tooling/docs for a team new to backend                                                                                                                                                                                                                                                                                                                                                        |
| Cache            | Redis                         | Memcached                         | also doubles as the BullMQ queue backend — one less moving part than running Redis + Memcached separately                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Object storage   | Cloudflare R2 (S3-compatible) | AWS S3, Scaleway S3               | Zero egress fees — scoresheet photos get re-read repeatedly (review, retries, eventually OCR) and R2 charges nothing to serve them out, unlike S3/Scaleway's per-GB egress; same S3 API/SDK (`@aws-sdk/client-s3`) so no proprietary lock-in. Bucket **must** be created with R2's EU jurisdictional restriction (see `docs/superpowers/specs/2026-08-27-match-interface-design.md`'s Storage section) to keep the RGPD rationale that originally picked an EU-hosted store — R2 itself is a global product, not EU-only by default like Scaleway was |

## Async / Jobs

| Concern             | Choice                                                                 | Alternatives considered                              | Why                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Queue               | BullMQ                                                                 | Bull, RabbitMQ, AWS SQS, pg-boss, Temporal           | Redis-backed job queue for background work (scoresheet OCR parsing, retries) so the API response isn't blocked on a slow LLM call |
| Scheduled/cron jobs | `@nestjs/schedule` (BullMQ repeatable jobs for anything needing retry) | node-cron standalone, external cron (system crontab) | native Nest integration, no separate process to deploy for simple reminders (subvention/cert deadlines, slot conflict checks)     |

BullMQ wins because Redis is already in the stack, it's the standard choice for Node/Nest projects, and nothing here needs RabbitMQ/Temporal-level sophistication. Full comparison against Bull, RabbitMQ, AWS SQS, pg-boss, and Temporal is in the original stack research.

## Auth

| Concern           | Choice                               | Alternatives considered                                         | Why                                                                                                                                                                                           |
| ----------------- | ------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth strategy     | JWT (access + refresh tokens)        | Session cookies + server-side store, Auth0/Clerk (managed auth) | stateless, works cleanly across web + PWA; a managed auth provider would be faster to bootstrap but adds a paid third party and another non-EU data question for a fairly standard login flow |
| Guards/validation | NestJS Guards + class-validator DTOs | Zod on the backend too, manual validation                       | built into Nest's request pipeline, minimal boilerplate; DTOs double as API documentation                                                                                                     |
| Password hashing  | argon2                               | bcrypt                                                          | argon2 is the more modern, recommended default (winner of the Password Hashing Competition); bcrypt still fine but argon2 has better resistance to GPU cracking                               |

## External integrations

| Concern                          | Choice                                     | Alternatives considered                                             | Why                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM Vision (scoresheet OCR)      | TBD — Claude or GPT-4V class model via API | self-hosted OCR (Tesseract) + custom parsing, AWS Textract          | handwritten French scoresheets need real vision-language understanding, not template OCR. **Not yet decided between providers** — needs a small accuracy bake-off on real scoresheet photos before committing |
| Payments                         | HelloAsso API                              | Stripe, GoCardless                                                  | HelloAsso is the rail French sports clubs and treasurers already use and expect (free/tip-based, not card-fee-driven)                                                                                         |
| Transactional/notification email | Brevo                                      | Amazon SES, Postmark, Mailgun, Resend, Scaleway Transactional Email | French company, EU-hosted and EU-headquartered — cleanest RGPD story of the group; handles both transactional and future marketing email in one tool                                                          |

## Infra / Hosting

| Concern            | Choice           | Alternatives considered                                       | Why                                                                                                                      |
| ------------------ | ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Hosting            | Scaleway         | AWS, OVHcloud, Vercel/Netlify (frontend only) + AWS (backend) | French/EU cloud provider — RGPD-friendly by default, avoids US CLOUD Act exposure questions entirely                     |
| Reverse proxy / LB | Nginx or Traefik | Caddy                                                         | either is fine; Traefik auto-configures with Docker labels which suits a small ops team                                  |
| Containerization   | Docker           | none (bare VM deploy)                                         | standard for reproducible deploys, required for Scaleway Kubernetes (Kapsule) if scaling beyond a single container later |
| CI/CD              | GitHub Actions   | GitLab CI, CircleCI                                           | repo lives on GitHub, no separate tool to run — see `.github/workflows/`                                                 |

## Cross-cutting

| Concern        | Choice                                                           | Alternatives considered | Why                                                                                                                  |
| -------------- | ---------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Config/secrets | `@nestjs/config` + `.env` (dev), Scaleway secrets manager (prod) | Doppler, Vault          | native Nest module is enough at this scale                                                                           |
| Health checks  | `@nestjs/terminus`                                               | custom endpoint         | standard Nest module, checks DB/Redis connectivity out of the box — this is what backs `GET /api/health` in `server` |
| Logging        | Pino (via `nestjs-pino`)                                         | Winston, console.log    | structured JSON logs, faster than Winston                                                                            |

## Testing & quality

| Concern                | Choice                               | Alternatives considered | Why                                                                                                       |
| ---------------------- | ------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Unit/integration tests | Jest (Nest's default)                | Vitest                  | Nest's CLI scaffolds Jest by default and its testing module (mocking providers/guards) is built around it |
| E2E / API tests        | Supertest (via Nest's e2e setup)     | Postman/Newman          | integrates directly with Nest's testing module, runs in the same test suite as unit tests                 |
| Linting/formatting     | ESLint + Prettier, typescript-eslint | Biome                   | matches frontend tooling choice, one linting story across the whole monorepo                              |

## Monorepo

pnpm workspace, `server` (NestJS) alongside `app` (React) at the repo root, sharing `packages/@basketeasy/types` (DTOs shared between client and server, exposed as package.json subpath exports rather than a barrel `index.ts`) so API contracts can't silently drift. The architecture docs describe an eventual Nx layer on top for build/lint/test caching — not yet added to this scaffold; see "Open decisions" below.

## Open decisions

- LLM vision provider (Claude vs GPT-4V class) — needs a real accuracy test against sample scoresheet photos before committing.
- Cloudflare R2 bucket + API token creation is a manual step in the Cloudflare dashboard, not something either the app or its CI can provision — see `docs/superpowers/specs/2026-08-27-match-interface-design.md`'s Storage section for exactly what needs setting up before the scoresheet-capture slice can run against a real bucket.
- GraphQL vs REST-only if the client's data-fetching needs get more complex.
- Nx on top of the pnpm workspace, once the number of apps/packages justifies the build-caching overhead.
- Container orchestration at scale — plain Docker Compose is enough for the pilot; revisit Scaleway Kubernetes (Kapsule) if/when multi-instance scaling is needed.
