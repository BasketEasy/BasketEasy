# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repository.

## What Kluvo is

A website/app to help amateur basketball clubs manage rosters, attendance, trainings, matches, results, and everything around club organization — launching Loire-Atlantique (CD44, France) first. See [`docs/brand.md`](./docs/brand.md) for brand and [`docs/market-research.md`](./docs/market-research.md) for the market this is built for.

**Positioning:** a companion layer to the FFBB's mandatory federal stack (FBI licensing, e-Marque V2 scoresheets), not a replacement for it — solving what neither the federation nor the generic incumbents (Kalisport, AssoConnect, SportEasy) cover: basketball-specific team-day tooling, multi-club team (CTC/entente) support, and shared municipal gym-slot visibility. Full detail in [`docs/brand.md`](./docs/brand.md).

**Brand:** Kluvo · _"La gestion d'équipe, simplifiée."_ · orange `#D4622A` / blue-green `#1E5F74` / cream `#FAF5EF` / charcoal `#23201C` · Barlow Condensed (headings) + Inter (body). Full tokens in [`docs/brand.md`](./docs/brand.md).

## Architecture

Full diagrams (global, frontend, backend, ER model) are in [`docs/architecture.md`](./docs/architecture.md). Summary:

- **Client:** React SPA (Vite), calling the API through a single `ApiClient` wrapper (`app/src/api/client.ts`). TanStack Query owns server state once domain pages land; Context owns local UI state (auth, multi-club switcher).
- **API Gateway:** NestJS, REST, global `/api` prefix, guards + DTO validation pipes.
- **Domain modules:** Auth (built — see below); Clubs/Players (built, `server/src/clubs`); Teams (built — see below); Scheduling (créneaux + conflict detection), Scoresheet (AI-assisted capture), Payments (HelloAsso), Subvention, Volunteer/Role (planned, not yet built).
- **Async:** BullMQ (Redis-backed) for scoresheet OCR parsing and scheduled reminders.
- **Data:** PostgreSQL (Prisma ORM) as primary store, Redis for cache + queue, Cloudflare R2 (S3-compatible, EU-jurisdiction bucket) for scoresheet photos.
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
- **Verification cadence (agents):** don't run lint/format/test after every individual edit — that serializes work that should happen once. Make all the changes a task needs first, then verify a single time before calling the task done or committing. Scope that verification to what you touched instead of the whole repo:
  - Format/lint only the files you changed, e.g. `pnpm exec prettier --check <files>` / `pnpm --filter @basketeasy/server exec eslint <files>` / `pnpm --filter @basketeasy/app exec eslint <files>` — not the root `pnpm format`/`pnpm lint` (repo-wide) unless you're about to push.
  - Run only the relevant tests, not the full suite: `pnpm --filter @basketeasy/server test -- <path-or-pattern>` (Jest) or `pnpm --filter @basketeasy/app test -- <path>` (Vitest, or `vitest related <file>`), not root `pnpm test`.
  - CI (`.github/workflows/ci.yml`) already runs full format check → lint → test → build on every push — that's the safety net for the whole repo; local verification only needs to cover what changed.
- **Sandbox migrations:** these sandboxes have no live Postgres/Docker (`docker compose up` fails). Don't skip a schema change for that — hand-write the migration SQL under `server/prisma/migrations/` matching Prisma's generated style (see any existing migration for the format), then run `pnpm --filter @basketeasy/server exec prisma generate` (schema-only, no DB connection needed) so the rest of the build type-checks against it.
- **Screenshots (agents):** any change that touches UI — a new or modified component, layout, styling, or visual state — gets rendered and sent as a screenshot before the task is called done, not just described in prose. If there's no live Postgres/Docker to run the real app against (the common case, per the sandbox-migrations bullet above), don't hand-roll a mock backend: run `pnpm mock-api` (`scripts/mock-api-server.mjs`, defaults to port 3000 matching `app/vite.config.ts`'s proxy target) — it serves the same default empty/zero shapes as `app/src/mocks/handlers.ts`. For scenario-specific data, check `scripts/fixtures/` first for a committed, reusable fixture (e.g. `authenticated-admin-session.json` for the session/club bootstrap almost every authenticated screen needs, `player-invite.json` for the roster invite dialog / `/invite/:token` accept page) before hand-rolling a new one — reuse it as-is, extend a copy, or commit a new file there when the scenario is likely to recur; keep a genuine one-off in `scratchpad/` instead. A fixtures file is keyed `"METHOD /path": <body>`, passed via `--fixtures <file>`; see the script's header comment for the exact format. Then run the real Vite dev server against it with a headless browser (Playwright is preinstalled).
- **Dead code:** delete it in the same change that orphans it — never leave an unused export behind "in case", and never comment code out instead of removing it (git history is the archive). Before calling a task done, check the symbols you stopped using: an export with no non-test, non-story importer is dead and goes. Three things are _not_ dead and must not be swept up by this: an exported prop/variant type that is a component's public contract (`ButtonProps`, `TextProps`) even when nothing imports it by name today; a symbol still used inside its own module — that is a dead _export_, so drop the `export` keyword and keep the code; and a deliberate test hook such as `__resetToastsForTests`. Deleting a component means deleting its `*.test.tsx`, its `*.stories.tsx`, its `exports` entry in `packages/@basketeasy/ui/package.json`, and any helper that existed only to back it.
- **PR descriptions:** the description has to cover the whole diff, not just the change the title is about. A fix picked up while working on something else either gets its own PR or gets named in this one — `.github/pull_request_template.md` asks for that list explicitly, and `pr-scope.yml` enforces the narrow case where a description asserts no behavioural change over a diff that clearly has one.
- **API contract changes:** update `packages/@basketeasy/types` first, then the NestJS DTO, then the frontend caller — keeps the "shared types" promise honest instead of drifting.
- **Health endpoint:** `server/src/health/health.controller.ts` is intentionally dependency-free (no DB/Redis indicators) until Prisma/Redis modules exist. When adding them, wire real Terminus indicators (`TypeOrmHealthIndicator`-equivalent for Prisma, `MemoryHealthIndicator`, a Redis ping) into the `check()` array instead of adding a second endpoint.
- **Docker:** each of `server` and `app` has its own multi-stage `Dockerfile` (deps → build → runtime) built from the **repo root** as context (see `docker-compose.yml`) so both can reach `packages/@basketeasy/types`. Don't change the build context to the package subdirectory without updating both Dockerfiles' COPY paths.
- **CI:** `.github/workflows/ci.yml` runs format check → lint → test → build, in that order, per app. `.github/workflows/docker-build.yml` validates both Dockerfiles build (no push yet — add registry push + secrets when a deploy target exists). `.github/workflows/pr-scope.yml` checks the PR _description_ against the diff rather than the code: it flags a PR touching `server/src/auth`, `server/src/retention`, `server/src/audit` or `server/prisma`, and fails when such a diff also claims to change no behaviour — the shape of issue #150, where a 30-second carve-out in refresh-token reuse detection shipped inside a PR titled as a hostname cleanup. Keep new workflows scoped to one concern (don't fold deploy logic into `ci.yml`).
- **Locale:** product-facing copy is French-first (`fr` default locale, per `docs/frontend-stack.md`'s i18n choice) — the landing tagline and marketing copy in `docs/brand.md` are the source of truth for tone, not translations of English drafts.
- **Modals vs. inline editing:** the reusable `Dialog` at `@basketeasy/ui/dialog` (Radix-based — focus trap, Escape-to-close, and a built-in close button come for free) is the project's one blessed modal primitive; reuse it rather than building a second one. Reach for it when an action is a **focused, self-contained, relatively infrequent edit of a multi-field record**, or a **destructive/hard-to-reverse action that deserves an explicit confirm step** — creating or editing an entity end-to-end (see every "Ajouter/Créer …" flow in `TeamDetailPage.tsx` and `EventRow`'s `EventEditModal`) benefits from the context switch: it removes surrounding table/list clutter, gives the form room to breathe, and makes "did this save?" unambiguous via an explicit close-on-success. `EventRow`'s `EventDeleteModal` is the destructive-confirmation case: even a single-field choice (the delete scope) still gets a modal once the action it gates is irreversible — the trigger button, scope selector, and confirm/cancel controls stay together in one focused step rather than firing on a stray click. Default to **inline controls** (a button, a `SelectField` next to the row, a disabled-until-confirmed state) instead when the action is **single-field, low-risk, non-destructive, and high-frequency** — e.g. `TeamPlayerRow`'s roster-role `SelectField` stays inline, since a wrong pick is a one-click fix, not something worth a context switch to guard against. Never nest a `Dialog` inside another `Dialog`; never use a modal for a multi-step flow that doesn't fit on one screen (that's a dedicated route, not a bigger dialog).
- **Forms:** every form uses react-hook-form (`useForm`, with a zod schema through `zodResolver` whenever there is a rule to check), never several `useState`s holding field values and their errors by hand. Text inputs go through `register`, Radix controls (`SelectField`, `Checkbox`, `RadioCardGroup`) through `Controller`, a server refusal bound to a field through `setError('<field>')` and one bound to the form through `setError('root')` + `Alert`, and a dialog that re-opens resets with `reset(...)` rather than a `useEffect` re-seeding each state. This holds for a one-field inline edit too (`ClubFfbbLinkControl`) and for a large editor (`ScoresheetExtractionCard` keeps its corrections and roster mapping in one `useForm`). UI state that isn't a field value (a dialog's `open`, a generated link to show) stays in `useState`.
- **Feedback:** inline `FieldError`/`Alert` is for validation bound to a field or a form — it renders next to the input that is wrong. `toast()` (from `@basketeasy/ui/toast-store`, rendered by the single `<Toaster />` in `App.tsx`) is for the outcome of a _completed_ mutation, success or failure, because the control that triggered it may have closed (a `Dialog`) or scrolled out of view (a deep tab). Never use both for the same event, and never render a mutation result far from where it was triggered without a toast.
- **Surfaces:** the ladder is `sunk` → `ground` (page) → `surface-2` (inputs, nested panels) → `surface` (cards, dialogs, header, overlays). `cream` is a legacy alias of `surface-2`; new code uses the semantic names. Nothing should share a background with its parent. `Card` expresses its own step on the ladder through `variant` (`raised` default | `inset` for a card nested in an already-raised container | `panel` | `flush`) — never re-derive `bg-surface-2 p-3` at a call site.
- **Closed prop APIs:** a component's look is chosen through its enums, never through a `className` that changes its colour, background, padding, radius or font weight (layout classes — `flex`, `gap-*`, `max-w-*` — remain caller-side, they're composition). `Badge` is `variant` (fill: `solid`/`soft`/`outline`) × `tone` (meaning: `brand`/`structure`/`neutral`/`muted`/`danger`); tone names describe role, never hue. If a call site needs a look the enums can't express, add the variant — a caller-side helper that returns Tailwind colour classes is the signal you skipped this step. See [`docs/design-system-audit.md`](./docs/design-system-audit.md).
- **Colour is always a variant, never a call site.** Nothing outside a component's own definition may name a colour — not a `className`, not a ternary, not a prop. Icons take `tone` (`@basketeasy/ui/icon-variants`, shared by every icon in both packages) rather than a `text-*` class; `Avatar`/`AvatarFallback`, `Heading`, `Badge`, `Text` and `TextLink` each own a `tone`. If you find yourself writing `cond ? 'text-orange-text' : 'text-muted'`, the fix is a `tone` prop on the receiving component — a prop typed `string` that holds Tailwind colours (the old `colorClassName`/`statusClassName`) is the same mistake wearing a name. Sizing (`h-8 w-8`, `max-w-*`) stays caller-side: it is composition, not look.
- **Text:** use `Text` (`@basketeasy/ui/text`) for every non-heading string — `variant` (`body`/`label`/`meta`/`eyebrow`/`display`) × `size` × `tone`, with `as` picking the element. `meta` already means "small and secondary", so `<Text variant="meta">` needs no other props; that one call replaces `className="text-sm text-muted"`. Never hand-write a font-size/weight/colour combination on a raw `<p>`/`<span>` — there are zero left in `app/src`, keep it that way. An inline navigation link is `TextLink` (`@basketeasy/ui/text-link`), not a `<Link>` with `text-* hover:underline`. `Heading` (h1–h3) owns its own `font-heading text-charcoal` — don't pass them.
- **Focus:** every interactive primitive composes the shared `focusRing` from `@basketeasy/ui/focus-ring`. Never hand-roll a focus recipe. It is a CSS `outline`, not a Tailwind `ring`, on purpose: a ring paints its offset gap a solid colour, so the recipe would have to name the ground it sits on — and one recipe is composed by controls on all four rungs of the ladder. Don't reintroduce `ring-offset-*`.
- **Responsive tables:** a record shown as a table row on desktop and a card on mobile is **one** component, not a `…Row`/`…Card` pair. Wrap the list in `ResponsiveTable` (`@basketeasy/ui/responsive-table`), give it `columns`, and branch inside the record on `useTableLayout()` — the behaviour (mutations, error branching, toast copy) is then written once. Six twin pairs were merged this way; the pair that survived, `TeamPlayerRow`, has no twin because its mobile view (`TeamRosterCards`) is a genuinely different layout.
- **Charts:** every chart goes through `@basketeasy/ui/chart` (`ColumnChart`, `BarListChart`), the only file that imports `recharts`. A call site passes data and a `tone` (`structure` | `brand`), never a colour: marks are `fill="currentColor"` under a Tailwind text class, so the preset stays the one place a hex lives. Each chart renders its numbers as a visually hidden table, which is what assistive tech reads. Need a new shape (line, stacked)? Add it to the wrapper.
- **Radio cards:** a set of selectable cards is `RadioCardGroup` (`@basketeasy/ui/radio-card-group`), never hand-rolled `role="radio"` buttons — it owns the roving tabindex, arrow/Home/End navigation and the focus ring that a hand-rolled version forgets.
- **A `GET` handler never writes user-owned state.** Read-only impersonation relies on it: its
  strategy refuses every other method, so a `GET` that marks something read or records an answer
  would be the one write staff could make as someone else. System upkeep (a cache fill, a queued
  route recompute) is fine.
- **Query branches:** every query consumer branches `error → loading → empty → data`, in that order. An error must never fall through to an `EmptyState` — that tells the user their data doesn't exist when it merely failed to load.
- The `?tab=` `TabsTrigger`s in `MembersPage`/`TeamDetailPage` are the documented exception to "every URL-changing control is a link" — `role="tab"` is the correct ARIA and `replace: true` means no history entry.

## Design direction — Parquet

The app has one committed visual direction, **Parquet**: the club gym as material — warm layered neutrals, court-line rules, real elevation. It evolves `docs/brand.md` rather than replacing it; no brand colour value changed when it landed. Design decisions record and rationale: [`docs/superpowers/specs/2026-08-25-frontend-parquet-revamp-design.md`](./docs/superpowers/specs/2026-08-25-frontend-parquet-revamp-design.md).

**Every token lives in one file** — `packages/@basketeasy/ui/tailwind-preset.cjs`. That file is the only place a literal colour, shadow or letter-spacing value may appear in either package. If a value you need isn't there, **add it there and give it a name**; do not reach for an arbitrary Tailwind value (`bg-[#…]`, `shadow-[inset_…]`, `tracking-[0.13em]`, `h-[76px]`). Six of those slipped in during the revamp and every one was caught and tokenised — `nav-active`, `segment-active`, `wide-caps`, `section` all exist because of it.

- **Surfaces** — the four-step ladder, per the Working conventions bullet above. The rule that makes it work: nothing shares a background with its parent. Before Parquet, `body`, `Card`, `Dialog` and `Input` were all the same `#FAF5EF`, which is why the UI read as flat and unfinished.
- **Colour weight** — orange (`orange` / `orange-text` / `orange-hover` / `orange-tint`) is the **rare, sharp** accent: primary action, active nav state, convocation. Blue-green (`blue-green` / `-2` / `-tint`) carries **structure**: rules, avatars, section accents, the event time block. Using them at equal weight is what made neither read as the brand colour before.
- **Elevation** — `shadow-sm`/`md`/`lg` are overridden to warm-tinted values, so existing `shadow-*` classes get the right feel for free. Two named extras: `nav-active` (the active-nav underline) and `segment-active` (the pressed inset on a segmented control, and on every filled button).
- **Shape** — `rounded-md`/`lg`/`xl`/`2xl` are overridden the same way: 10px for controls (buttons, inputs, time blocks), 14px for cards, 16px for dialogs, 20px for a bottom sheet. Reach for the step, never a pixel value. The reference is the validated parent-feature canvas (https://claude.ai/artifact/XamFReY4Va2PeKMVdaRVxR): uppercase display headings, blue-green section rules, soft badges, the time block as a rounded tile inside the card's padding, and RSVP as three separate buttons filled by answer.
- **Type** — `font-heading` is Big Shoulders Display (700–800), `font-sans` is Atkinson Hyperlegible (400–700), chosen for legibility in a dim gym on a small screen. Global `h1,h2,h3` sets `line-height: 0.94`. Use the `.tabular` utility on any digits that line up in a column — times, dates, counts, scores.
- **Signature elements** — the **court-line rule** (`SectionHeading` from `@basketeasy/ui/section-heading`: uppercase label plus a 2px blue-green rule at 20% filling the remaining width); the **time block** on event cards (solid `bg-blue-green` for a `MATCH`, bordered `bg-surface-2` for a `TRAINING`, time in Big Shoulders with tabular numerals); the **active nav** treatment (`bg-orange-tint` + `shadow-nav-active`).

### Rules that keep it coherent

Beyond the Working conventions above, four traps this direction has already fallen into once each — check for them when extending:

1. **`cream` is legacy.** It's an alias of `surface-2` kept so old call sites compile. Writing `bg-cream` in new code silently puts an element one step below where you meant, and `hover:bg-cream` on a page that is no longer cream is a hover that does nothing — the original defect the revamp existed to fix, which was reintroduced on the landing page's main CTA in the final task.
2. **A new component is not exempt from the token rules.** `SectionHeading` shipped with an arbitrary `tracking-` value in the same branch that added a `letterSpacing` block to the preset.
3. **A shared surface needs the token applied everywhere, not just where it was first raised.** `SelectContent`, the mobile nav panel and both `<header>` elements each needed `bg-surface` and each was missed by the task that introduced the ladder, because no task owned "apply it to the header".
4. **Rewriting a file means re-checking its query branches and its focus states.** Three query consumers lost their error branch simply because a later task rewrote files that an earlier task had already fixed.

**When a spec, plan or instruction conflicts with these constraints, the constraint wins** — raise the conflict rather than transcribing the snippet. That is how all six arbitrary values, a Radix `Slot` crash and a nested `<main>` were caught during the revamp.

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
- **Deleting a `Club` deletes everything that is the club's.** `Player`, `ClubMembership` and `ClubTeam` cascade from `Club` (players take their roster slots, stats, invites and guardian links with them). The teams it _owns_ are deleted explicitly by `PlatformAdminActionsService.deleteClub` (`POST /admin/clubs/:clubId/delete`, `CLUB_DELETED`, `DATA_OFFICER`-only like erasure), since `Team` reaches `Club` only through `ClubTeam` and an FK cascade would orphan them; a team it only partners on stays with its owner. Scoresheet files go from R2 after the commit, best-effort. A raw `DELETE FROM "Club"` skips the owned teams and the files, so use the action.
- `TeamPlayer.role: COACH | PLAYER` (default `PLAYER`) labels a roster entry; no role-specific permissions exist yet — a `COACH` isn't automatically a `TeamAdmin`.
- `TeamAdmin` grants a `User` admin rights over one specific `Team` (roster, roster roles, events, team info edit) without club-wide `ClubRole.ADMIN`. The first `TeamAdmin` for a team must be created by a club `ADMIN` of a linked club; after that, existing `TeamAdmin`s can add/remove further ones too. Enforced by `TeamManagerGuard` (`server/src/auth/guards/team-manager.guard.ts`, club `ADMIN` of `:clubId` OR `TeamAdmin` of `:teamId`), which does **not** cover CTC ownership actions (delete team, add/remove partner club) — those stay owner-club-`ADMIN`-only via `assertTeamOwner`. `TeamsService.removeTeamAdmin` blocks only self-removal by the last `TeamAdmin` on a team (`BadRequestException`, checked via a `requestingUserId` the controller pulls off `@CurrentUser()`) — not last-admin removal in general, since a club `ADMIN` (or another `TeamAdmin`) can always revoke the last grant regardless; this guard exists purely so the last `TeamAdmin` can't accidentally lock themselves out.
- `GET /me/teams` (`MyTeamsController`, not club-scoped — there's no `:clubId` to key a "which teams am I part of" query off) returns every team the caller is a `TeamAdmin` of or is rostered on (via their linked `Player.userId`), merged into one row per team. Backs the frontend's "Mes équipes" nav link + `MyTeamsPage`, the only way a club `MEMBER` (who has no `AppHeader` entry to any specific club, unlike a club `ADMIN`) or a `TeamAdmin` who isn't a club `ADMIN` can navigate to a team they're part of.

## Events module

`server/src/events` (mounted at `clubs/:clubId/teams/:teamId/events`) implements CRUD for a team's calendar plus self-service RSVP and manager-driven convocations — most of P0's "basic team-day tools" (calendar/convocations/RSVP), still deliberately short of fair-playing-time tracking:

- `Event` (`id`, `teamId`, `type`, `startsAt`, `location`, `notes?`, `opponentName?`, `recurrenceId?`) belongs to a single `Team` and cascade-deletes with it. `type: TRAINING | MATCH` is required on create and editable after. `opponentName` is a plain-text label (not a `Team`/`Club` relation — an opponent is by definition outside the club graph this app manages), required whenever the resulting `type` is `MATCH` and forced to `null` when it's `TRAINING`.
- Same authorization shape as Teams: `EventsService.assertTeamInClub`/`assertEventInTeam` re-verify the team belongs to the route's `:clubId` (and the event to that team) before any mutation, mirroring `TeamsService`'s pattern rather than importing across modules. `assertEventInTeam` returns the fetched row (not just an existence check) since `updateEvent`/`deleteEvent` need its `type`/`opponentName`/`recurrenceId`/`startsAt` to validate and resolve scope. Any admin of a linked club can manage a team's events — ownership doesn't gate this the way CTC partner-club management does.
- **Recurrence:** `POST .../events` accepts an optional `recurrence: { frequency: 'WEEKLY', until }` and returns `TeamEvent[]` (always an array, even for a single non-recurring event) — `EventsService.buildOccurrences` materializes one independent `Event` row per week from `startsAt` through `until`, capped at `MAX_RECURRING_OCCURRENCES` (104, ~2 years) so a distant end date can't write unbounded rows. Every occurrence in one recurring create shares a fresh `recurrenceId`; a single (non-recurring) event keeps `recurrenceId: null`.
- **Recurring-series scope:** `PATCH`/`DELETE .../events/:eventId` take an `EventUpdateScope` (`THIS` | `THIS_AND_FUTURE` | `ALL`, defaulting to `THIS`) resolved against the target event's `recurrenceId` (and, for `THIS_AND_FUTURE`, `startsAt >= ` the target's own). `scope !== 'THIS'` on an event with `recurrenceId: null` is a `400`. `startsAt` may only be changed with `scope: 'THIS'` (also `400` otherwise) — bulk _date_ shifting of a whole series is still deliberately not supported; see `docs/superpowers/specs/2026-08-11-event-types-recurring-scope-design.md` for why. `updateEvent` returns `TeamEvent[]` (matching `createEvent`'s "always an array" convention) rather than a bare `TeamEvent`.
- **Bulk hour-of-day update:** `PATCH .../events/:eventId/time` (`EventsService.updateEventTimeOfDay`) is the narrower, date-preserving case carved out of that cut — it changes only the time-of-day across a recurring series (`scope: 'THIS_AND_FUTURE' | 'ALL'` only; `THIS` doesn't apply, just edit the one event normally), leaving every occurrence's own date untouched. Since nothing in the schema stores a per-club/team timezone, the frontend resolves the user's chosen local wall-clock time against the _anchor_ event's own date (so DST is handled correctly for that one reference point) and sends the resulting UTC `hour`/`minute` once; the server applies that same UTC hour/minute to every row in scope via `setUTCHours`. Occurrences on the far side of a DST transition from the anchor can end up an hour off from the intended local time — a known, documented limitation until the app has real per-club timezone support, not a bug to chase for this cut.
- **RSVP:** a rostered team member (`TeamPlayer`, `PLAYER` or `COACH` — RSVP is per roster slot, not per basketball position) can self-report their own attendance status (`EventRsvpStatus: GOING | NOT_GOING | MAYBE`) via `PATCH .../events/:eventId/rsvp` and clear it via `DELETE .../events/:eventId/rsvp`, both guarded like `GET .../events` (`ClubRoles('ADMIN','MEMBER')`) and then narrowed in `EventsService` to "must hold a `TeamPlayer` row on this specific team" (`ForbiddenException` otherwise) — self-service only, resolved from `player.userId`, never a body-supplied id; see `docs/superpowers/specs/2026-08-24-event-rsvp-design.md`. No row means "no response yet," left implicit rather than a fourth enum value. `GET .../events/:eventId/rsvps` returns the full roster (not just responders) as `EventRsvpRosterEntry[]`, visible to the same audience as the event itself, each entry flagging `isMe`.
- **Convocations:** a team manager (`TeamManagerGuard`) can call up a subset of the roster for one event via `PATCH .../events/:eventId/convocations`, body `{ teamPlayerIds: string[] }` — a full replace (every id in the list ends up convoked, every other roster member ends up not, an empty array clears the list back to nobody), not an incremental add/remove; `EventsService.setEventConvocations` 400s if any id isn't on the team's own roster. `GET .../events/:eventId/convocations` returns the full roster breakdown as `EventConvocationRosterEntry[]`, same visibility as RSVP's roster endpoint. Independent of RSVP — convocation never reads or writes `EventRsvp` state, and vice versa; see `docs/superpowers/specs/2026-08-24-event-convocations-design.md`.
- `TeamEvent` gains `myRsvpStatus: EventRsvpStatus | null` and `myConvocation: boolean` — populated on `listEvents`/`createEvent`/`updateEvent`/`updateEventTimeOfDay` via a shared `resolveMyEventState` helper that fetches the caller's `TeamPlayer` once and resolves both `EventRsvp` and `EventConvocation` off it in parallel, bounded to at most three queries per call (one shared lookup plus one `findMany` per concern) regardless of how many events are in the batch, deliberately not a per-event aggregate (a `groupBy` across the agenda view's up-to-100 unpaginated rows) — counts are instead derived client-side from each roster-breakdown response, lazily fetched only once a viewer opens it.
- **Next steps, once this slice proves out:** folding in the P1 créneaux/gym-slot conflict detection once a Scheduling module exists. Don't build this speculatively — extend `Event`/`EventsService` when it's actually the next task.

## Dashboard module

`server/src/dashboard` backs the logged-in landing page (`GET /me/dashboard`, not club-scoped — same "no `:clubId` to key off" reasoning as `MyTeamsController`): a personalized greeting, stat tiles, a next-7-days agenda strip, and team cards, per `docs/ux-audit/scoping-plan.md` item 4.

- `DashboardService.getDashboard(userId, from?, to?)` queries `PrismaService` directly rather than injecting `TeamsService`/`EventsService` — same cross-module convention as Events (see above). "Joueurs au total" is club-scoped (`COUNT(Player) WHERE clubId IN <admin's clubs>`), not team-rostered, so a CTC-shared team's roster is never double-counted. Two of the four dashboard stat tiles ("Équipes gérées," "Clubs administrés") are computed client-side from data the app already fetches (`useMyTeamList()`, `useAdminClubs()`) — only "Joueurs au total" and the upcoming-events count need this endpoint.
- The agenda window defaults server-side to "now → +7 days" when `from`/`to` are omitted (`GetDashboardDto`, validated `IsISO8601`).
- Each `MyAgendaEvent`'s `clubId` is resolved the same way `TeamsService.toMyTeamSummary` picks a team's navigation club: prefer the club the caller actually belongs to among the event's team's linked clubs, so a CTC event always links to a club membership the caller has (avoiding a `ClubRolesGuard` 403 on click-through).
- `HealthStatus` lives at `/about` (`AboutPage.tsx`), not the default `/dashboard` view — kept off the landing page per the audit, given a permanent route instead of an env-flag toggle.

## Scoresheets module

`server/src/scoresheets` runs the AI-assisted capture of an FFBB e-Marque sheet: a photo/PDF uploaded to R2 is queued on BullMQ (`ScoresheetsService.enqueueOcr`), read by a vision model behind the `SCORESHEET_VISION_CLIENT` seam (`GeminiClient` today), and persisted as a `ScoresheetExtraction` for a manager to confirm.

- **Points come from the running score, never the roster block.** The left half of the sheet carries identity and fouls only; every basket is a mark in the right-hand "MARQUE COURANTE" column, where the marker strikes the cumulative total reached and writes the _scorer's jersey number_ beside it — circled = 3, plain = 2, plain with a dot on the struck box = 1 (free throw). `ParsedScoresheetData.scoringPlays` is that column, one entry per basket; `ScoresheetOcrProcessor.derivePlayerPoints` sums it into each `ScoresheetPlayerStats.points`, overwriting whatever the model returned there. Don't reintroduce "read each player's points" into the prompt — there is nothing to read. Rationale and the zero-vs-null rule: [`docs/superpowers/specs/2026-09-02-scoresheet-points-parsing-design.md`](./docs/superpowers/specs/2026-09-02-scoresheet-points-parsing-design.md).
- **A failed read is re-runnable without a re-upload.** `POST .../scoresheet-extraction/retry` (`ScoresheetsService.retryOcr`, any rostered member — same audience as the upload it re-runs, narrowed in the service) re-enqueues the OCR against the file already in R2, and refuses only on a `CONFIRMED` sheet (re-reading the photo would replace a manager's reviewed data, and the `MatchPlayerStat` rows folded from it, with a fresh guess). The retry budget itself is sized for the failure that actually happens — the vision provider answering `503 "experiencing high demand"` — so it is 5 attempts from a 30s exponential backoff (~7.5 min), not a burst that exhausts itself in 15 seconds; `ScoresheetOcrProcessor` rewrites a transient provider error into an actionable French `failureReason`, since that string is rendered verbatim to a club manager.
- **A stored `parsedData` is not necessarily a sheet.** The `failed` listener still writes an extraction row, with `parsedData: {}` standing in for "nothing was read" (the column is non-nullable), so every read goes through `asParsedScoresheetData` and treats anything not carrying the three arrays as no data at all: `GET .../scoresheet-extraction` reports `parsedData: null` and confirm refuses, rather than indexing into arrays that aren't there.
- A jersey number is unique only within a team, so `ScoresheetPlayerStats.team` / `ScoresheetScoringPlay.team` (`'home'` = Équipe A, `'away'` = Équipe B) is part of every join between the two halves.
- `isConsistent` checks internal arithmetic (quarters — overtime periods included as extra entries — summing to the final score, each play worth 1/2/3, a team's plays summing to its final score) and flips the sheet to `NEEDS_REVIEW` instead of failing the job. A confirming manager's `corrections` are trusted as ground truth and deliberately not re-checked.
- Confirming an extraction (`PATCH .../scoresheet-extraction/confirm`) also carries a `rosterMapping` — which `TeamPlayer` wore each jersey number on **our own** side of the sheet — and writes one `MatchPlayerStat` row per mapped player in the same transaction as the status write. That mapping is the whole reason season stats are possible; see the Team stats module below for why it is resolved here rather than derived later. `GET .../scoresheet-extraction` returns a `suggestedRosterMapping` pre-matched on the sheet's handwritten surname, which the manager confirms or corrects — a surname shared by two roster members resolves to `null`, never to the first hit.

## Team stats module

`server/src/team-stats` (mounted at `clubs/:clubId/teams/:teamId/stats`) aggregates a season's confirmed scoresheets into the per-player table behind the team's **Statistiques** screen — issue #78. Design record: [`docs/superpowers/specs/2026-09-02-team-season-stats-design.md`](./docs/superpowers/specs/2026-09-02-team-season-stats-design.md).

- **`MatchPlayerStat` is the join, and it is written at confirm time.** A parsed sheet identifies a scorer by `{ team, jerseyNumber }`; `EventVote` identifies an MVP by `TeamPlayer.id`. Nothing connected them, so no query could answer "how many points has this player scored this season". The mapping is resolved during the manager's confirm (the one moment a person is looking at both the sheet and the roster) and persisted as typed rows. **Don't** replace this with a `jerseyNumber` column on `TeamPlayer` — clubs share jersey sets between teams, so a player's number changes between matches and a stable column would silently misattribute points. **Don't** replace it with name-matching at read time either — that re-does fuzzy handwriting matching on every request and can't be corrected once wrong. Rows are replaced wholesale (`deleteMany` + `createMany`) on re-confirm, so a corrected mapping never leaves stale rows behind. `parsedData` itself is never rewritten by this path: it stays the verbatim read, and `MatchPlayerStat` is its typed projection.
- Only our own side of the sheet becomes rows — resolved from `Event.venue` (`HOME` → `home`), so the manager is never asked which column is theirs. The opposing squad isn't in any roster this app manages.
- **A season is 1 September → 31 August**, the way the FFBB labels one ("saison 2026-2027"), and `seasonYear` is the year it _starts_. Derived from `Event.startsAt`, never stored — nothing else in the schema knows about seasons, and a column would need backfilling and would drift from the event it describes.
- **Zero versus unknown carries over from the points-parsing rule.** Every `MatchPlayerStat` stat is nullable; a null contributes to neither the numerator nor the denominator of an average, so an average with no known value is `null` and renders `—`, never `0`. Games played counts rows (the player was on the sheet), so GP stays truthful even when one match's points are unknown.
- **The 3PT/2PT/FT split is a repartition of points scored, not a shooting percentage.** The sheet records makes and no attempts, so there is no accuracy to compute — never label it `3P%` in the basketball sense. The three point _counts_ are stored and sent, not percentages: a share of a sum-of-sums is not the average of per-match shares.
- **MPG and "season high minutes" are deliberately absent**, though issue #78 asks for them: the FFBB paper sheet carries no minutes and nothing else in the system tracks playing time. They stay blocked on `docs/feature-set.md`'s P1 _fair playing-time tracking_, which needs its own source of truth. Don't approximate them from quarter-participation marks.
- `TeamStatsService` queries `PrismaService` directly rather than injecting `TeamsService`/`EventsService` — same cross-module convention as Events and Dashboard — in three bounded queries regardless of how many matches a season holds. The roster is fetched in full, so a player who has never played still appears at zero. Awards come from `EventVote` and therefore exist for a match with no scoresheet at all; `voterTeamPlayerId` is never selected, so voting stays anonymous.

## Mail module

`server/src/mail` is the one way anything leaves the process as e-mail — verification links, password resets, and the e-mailed copy of a notification.

- **The provider is a DI seam, not a call site.** `MAIL_CLIENT` (`mail-client.ts`) mirrors `SCORESHEET_VISION_CLIENT` exactly: `MailService` depends on the interface, and `MailModule`'s factory binds `BrevoClient` when `BREVO_API_KEY` is set and `LogMailClient` when it isn't. That fallback is load-bearing, not a stub — with no key, every message (body included) is written to the server log, which is how the verification and password-reset flows are exercised in dev, in CI and in these sandboxes with no Brevo account. Copy the link out of the log and follow it.
- `BREVO_API_KEY` is deliberately **not** in `AppModule.validateEnv`, same policy as `REDIS_URL`/`R2_*`/`GEMINI_API_KEY`: a missing integration credential degrades one feature, it never stops the server serving every other route.
- **A send never fails the request that caused it.** Every send is a side effect of something the user actually asked for (registering, convoking a roster, finishing an OCR job), so callers use `MailService.sendAndForget()`, which logs and swallows. There is nothing a caller could do with a provider outage anyway.
- `MailService.absoluteUrl()` is the only place a stored relative `deepLink` becomes a full URL, resolved per send from `FRONTEND_URL` — so moving the frontend to a new hostname doesn't invalidate anything already written.
- **`From` is no-reply, `Reply-To` is the monitored mailbox.** Every message here is transactional and machine-generated, so the visible sender is `MAIL_FROM_EMAIL` (a no-reply address) — but a club volunteer _will_ answer a convocation e-mail with "je ne peux pas venir samedi", and a reply that bounces is worse than no reply address at all. `MAIL_REPLY_TO_EMAIL` is where those land. Both must be on a domain verified in Brevo, or every send is rejected with a 400.
- Templates are plain functions returning `{ subject, html, text }` (no template engine), all going through `templates/layout.ts`. That file is the **one** legitimate place in the repo where literal colour values live outside `packages/@basketeasy/ui/tailwind-preset.cjs`: e-mail clients strip `<style>` and know nothing about Tailwind, so the brand tokens are inlined copies kept in sync by hand. Every interpolation is HTML-escaped — a club name reaches these templates.

## Notifications module

`server/src/notifications` persists per-user notifications and fans each one out to e-mail and Web Push. It generalises the shape `ActionItem` already used on the dashboard: a finished French sentence composed server-side and rendered verbatim.

- **The in-app row is the source of truth and is written synchronously; delivery is best-effort and never fails the caller.** `NotificationsService.notify()` awaits one `createMany`, then hands e-mail and push to a fire-and-forget path. A convocation that exists but wasn't e-mailed is degraded; one that was e-mailed but never stored is a notification the user can't find again. And a bounced address must not roll back a call-up a manager already made.
- **`title`/`body` are denormalised on purpose.** A notification about a since-deleted or renamed event still reads correctly, and no read path joins across every module that can emit one. The `type` enum exists only to pick an icon, never to re-derive copy client-side.
- **`deepLink` is a frontend-relative path, never an absolute URL.** The same value feeds react-router for an in-app click and is prefixed with `FRONTEND_URL` for the e-mailed and pushed copies. Storing an origin would bake one deploy's hostname into rows that outlive it.
- Recipients resolve in **one** query regardless of batch size, and push targets in one more — no per-recipient round trip.
- **Web Push is behind its own `PUSH_CLIENT` seam** over the `web-push` package. Unlike `MAIL_CLIENT` there is no separate fallback binding: `WebPushClient` already no-ops and reports a null public key when `VAPID_*` is unset, and the frontend then hides its push toggle rather than offering a subscription nothing could deliver to. A `404`/`410` from the push service means the browser is gone for good and deletes the row; anything else (429, 5xx, a timeout) is transient and the subscription is kept.
- `emailNotificationsEnabled` on `User` is a **delivery-channel** preference, not a "don't tell me" one: the in-app row is written regardless. Push has no stored preference at all — a subscription exists for this browser or it doesn't.
- `me/notifications` and `me/push-subscriptions` are not club-scoped, same reasoning as `MyTeamsController`/`DashboardController`. `markRead` scopes its `updateMany` by `userId` so another account's row is a no-op match rather than something this caller could flip, without a second read to check ownership.
- **Emission points, and the trap in each:**
  - `EventsService.setEventConvocations` — the endpoint is a full replace a manager re-submits on every tweak, so the existing convocations are read **before** the transaction and diffed; only _newly_ convoked players are notified. Without that, every save re-notifies the whole call-up.
  - `EventsService.deleteEvent` — `EventConvocation` cascade-deletes with its `Event`, so recipients are gathered **before** `deleteMany` (the same shape as the existing `deleteScoresheetObjects`). A series scope sends **one** summary notification per recipient, never one per occurrence — up to `MAX_RECURRING_OCCURRENCES` (104) rows can be in scope.
  - `ScoresheetOcrProcessor` — notifies the uploader (resolved through `EventScoresheet.uploadedByTeamPlayerId` → `Player.userId`), and picks the deep link's club the same way `TeamsService.toMyTeamSummary` does, so a CTC event never links through a club the reader has no membership in.
  - In all three: `Player.userId` is nullable — a rostered player who never claimed an account has nobody to notify and is filtered out.
- Notification copy lives in pure functions next to the module that emits it (`server/src/events/event-notification-copy.ts`, `server/src/meeting-points/meeting-notification-copy.ts`), sharing the fixture and date wording from `server/src/common/event-copy.ts`. Dates are formatted in **Europe/Paris**, not UTC: the app stores no per-club timezone and Kluvo launches in Loire-Atlantique, so formatting in UTC would put a 20:30 match at "19:30" for every French reader.

## Account security

`server/src/auth/account-security.service.ts` owns e-mail verification and password reset. Both reuse `hashToken` and the `randomBytes(32)` shape `PlayerInvite` established — only the hash is ever stored.

- `EmailVerificationToken` and `PasswordResetToken` stay **two tables**, not one with a `purpose` column: their TTLs differ by an order of magnitude (24h vs 1h), a consumed reset revokes every `RefreshToken` while a consumed verification doesn't, and a shared table would turn "consume a token for purpose X" into a runtime check the type system can do instead. `consumedAt` rather than a delete keeps a _reused_ link distinguishable from an _expired_ one.
- **A password reset revokes every outstanding `RefreshToken`.** That is what makes it a recovery flow rather than a convenience — the usual reason to reset is that someone else may have the old password. The frontend deliberately does not auto-login afterwards, so the reader sees that this happened.
- **Both password-reset endpoints answer 204 whether or not the address exists.** A public endpoint that responded differently would be a user-enumeration oracle. `ForgotPasswordForm`'s confirmation copy keeps the same promise ("Si un compte Kluvo existe pour cette adresse…") — don't "improve" it into a confirmation that the address was found.
- A verification token snapshots the address it confirms, and `confirmEmail` refuses when the account's address has changed since — otherwise an older link would verify an address nobody proved they control.
- **`EmailVerifiedGuard` gates exactly three routes**: `POST /clubs`, `POST /clubs/:clubId/members`, `POST .../teams/:teamId/admins` — the actions that hand out authority over _other people's_ data. Everything else (reading, RSVP, roster edits, events) works unverified on purpose: a player invited to a roster who mistyped their address must never be locked out of their own team. Its 403 carries `code: 'EMAIL_NOT_VERIFIED'` (`EMAIL_NOT_VERIFIED_CODE` in `@basketeasy/types/account-security`) so the client can offer the resend button instead of a dead end. Adding a fourth gated route is a product decision, not a tidy-up.
- `User.emailVerified` is exposed as a **boolean**, never the `emailVerifiedAt` timestamp — nothing in the UI shows when it happened.

## Notifications on the frontend

- `app/src/notifications/` holds the feed. `NotificationList` is **one** component shared by the header bell's dropdown and `/notifications` (a `density` prop, not a desktop/mobile twin pair), so the read-on-click behaviour and the `error → loading → empty → data` ladder exist once.
- The feed **polls** (60s), deliberately — there is no SSE/WebSocket transport. The payload is a handful of rows and the audience is a club volunteer with one tab open; web push covers the case polling can't (a tab that isn't open at all).
- `CountBadge` (`@basketeasy/ui/count-badge`) is the one unread pip, composed by both `TabBarItem` and `NotificationBell`. It renders `null` at zero and is `aria-hidden` throughout — the number reaches assistive tech through the host control's accessible name (`aria-label="Notifications (3 non lues)"`), never as loose text announced twice.
- The bell is a **sibling** of `AccountMenu`, not an item inside it. On a phone there is no fifth bottom-nav tab — the bar is structurally fixed at four — so `AppHeader` renders a compact top bar (wordmark + `NotificationBellLink`, a plain link to `/notifications` carrying the same pip). `AccountPage` stays the mobile home for everything else the desktop header holds.
- `EmailVerificationBanner` mounts in `ProtectedRoute`, between `AppHeader` and the `Outlet` wrapper: the one place that renders on every protected page at **both** breakpoints. Inside `AppHeader` it would be invisible on a phone, inside `AppBottomNav` invisible on a desktop.
- `/verify-email/:token` and `/reset-password/:token` sit at the **top level** of the router beside `/invite/:token`, not under `PublicOnlyRoute` — they are opened from an inbox, and a visitor still holding a stale session must not be bounced to the dashboard mid-recovery.
- The public auth forms use `setError('root')` + `Alert`, **not** `toast()` — that is the established convention for `LoginForm`/`RegisterForm`/`InviteAcceptForm`, and the trigger stays on screen.
- `app/public/sw.js` is a **push-only** service worker: no fetch handler, no caching, no precache manifest. A caching worker is a class of stale-asset bugs the app has no offline story to justify; it exists solely because a push subscription can't exist without a registered worker. `usePushSubscription` registers it on subscribe, never on mount.

## Retention, audit & parental consent

`server/src/retention` enforces the documented data-retention policy; `server/src/audit` writes the security log it prunes. Design record: [`docs/superpowers/specs/2026-09-06-data-retention-policy-design.md`](./docs/superpowers/specs/2026-09-06-data-retention-policy-design.md), implementation plan: [`docs/superpowers/specs/2026-09-06-data-retention-implementation-plan.md`](./docs/superpowers/specs/2026-09-06-data-retention-implementation-plan.md).

- **One nightly BullMQ repeatable job** (`retention-sweep`, registered by `RetentionModule.onModuleInit` via `upsertJobScheduler`, so a redeploy re-registers rather than duplicates). `RETENTION_SWEEP_ENABLED` and `RETENTION_SWEEP_DRY_RUN` gate it; a scheduling failure is logged and swallowed, same "REDIS_URL is not boot-validated" policy as `QueueModule`. The policy itself lives in `RetentionService`, not the processor, so it is unit-testable without a queue.
- **Four independent steps under `Promise.allSettled`** — inactive accounts (12 months), audit logs (12 months, CNIL), expired parental consents, and meeting-point geocodes unused for 12 months (`GeocodedAddress.lastUsedAt`) — because "audit logs couldn't be pruned" is no reason to leave inactive accounts standing. Every run, dry-run included, writes a `RetentionRun` row: proving the policy executes is itself RGPD art. 5.2 accountability, and a log line is neither queryable nor durable enough to be that proof.
- **Erasing an account must not erase the club's history.** Rule 3 keeps stats forever, so the sweep sets `Player.userId = null` (the state an unclaimed roster entry has always been in) and lets everything hanging off `User` cascade. Never make it `player.deleteMany` — a `MatchPlayerStat` row is the club's record, not the person's account. One transaction per account, capped at `MAX_ACCOUNTS_PER_SWEEP` (500) a night.
- **`AuditLog` is authentication activity only**, not a general mutation trail — broadening it multiplies write volume on every request for a rule that only asks about authentication. `actorEmail` is denormalised precisely so an entry still reads after `userId` is `SetNull`ed by the account's deletion. Every write goes through `AuditService.record()`, which is fire-and-forget like `MailService.sendAndForget`: an audit insert must never turn a successful login into a 500. Emission points are all in `AuthService`/`AccountSecurityService`; a `LOGIN_FAILURE` or `PASSWORD_RESET_REQUESTED` against an unknown address is recorded with `userId: null` (the log is never served back, so it leaks no enumeration the endpoints hide).
- **`User.lastActiveAt` is the only inactivity signal.** Written by `LastActiveInterceptor` (global `APP_INTERCEPTOR`, debounced to once an hour per user per instance through an in-process map — deliberately not Redis: an activity ping must not depend on the queue) and directly by `login`/`refresh`, the two signals that don't pass `JwtAuthGuard`.
- **Parental consent is a staff attestation, not an e-signature** — the "easiest possible" v1. Required by `ClubsService.createPlayer` when `birthDate` makes the player a minor (`400 PARENTAL_CONSENT_REQUIRED`), and deliberately **not** required by bulk import: failing an import because row 34 is sixteen would make the feature unusable, so those players surface in the roster as _autorisation manquante_ and are resolved through `POST .../players/:playerId/parental-consent`. `isMinorBirthDate` (`@basketeasy/types/parental-consent`) is shared by the form and the API so the two can't drift.
- **`ParentalConsent` outlives what it documents** — `SetNull` to `Player`/`User`, never `Cascade` and never Prisma's default `Restrict` (which would block the deletion instead of surviving it). RGPD art. 17.3.b is the carve-out. The row snapshots the minor's name and birth date, because a proof that no longer says whose consent it was is not evidence. Its five-year clock starts at _deletion_ (`ClubsService.deletePlayer`, or the sweep erasing the linked account — `startParentalConsentRetention` in `server/src/common`), never at creation, and re-recording consent clears it.
- **Backup rotation (rule 5) is infrastructure**, set on the Postgres backup tool and the R2 bucket lifecycle. No application code enforces it; it belongs in the deploy runbook.
- **Not built yet, on purpose:** inactivity warning e-mails ahead of erasure and consent withdrawal / re-consent. The platform back-office over `AuditLog`/`RetentionRun` is built — see the section below; `RetentionService.eraseUserAccount` is the erasure primitive it shares with the nightly sweep, so a manual RGPD erasure and an automated one can never drift apart. The parent-facing side is the Guardians section below.

## Platform back-office

`server/src/platform-admin` (mounted at `/api/admin`) is the internal surface Kluvo staff use to
action RGPD access/erasure requests and confirm the retention sweep is doing its job, without a
`psql` session. Design record: [`docs/superpowers/specs/2026-09-06-backoffice-design.md`](./docs/superpowers/specs/2026-09-06-backoffice-design.md),
build decisions in the [implementation plan](./docs/superpowers/specs/2026-09-06-backoffice-implementation-plan.md)
beside it. It is a _reader_ of the Retention, audit & parental consent module above — `AuditLog`,
`RetentionRun` and `User.lastActiveAt` all belong to that policy; the only table this owns is
`PlatformAdmin`.

- **A `PlatformAdmin` grant is necessary but not sufficient.** Every `/admin/*` route requires an
  ordinary session _and_ a second, separately-signed `platformAccessToken` (15 min, claim
  `scope: 'platform-admin'`, header `X-Platform-Token`) minted by `POST /admin/login` against a
  TOTP code — so an access token stolen from an admin's browser opens nothing here. The token is
  never refreshed: expiry means re-entering a code, because a back-office tab left open on a
  shared machine has to go cold. `PlatformAdminGuard` is `ClubRolesGuard`'s shape with no route
  param to key off; `@PlatformRoles('DATA_OFFICER')` narrows a route the way `@ClubRoles('ADMIN')`
  does. `PlatformRole` is `SUPPORT` (run history + the redacted list) or `DATA_OFFICER` (PII,
  erasure, audit log).
- **`PLATFORM_JWT_SECRET` is its own secret, and the back-office is off without it.** Signing
  step-up tokens with `JWT_ACCESS_SECRET` would mean a leaked access secret mints back-office
  credentials too. It is deliberately not in `AppModule.validateEnv` (same policy as
  `REDIS_URL`/`R2_*`/`GEMINI_API_KEY`/`VAPID_*`): unset, every `/admin/*` route answers 503 and
  the surface does not exist for that deployment. Opt-in per deploy is the right default for the
  one place a compromised credential exposes every club's roster at once.
- **Grants are provisioned out-of-band only** — `server/src/cli/platform-admin.ts`
  (`grant`/`revoke`/`unlock`/`list`), compiled into the image and run in the server container as
  `docker compose exec server node server/dist/cli/platform-admin.js <command>`, where
  `DATABASE_URL` and `PLATFORM_TOTP_ENCRYPTION_KEY` are already set. It lives under `src/`, not a
  `scripts/` folder, precisely so it ships: the runtime image carries `dist/` only. There is no "promote to admin"
  button and no in-app TOTP enrollment screen: an enrollment screen _is_ a self-service path to
  arming a grant. `grant` prints the `otpauth://` URI once; re-running it rotates the secret.
- **TOTP is hand-rolled** (`totp.util.ts`, RFC 6238 over `node:crypto`, ±1 step) rather than a
  dependency — both RFCs publish test vectors, so `totp.util.spec.ts` _proves_ it instead of
  trusting it. Don't swap in `otplib` without a reason beyond taste.
- **The TOTP secret is encrypted at rest** (`totp-secret-crypto.ts`, AES-256-GCM under
  `PLATFORM_TOTP_ENCRYPTION_KEY`, the row's `userId` as additional data), so a database dump
  doesn't hand out the second factor and a ciphertext copied onto another row doesn't decrypt.
  The key is its own env var, not derived from `PLATFORM_JWT_SECRET`: rotating the signing
  secret after a token leak must not brick every admin's authenticator. Same opt-in rule —
  unset or malformed, `/admin/*` is off. A secret that doesn't decrypt fails closed and is
  fixed by re-running `grant`.
- **A code works once.** `matchTotpCounter` returns the step a code matched and
  `PlatformAdmin.lastUsedTotpCounter` records it; any step at or before it is a replay
  (`replayed_code`), even inside its ±1-step validity.
- **Lockout state is counted from `AuditLog`, not a counter column** — 5 `ADMIN_LOGIN_FAILURE`
  rows for one account in 15 minutes sets `lockedUntil` to a far-future sentinel ("until manually
  cleared", per `lockedUntilCleared`). Audit rows survive restarts and are shared across
  instances; an in-memory counter is neither. A lock that expired on its own would be a rate
  limit an attacker waits out, so only `platform-admin.ts unlock` clears it.
- **`login` decides inside one transaction holding `SELECT … FOR UPDATE` on the grant**, so
  parallel guesses are serialised and the lock lands on exactly the fifth failure. Its audit rows
  go through the transaction (not `AuditService`) so the next attempt counts them, and a refusal
  is _returned_ out of the transaction and thrown afterwards — throwing inside would roll back
  the failure row. Past the limit, **any** caller (grant or not) gets `429` and nothing is
  written: otherwise any logged-in account could fill the security log at request rate.
- **Redaction is by role, decided on the server.** Browsing (`PlatformAdminBrowseController`:
  clubs, club members, teams, rosters, users, players, events, scoresheets — design record
  [`2026-09-28-backoffice-browse-stats-actions-design.md`](./docs/superpowers/specs/2026-09-28-backoffice-browse-stats-actions-design.md))
  is open to both roles; every person in a response is an `AdminPersonRef` built by
  `platform-admin/redaction.ts`. `SUPPORT` gets initials and the e-mail domain only (no birth
  date, licence, attester name), `DATA_OFFICER` gets names and addresses. Free-text person search
  follows the same line: substring for a `DATA_OFFICER`, exact e-mail only for `SUPPORT`, so
  names can't be rebuilt from result counts. `PlatformAdminGuard` puts the role on the request
  for `@CurrentPlatformRole()`.
- **Every read that shows a `DATA_OFFICER` people's names is audited.** Opening
  `GET /admin/users/:userId` or `GET /admin/players/:playerId` as a `DATA_OFFICER` writes
  `ADMIN_PII_VIEWED` (awaited before the response; the player variant carries
  `metadata.subjectPlayerId`, and both carry `disclosedUserIds`/`disclosedPlayerIds` for the
  guardians/children the profile names). A `DATA_OFFICER`'s person list, club member list,
  team, roster or event page writes `ADMIN_PII_LISTED` (one row per page: `view`, `filters`,
  every person shown by id, collected structurally by `pii-disclosure.ts`), and so does any
  search, `SUPPORT`'s included, since even a redacted hit confirms an address has an account.
  Reading `GET /admin/audit-log` is itself recorded. `GET /admin/audit-log?userId=`/`?playerId=`
  matches the disclosed-id arrays too. A `SUPPORT` list shows initials only and writes nothing;
  its lists are ordered by date, not name, so the order can't rebuild what the initials hide,
  and event `notes` are withheld from it. Neither `usePlatformUser` nor the audited list hooks
  refetch on window focus: "who looked at this person's data" must not be padded with rows
  produced by a tab regaining focus.
- **`subjectEmail` outlives an erasure on purpose.** `ADMIN_PII_VIEWED`, `ADMIN_EXPORT_GENERATED`
  and `ADMIN_USER_ERASED` rows keep the subject's address for the audit log's own 12-month
  retention after the account is gone: a row that no longer says whose data was read or erased
  is no evidence. Staff accounts can't be erased from the back-office (403, like impersonation);
  the CLI revokes the grant first.
- **Support actions are named routes, never a field editor.** `PlatformAdminActionsController`
  (`POST /admin/users/:id/revoke-sessions`, `…/clubs/:id/members/:userId/role`, `…/scoresheets/:id/retry`,
  thirteen in all) is open to both roles (club deletion aside: `DATA_OFFICER` only), and every route takes a 10–500 character reason
  (`ReasonDto`). `PlatformAdminActionsService` writes the change and exactly one
  `ADMIN_SUPPORT_ACTION` audit row (`metadata.action`, `reason`, the subject ids, `before`/`after`)
  in the **same transaction**, so a refused or failed action leaves no row; side effects that can't
  roll back (an e-mail, an OCR enqueue) run after the commit. Domain rules are reused, not
  re-implemented: `server/src/clubs/club-writes.ts` holds the membership removal and consent write
  `ClubsService` also calls, and the last club `ADMIN` is protected under `SELECT … FOR UPDATE`
  (409). A consent staff record is `ParentalConsentSource.PLATFORM_STAFF`, never passed off as the
  club's attestation. Frontend: `app/src/admin/actions/` — one `AdminActionDialog`
  (react-hook-form + zod, server refusal in the dialog's `Alert`, success as a toast), with
  `AdminMemberDialog` and `AdminAddTeamAdminDialog` for the two that need more than text fields.
- **Staff can create a club, never a person.** `POST /admin/clubs` (`CLUB_CREATED`) writes the club, its
  first `ADMIN` membership and the audit row in one transaction through `createClubWithAdmin`
  (`clubs/club-writes.ts`, shared with `ClubsService.createClub`). The first admin must be an existing
  account, picked through the global search (exact e-mail for `SUPPORT`); an unverified one is allowed
  and only warned about, since `EmailVerifiedGuard` still gates what they can hand out. A duplicate FFBB
  code is the one 409 and lands on its field in `AdminCreateClubDialog`.
- **Erasure requires a reason**, stored in the `ADMIN_USER_ERASED` row in the _same transaction_
  as the deletion. `AuditLog.userId`/`actorEmail` is always the acting **admin**; the subject is
  `metadata.subjectUserId`, which is why `GET /admin/audit-log?userId=` matches both — filtering
  on either alone answers half of "who accessed this person's data".
- **The RGPD export is `POST /admin/users/:userId/export`**, not a GET, and carries the same
  mandatory reason as erasure: it materialises a complete copy of one person's data for handover
  outside the system, a larger disclosure than the single-profile view. It emits
  `ADMIN_EXPORT_GENERATED` and deliberately **not** `ADMIN_PII_VIEWED` — two different
  disclosures with different scopes, and folding them would make a "who saw what" filter wrong in
  both directions. Generate it **before** an erasure: erasure detaches roster entries rather than
  deleting them, so afterwards nothing links those rows back to the person, which is why the
  export section sits above the erase section on `AdminUserDetailPage`.
- **Three things the export deliberately omits, each RGPD art. 15(4)** ("shall not adversely
  affect the rights and freedoms of others"), each named in the bundle's own `notice` block so an
  omission reads as a decision and not an oversight: a vote's **nominee** (peer voting is
  anonymous by construction, and the nominee is a statement about another player), the **acting
  admin's identity** on rows recording something done _to_ the subject (they learn their data was
  accessed, not by whom), and a push subscription's **endpoint and keys** (together a live
  capability to push to that browser, not a description of the person). Don't "complete" the
  export by adding them back.
- **Read-only impersonation is a disclosure, enforced where authentication happens.** A
  `DATA_OFFICER` starts one with a reason (`POST /admin/users/:userId/impersonate`, refused for
  oneself and for any account holding a grant) and gets a 15-minute, never-refreshed token signed
  with `PLATFORM_JWT_SECRET`, scope `impersonation-readonly` (the `scope` claim is what keeps it
  apart from the step-up token, which shares the secret). `JwtAuthGuard` is
  `AuthGuard(['jwt', 'jwt-impersonation'])`, and `ImpersonationStrategy` refuses every
  non-`GET`/`HEAD` (403 `IMPERSONATION_READ_ONLY`) and re-reads the `ImpersonationSession` row and
  the actor's grant, lock and `allowedCidrs` on every request, so « Quitter » or a revoked grant
  ends it at once. The subject becomes `request.user`, with `user.impersonation` set: that is what
  makes `PlatformAdminGuard` refuse outright, `LastActiveInterceptor` skip (staff viewing must not
  reset the erasure clock) and the vote endpoint null `myVote` (`myVoteHidden`). Start, replace
  and exit write `ADMIN_IMPERSONATION_STARTED`/`_ENDED` in the session's transaction; expired rows
  are dropped by the audit-log sweep step a day later. Frontend (`app/src/impersonation/`): the
  token lives in memory beside the admin's own (`setImpersonationToken`), replaces it on product
  calls only, never triggers a refresh, and every non-`GET` product call is refused in
  `apiClient` before it leaves the browser (`/auth/logout` included). Entering and leaving clear
  the whole query cache; `ImpersonationBanner` (under `AppHeader` in `ProtectedRoute`) counts down
  and owns expiry. Design record:
  [`2026-09-28-backoffice-impersonation-design.md`](./docs/superpowers/specs/2026-09-28-backoffice-impersonation-design.md).
- The frontend is `app/src/admin/`, its own top-level route tree outside `ProtectedRoute`,
  `React.lazy`-loaded so admin-only code is never bundled for the 99.9% of users who aren't
  platform staff. `AdminShell` deliberately wears no product chrome — no `AppHeader`, no club
  switcher, no bottom nav — because conflating it with the product invites browsing it like a
  support dashboard rather than treating every click as an audited action. `AdminRoute`'s check
  is advisory; the real enforcement is server-side.

## Guardians (parents acting for a child)

`server/src/guardians` plus changes across events, dashboard, team stats, meeting points and notifications let one or more parents answer for a child. Design record: [`docs/superpowers/specs/2026-09-27-parent-guardian-design.md`](./docs/superpowers/specs/2026-09-27-parent-guardian-design.md), one spec per part next to it.

- **Being a parent is a `PlayerGuardian` row, never a `ClubRole`.** `ClubMembership` is unique per user and club, and a parent is often also a player, coach or admin of the same club. A parent who is nothing else has **no membership at all**: the link alone opens the child's team pages, through `@AllowGuardians()` on `ClubRolesGuard` (the fallback query runs only when the membership check fails). Adding the decorator to a route is a product decision — today it covers the reads a rostered member has on their own team plus the RSVP and travel-mode writes. It never touches `TeamManagerGuard` or `EmailVerifiedGuard`: a guardian link carries no manager rights.
- **`resolveActingTeamPlayer` (`server/src/common/acting-as.ts`) is the one place that decides « may this user act for this player ».** Every route with a « me » takes an optional `?forPlayerId=`; a stranger's id is a 403, never « not rostered ». Votes, logistics and scoresheet uploads deliberately don't take it (design decision 9).
- **`EventRsvp.respondedByUserId` is the caller, never the persona**, so « Répondu par Sophie M. » and the coach's « · parent » tag read the truth. Travel-mode changes don't rewrite it. A respondent is first name + last initial only, never a relationship label.
- **Invites:** admin-issued, one link per parent, 7 days, at most 4 guardians and 4 live links per player. Accepting for a minor requires the parent's consent and writes a `ParentalConsent` with `source: GUARDIAN_IN_APP` (the staff attestation stays as the fallback). The consent rule is checked before registering, so a refused consent never leaves an orphan account.
- **Notifications fan out through `resolvePlayerAudience` + `groupByRecipient`** (`server/src/common/player-audience.ts`): the child's own account and every guardian, merged per reader so a playing parent convoked with their child gets one message (« Léo et vous êtes convoqué·es »). A parent's copy is tagged with `Notification.subjectFirstName` and deep-links through the **child's** club with `?pour=<playerId>`. Self-only copy is unchanged.
- **Frontend persona state lives in `ActingAsProvider`** (`app/src/guardians/`, mounted in `ProtectedRoute`): `?pour=` wins and is stripped, then the remembered choice (localStorage, a convenience only), then « Moi », then the first child for a guardian-only user. **Team-scoped hooks act for the child only on the child's own teams** (`useTeamActingAs`) — on any other team the reader is themself, so a parent who coaches a different team still manages it while switched to their child. On the child's own team the child wins: a parent who coaches their child's team switches back to « Moi » to manage it (the banner's « Changer » is one tap away). The persona is the last segment of every persona-scoped query key, so switching never reuses the other persona's cache; prefix invalidations match both. Acting for a child forces the player view (`useHasManageRights` is false, the event and team pages drop their manager branch).
- `PersonaSwitcher` (header chip, hidden with one persona, pip = the _other_ personas' pending answers), `PersonaSheet` (a `Dialog` with `variant="sheet"`, not a second modal primitive) and `ActingAsBanner` (beside `EmailVerificationBanner`, same reasoning) are the three surfaces; there is no fifth bottom-nav tab.

## Meeting points module

`server/src/meeting-points` backs the match meeting point (« point de rendez-vous »). Players who are coming either meet the group there or go straight to the gym. Design record: [`docs/superpowers/specs/2026-09-27-match-meeting-point-design.md`](./docs/superpowers/specs/2026-09-27-match-meeting-point-design.md), plus one spec per part next to it.

- **RDV time formula:** `meetsAt = meetsAtOverride ?? floorTo15min(startsAt − buffer − travelMinutes)`. The place resolves event override → team default → **owner** club default; the buffer (default 45) resolves team → owner club. All of it is resolved on read in `resolveMeetingPlan` (`meeting-plan.ts`), two queries per batch (team + owner club, and the matches' `EventMeeting` rows), and lands on `TeamEvent.meetingPlan`, which is null for a TRAINING and also names the default the match would fall back to (`defaultMeetingPoint`). The formula itself (`computeMeetsAt`, `floorToQuarterHour`) lives in `@basketeasy/types/meeting-points`, so the API and the « Ajuster » preview can't drift.
- **Per-match state is a 1–1 `EventMeeting` row**, not columns on `Event`: override place, travel minutes and their route key, `meetsAtOverride`, `meetingAnnouncedKey`. No row means nothing stored yet. Every meeting route (settings and per-match) lives in `MeetingPointsController` and answers with the plan, so `meeting-points/` never imports from `events/`; Events depends on it, for the plan on every `TeamEvent`.
- **`travelRouteKey` is the staleness rule.** The origin is inherited, so moving a club default silently changes the route of every match. Travel minutes, computed or typed, only count when the stored key (`v1:` + sha1 of the normalised origin and location) matches the current route. A mismatch reads as « à confirmer » and re-queues itself. Don't "fix" this by rewriting every event on a settings change.
- **Routing is a DI seam.** `ROUTING_CLIENT` binds `OrsRoutingClient` when `ORS_API_KEY` is set and `NullRoutingClient` otherwise; the key is not boot-validated. Recomputes run on the rate-limited `meeting-travel` BullMQ queue (a stale route found on read is queued at most every 5 min per event per instance; a settings change queues only the matches that inherit the moved address), while « Recalculer » runs synchronously with a 5 s provider timeout and a 15 s per-match cooldown. Every lookup goes through the `GeocodedAddress` cache; a "not found" is kept for 7 days, a provider failure is never cached, concurrent lookups of one address share a call, and rows unused for 12 months are pruned by the retention sweep.
- **Player choice:** `EventRsvp.travelMode` (`MEETING_POINT` by default, so not choosing counts as RDV). It can only be set while `GOING` and is reset when the answer leaves `GOING`.
- **Notifications:** the convocation copy includes the RDV once its time is known. `EVENT_MEETING_CHANGED` goes only to players who are GOING with `MEETING_POINT`, only for matches in the next 7 days (the only ones `announceMeetingChanges` reads), and only when a _known_ RDV changes versus `EventMeeting.meetingAnnouncedKey`. The first known RDV notifies too, as `EVENT_MEETING_FIXED` (« RDV fixé »): the travel choice promises « vous serez prévenu·e » while the hour is « à confirmer ». A settings change that moves no route (buffer, place name) announces through an `announce` job on the same queue, never inside the admin's request.
- A kick-off change (`updateEvent`, `updateEventTimeOfDay`, FFBB import) clears `meetsAtOverride`. A MATCH → TRAINING switch deletes the `EventMeeting` row.
- **Frontend:** `app/src/meeting-points/` holds the club/team settings card and dialog, the per-match `EventMatchTimeline` (RDV → arrival → tip-off, which replaces the venue row on a MATCH in `EventLogisticsCard`) with its `EventMeetingDialog`, and `EventTravelModeControl` (a `RadioCardGroup` with `tone="choice"` and `indicator` in the decision band). Both dialogs are react-hook-form + zod and share the name/address pair rule from `meetingPointSchema.ts`; travel counts come from `countEventRoster`'s `travel`, the same scoping as the attendance counts. The screens follow the validated Claude Design canvas linked from the Part 4 spec.

## What's deliberately not here yet

No Scheduling (beyond the plain Events CRUD above), Payments, Subvention, or Volunteer/Role domain modules; no notification digest/batching and no scheduled RSVP reminders (the queue now has a nightly `retention-sweep` repeatable job to copy the shape from, but reminders are still their own slice), no per-type × per-channel notification preference matrix, and no real-time transport for the feed (it polls); no team **Statistiques** screen over the Team stats module's endpoint yet, and no roster-mapping step in `ScoresheetExtractionCard` — until that lands the card confirms with an empty mapping, so a sheet confirmed today produces no per-player stats; no carpooling on top of the meeting point (who drives, free seats) and no RDV on the dashboard agenda yet; no cross-club/CTC governance dashboard (P2, tracked separately from the Teams module's CTC data model above); no inactivity-warning notification before an account is erased; no Nx, no CD/deploy workflow, no i18n library wired in. This is the scaffold described in the README's "Status" section, now with Auth, Clubs/Players, Teams, and Events as the first domain modules — extend it module by module per `docs/feature-set.md` rather than bulk-generating the full domain model at once.
