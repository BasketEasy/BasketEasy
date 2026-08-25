# Frontend revamp — "Parquet" direction + navigation fixes

Date: 2026-08-25. Scope: `app/` and `packages/@basketeasy/ui`. No backend, no
schema, no new endpoints.

Supersedes nothing. Complements [`docs/ux-audit/README.md`](../../ux-audit/README.md)
and [`docs/ux-audit/scoping-plan.md`](../../ux-audit/scoping-plan.md), whose
six items have all shipped — this spec covers what those documents did _not_
find, plus the first deliberate visual direction the app has had.

Visual reference: the "Parquet" design canvas (5 artboards — Tableau de bord,
Équipe/Effectif, Équipe/Événements, Page d'accueil, Jetons & états).

## 1. Why now

Two independent problems, one workstream:

1. **The UI reads as unfinished.** `Card`, `Dialog`, `Input` and `Select` all
   use `bg-cream`, and so does `body` — every surface in the app is
   `#FAF5EF`, separated only by a 1px `#E7DECF` border. There is no elevation
   system, so nothing looks placed on anything. Compounding it,
   `Button`'s `outline` and `ghost` variants both hover to `bg-cream`, which
   on a cream page is no change at all: most of the interactive surface has
   zero hover feedback.
2. **Failure states don't exist.** `grep -rn "isError" app/src` returns zero
   results. A failed request either spins forever (`TeamDetailPage.tsx:336`
   gates on `isLoadingTeam || !team`) or falls through to an `EmptyState`
   that tells the user their data does not exist. There is no error boundary
   and no 404 page.

## 2. Direction: Parquet

The club gym as material — warm layered neutrals, court-line rules, real
elevation. It **evolves** `docs/brand.md` rather than replacing it: not one
brand colour changes value.

### 2.1 Surfaces (new)

The core move. Today page and card are the same colour; Parquet spreads them
across four steps so elevation is readable without relying on the border.

| Token       | Value     | Use                                                |
| ----------- | --------- | -------------------------------------------------- |
| `sunk`      | `#E9DDCA` | segmented-control track, avatar overflow chip      |
| `ground`    | `#EFE4D4` | page background (`body`) — **new, replaces cream** |
| `surface-2` | `#FAF5EF` | inputs, table stripes, nested panels (old cream)   |
| `surface`   | `#FFFCF7` | cards, dialogs, header — **new, lifts above page** |

`cream` is **kept as an alias of `#FAF5EF`** so no existing `bg-cream` /
`text-cream` class breaks; new work uses the semantic names.

### 2.2 Brand colours — unchanged values, narrower use

`orange #D4622A`, `orange-text #AA4F22` (5.03:1 on cream, keep for text),
`blue-green #1E5F74`, `charcoal #23201C`, `muted #5B564F`, `border #E7DECF`,
`success #2F7D5C`, `error #B23A2E` all keep their exact current values.

Added, because they are already being hand-written as one-off hexes and
`rgba()` literals across components:

| Token             | Value     | Replaces                                      |
| ----------------- | --------- | --------------------------------------------- |
| `orange.hover`    | `#95441C` | primary-button hover, currently `/90` opacity |
| `orange.tint`     | `#FBEDE4` | active nav background                         |
| `blue-green.2`    | `#2F6E80` | partner-club (CTC) avatar accent              |
| `blue-green.tint` | `#EAF1F3` | ghost-button hover                            |
| `border.strong`   | `#D6C8B2` | input/control borders, court-line rules       |
| `error.tint`      | `#F7EAE8` | inline error panel background                 |

**Usage rule:** orange is the _rare_ accent — primary action, active nav
state, convocation. Blue-green carries structure (rules, avatars, section
accents). Today orange and blue-green are used at roughly equal weight; that
evenness is why neither reads as the brand colour.

### 2.3 Elevation

Tailwind's stock `shadow-sm/md/lg` are neutral grey and read cold on cream.
Override them with warm-tinted equivalents so every existing `shadow-*` class
in the codebase upgrades without a single call-site edit:

- `sm` — `0 1px 2px rgba(59,42,24,.07)`
- `md` — `0 2px 6px rgba(59,42,24,.08), 0 1px 2px rgba(59,42,24,.05)`
- `lg` — `0 10px 28px rgba(59,42,24,.11), 0 2px 6px rgba(59,42,24,.06)`

### 2.4 Typography

| Role     | From             | To                        | Why                                                                              |
| -------- | ---------------- | ------------------------- | -------------------------------------------------------------------------------- |
| Headings | Barlow Condensed | **Big Shoulders Display** | Same condensed footprint, far more character; tabular figures that hold a column |
| Body     | Inter            | **Atkinson Hyperlegible** | Designed for legibility in poor conditions — a gym, a small screen, low light    |

This is the one place the spec departs from `docs/brand.md`'s visual-system
table. `brand.md` must be updated in the same change, not left to drift.

Big Shoulders needs tighter leading than Barlow: the global `h1,h2,h3` rule
moves to `line-height: 0.94`. Numerals (times, dates, counts, scores) get
`font-variant-numeric: tabular-nums` via a `.tabular` utility.

**Decision — no CSS-variable conversion.** `docs/superpowers/specs/2026-08-07-design-system-design.md`
planned a CSS custom-property layer that was never built. Parquet is a
single light theme with no dark mode in scope, so the variable layer would buy
nothing today and would break every `bg-x/90` opacity utility in the process.
Tokens stay literal hexes in `tailwind-preset.cjs`. Revisit if and when a dark
theme is actually specced.

### 2.5 Signature elements

- **Court-line rule** — a 2px blue-green rule at 22% opacity separating a
  section heading from its content. Replaces the current bare heading.
- **Time block** — event cards lead with a filled blue-green block carrying
  the time in Big Shoulders + the event type; the block is solid for a
  `MATCH`, `surface-2` with a border for a `TRAINING`.
- **Active nav** — orange tint background plus a 2px inset orange underline.

## 3. Navigation and interaction fixes

Findings from the 2026-08-25 review, grouped by the phase that fixes them.

### 3.1 Correctness (ship independently of the visual work)

| #   | Problem                                                                                             | Evidence                                                       | Required behaviour                                                                              |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| C1  | Team deletion is one click, unconfirmed, styled identically to "Modifier"; cascades roster + events | `TeamDetailPage.tsx:415`                                       | Confirm dialog stating the blast radius, `variant="destructive"` trigger                        |
| C2  | Failed reads render as a permanent spinner or as "Aucune équipe pour le moment"                     | zero `isError` handling app-wide; `TeamDetailPage.tsx:336`     | Every query consumer branches on `isError` with a retry; genuine 404 distinguished from failure |
| C3  | Any render throw whites out the SPA                                                                 | no `ErrorBoundary` in `app/`                                   | Route-level boundary inside `ProtectedRoute`, plus a root boundary                              |
| C4  | Unknown URLs silently `Navigate` to the marketing page                                              | `App.tsx:37`                                                   | A `NotFoundPage` rendered in place, app shell retained when authenticated                       |
| C5  | Non-admins are silently bounced from a club URL                                                     | `MembersPage.tsx:362`                                          | A 403 state naming the club, with a route back                                                  |
| C6  | Blank white screen on every refresh of a protected route                                            | `ProtectedRoute.tsx:8`, `PublicOnlyRoute.tsx:10` return `null` | Render the header shell while the session resolves                                              |

### 3.2 Affordances

| #   | Problem                                                                                                                                                                                | Evidence                                                                | Required behaviour                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A1  | Nav items are `<button onClick={navigate}>` — no middle-click, no new tab, announced as "button"                                                                                       | `AppHeader.tsx:80-100`, `MyTeamsPage.tsx:54`, `DashboardPage.tsx:41,69` | Anything that changes the URL is an `<a>`/`<Link>`; `<button>` reserved for mutations      |
| A2  | No indication of the current page                                                                                                                                                      | no `aria-current` anywhere                                              | `aria-current="page"` + the active nav treatment from §2.5                                 |
| A3  | Ghost/outline hover is invisible                                                                                                                                                       | `Button.tsx:12-13` `hover:bg-cream` on a cream page                     | Ghost → `blue-green.tint`; outline → `sunk`. Resolved automatically once §2.1 lands        |
| A4  | No action shows it is working — 26 `disabled={isPending}` sites, zero spinners                                                                                                         | e.g. `LoginForm.tsx:70`                                                 | A `loading` prop on `Button` that swaps in `Spinner` and keeps the label                   |
| A5  | `TabsTrigger` and `DropdownMenu` have no focus-visible styles; five inconsistent recipes elsewhere; `Button`'s `ring-offset-2` has no `ring-offset-*` colour so the halo renders white | `Tabs.tsx:26`, `Button.tsx:6`, `Checkbox.tsx:13`, `Select.tsx:15`       | One shared focus recipe applied to all interactive primitives                              |
| A6  | RSVP selection is conveyed by background colour alone; labels `hidden` below `md:`                                                                                                     | `EventRsvpControl.tsx:9-13,79-106`                                      | `role="radiogroup"` + `aria-checked`, plus a non-colour cue (pressed inset)                |
| A7  | Loading is always a one-line spinner; lists jump from ~20px to a full table                                                                                                            | `Loader.tsx` used everywhere                                            | Skeleton rows matching each list's row height                                              |
| A8  | Logout exists only on the dashboard                                                                                                                                                    | `DashboardPage.tsx:96`                                                  | An account menu in `AppHeader`                                                             |
| A9  | Back link is hardcoded `← Mes équipes` regardless of entry path                                                                                                                        | `TeamDetailPage.tsx:346`                                                | Origin carried in `location.state`, label derived from it, `/my-teams` fallback            |
| A10 | Two competing feedback conventions — `toast()` in one file, inline `Alert` everywhere else                                                                                             | only `AccountProfileForm.tsx` calls `toast`                             | Inline for field validation, toast for completed-mutation outcome; documented in CLAUDE.md |

### 3.3 Consistency (lower impact, fold into the composition phase)

- `TeamDetailPage` never uses `useIsDesktopViewport`, so its Clubs partenaires
  and Administrateurs tables scroll sideways on a phone while `MembersPage`
  and `MyTeamsPage` collapse to cards.
- Inline team edit replaces the page header with a bare unwrapped `<div>`
  (`TeamDetailPage.tsx:350`) while every other entity edit uses a `Dialog`.
- "Effectif du club" never names the club (`MembersPage.tsx:368`).
- `setSearchParams({ tab })` replaces the whole param set
  (`TeamDetailPage.tsx:433`, `MembersPage.tsx:380`) — latent filter-loss bug.
- `/about` is registered but unreachable (`App.tsx:29`).
- `Chargement...` (10 sites) vs `Chargement…` (1 site).

## 4. Out of scope

Dark mode. i18n extraction. A month-grid calendar (audit item 5b, still
blocked on nothing but appetite). Any backend change. Nx. PWA.

## 5. Acceptance

- No surface in the app shares a background colour with its parent.
- No query consumer can render an `EmptyState` on a failed request.
- Every interactive primitive has the same visible focus ring.
- Every URL-changing control is a real link.
- `pnpm format:check && pnpm lint && pnpm test && pnpm build` passes.
