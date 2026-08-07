# BasketEasy — Frontend Technology Stack

Builds on `architecture.md`'s frontend layer (React SPA, TanStack Query, Context, react-hook-form + zod, i18n FR-default). This fills in the concrete picks.

## Core

| Concern | Choice | Why |
|---|---|---|
| Framework | React 18 + TypeScript | team familiarity, largest ecosystem |
| Build tool | Vite | fast dev/HMR, simple SPA setup (no SSR need — internal/club-auth app, not SEO-driven) |
| Package manager | pnpm | fast, disk-efficient |
| Routing | react-router-dom v6 | standard, handles nested routes for Club/CTC context + protected routes |

## Data fetching & server state

| Concern | Choice | Why |
|---|---|---|
| Query/cache layer | TanStack Query | caching, background refetch, optimistic updates for RSVP/scoresheet status |
| HTTP client | bare `fetch`, wrapped in a singleton `ApiClient` class | no dependency; one place to hold base URL, default headers, auth header injection, 401/refresh handling, error normalization |
| Auth token refresh | handled inside `ApiClient` (queue requests on 401, refresh, retry) | keeps refresh logic in one class instead of scattered interceptors |
| Realtime (later) | none for v1; revisit WebSocket/SSE if chat/live scoreboard gets built | avoid over-building before P1/P2 features ship |

## Client/local state & contexts

| Concern | Choice | Why |
|---|---|---|
| Global UI state | plain React (Context + useState/useReducer) | no extra dependency; app isn't state-heavy enough to justify a store library yet |
| Auth context | React Context (JWT, roles, refresh) | wraps TanStack Query's auth-dependent queries |
| Multi-club/CTC switcher | React Context, persisted to localStorage, read by `ApiClient` to scope requests | small piece of state, doesn't need more |
| Server cache vs UI state split | TanStack Query owns anything from the API; Context owns everything else | avoids duplicating server data in client state |

## Forms & validation

| Concern | Choice | Why |
|---|---|---|
| Forms | react-hook-form | uncontrolled inputs, good perf for roster/payment forms |
| Schema validation | zod | shared schemas can mirror backend DTOs (NestJS + class-validator), single source of truth for shapes |

## UI components & styling

| Concern | Choice | Why |
|---|---|---|
| Styling | Tailwind CSS | fast iteration, consistent design tokens for brand |
| Component primitives | shadcn/ui (Radix-based) | you own the generated code directly, so it's fully restylable to the BasketEasy brand rather than a black box |
| Icons | custom icon set | brand-specific, avoids a generic library look |
| Component library structure | separate `packages/ui` package, consumed by the app(s) | decouples UI kit from app code, reusable if a second frontend (CTC admin, etc.) is added later |

## Mobile / PWA

| Concern | Choice | Why |
|---|---|---|
| PWA | vite-plugin-pwa | installable, offline shell for coaches/parents using it pitch-side |
| Scoresheet upload | plain file input (`<input type="file">`), standard multipart upload | it's just a file upload, not a capture flow — no camera API needed |
| Offline queueing | revisit if gym connectivity turns out to be a real problem in pilot | not building for it upfront |

## i18n

| Concern | Choice | Why |
|---|---|---|
| Library | react-i18next | mature, FR as default locale, structure ready for other locales later |

## Testing & quality

| Concern | Choice | Why |
|---|---|---|
| Unit/component tests | Vitest + React Testing Library | pairs natively with Vite |
| E2E | Playwright | covers RSVP flow, scoresheet upload, payment flow end-to-end |
| API mocking | MSW (Mock Service Worker) | mocks NestJS API in dev/tests without a live backend |
| Linting/formatting | ESLint + Prettier, typescript-eslint | standard |
| Type-safe API contracts | shared `packages/types` package, mirroring NestJS DTOs | keeps FE/BE in sync as DTOs evolve, no duplicate type definitions |

## Monorepo

pnpm workspace: `app` + `packages/ui` (once created) + `packages/types`, with `server` (NestJS) alongside at the repo root. An Nx layer is the eventual plan for shared tooling (lint/build/test caching) and enforced package boundaries — not yet added to this scaffold.

## Open decisions

- Whether Context alone stays sufficient as more features (scheduling, payments, dashboards) land, or a store becomes worth it later — revisit if prop-drilling/context nesting gets painful.
