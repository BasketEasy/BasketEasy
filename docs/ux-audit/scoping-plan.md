# UX Audit — Engineering Scoping Plan

Source: [`docs/ux-audit/README.md`](./README.md) (findings 2.1–2.7, wireframes in [`./wireframes/`](./wireframes/)). This document turns the audit's 6-item priority list into concrete engineering scopes, grounded in the actual `app/`, `server/`, and `packages/@basketeasy/*` code as of this pass. No code was changed to produce this plan.

## 0. Priority order — confirmed, with two sequencing notes

The audit's order (Empty states → Team Detail tabs → Club switcher → Dashboard → Events calendar → Table mobile collapse) holds up against the codebase. Two things the audit's ordering didn't spell out, surfaced by reading the actual hooks/components:

1. **Club switcher → Dashboard is a stronger dependency than the audit states.** The audit sequences Dashboard after the switcher only because the switcher is "frontend-only" and cheaper. Reading `AppHeader.tsx`, the "which clubs does this user administer" computation (`useAccount()` memberships filtered by role, cross-referenced with `useClubList()`) is duplicated logic currently trapped inside `AppHeader`. Item 3 should extract it into a shared hook (e.g. `useAdminClubs()`); item 4's "Clubs administrés" stat tile and team cards should then reuse that hook rather than re-deriving it a third time. Net: no change to the order, but item 4 should explicitly depend on the hook item 3 produces, not just "land after."
2. **Events calendar (item 5) needs to be split before work starts**, not just flagged as partial. See §5 — the wireframe's month grid depends on data (RSVP counts, event `type`) that doesn't exist per `CLAUDE.md`'s Events roadmap, but the "what's this week" scanning problem can be solved today with a plain agenda/list view fed by existing `from`/`to` query params. Treat 5a (day-grouped agenda, no grid) and 5b (RSVP/type-enriched month grid) as two separate tickets — confirmed via design review as the actual v1/later split, not just an interim compromise (see §5).

Everything below assumes items land in order 1→2→3→4→5a→6, with 5b out of scope until RSVP/convocation backend work (a separate, larger initiative) lands.

---

## 1. Empty states (2.3)

**What ships:** A shared `EmptyState` component in `@basketeasy/ui`, dropped into the empty branch of every list view in the app: `MembersPage` (Membres/Joueurs/Équipes — 3 sites), `TeamDetailPage` (Clubs partenaires/Effectif/Événements/Administrateurs — 4 sites), and `MyTeamsPage` (1 site, currently a bare `<p>`, migrated to the shared component for consistency). Each instance gets a role-appropriate icon, one line of copy, and — where the viewer has permission to act — a primary CTA button that opens the page's existing "add" dialog (no new dialogs; empty state's CTA just triggers the same `Dialog`/`onOpenChange` state the page's own "+ Ajouter" button already wires up). Non-admins/non-managers viewing an empty list (e.g. a club `MEMBER` looking at an empty roster) get the icon + message only, no CTA.

**Frontend changes:**
- New: `packages/@basketeasy/ui/src/components/EmptyState.tsx` (+ `.test.tsx`, `.stories.tsx`), exported via a new `"./empty-state"` entry in `packages/@basketeasy/ui/package.json`'s `exports`. Composed entirely from existing `Card` + `Button` — no new Radix dependency.
- Modify: `app/src/pages/MembersPage.tsx` (3 call sites, replacing the bare `Table`/`Pagination` fallthrough when `total === 0`), `app/src/pages/TeamDetailPage.tsx` (4 call sites), `app/src/pages/MyTeamsPage.tsx` (1 call site).
- Each page decides its own icon/copy/CTA text (French copy per `CLAUDE.md`'s French-first convention) — `EmptyState` itself takes `icon`, `title`, `description`, and an optional `action` node as props, no page-specific logic baked into the shared component.

**Backend/types changes:** None. Frontend-only — every list already reports `total: 0` via existing `PaginatedResult`/array responses.

**Dependencies/sequencing:** None — can start immediately. Landing first matters because item 2's new Effectif card view (§2) and item 5a's agenda view (§5) should both use `EmptyState` from day one rather than getting a bare "no rows" fallback that then needs retrofitting.

**Effort estimate:** **S.** One small, well-bounded component; the rollout across 8 call sites is mechanical copy/paste-style wiring, not new logic.

**Acceptance criteria:**
- [ ] `EmptyState` exists in `@basketeasy/ui`, documented in Storybook, with a unit test covering the with-action and without-action variants.
- [ ] All 8 identified empty-list call sites render it instead of a bare "Aucun résultat" or ad hoc `<p>`.
- [ ] Non-admin/non-manager viewers see no CTA in a list they can't add to (verified per page's existing `isAdmin`/`canManageTeam` gating).
- [ ] `Pagination`'s own "Aucun résultat" caption is either suppressed or intentionally left as a secondary indicator underneath the new empty state (decide during implementation, not both competing for attention).

**Open questions/risks:**
- `Pagination` still renders "Aucun résultat 0 sur 0" in its own caption regardless of what's above it in the empty branch — decide whether to hide `Pagination` entirely when `total === 0` (cleaner) or leave it (shows page-size controls consistently). Low risk either way, but worth a decision up front so all 8 sites are consistent.
- Empty-state copy for a *filtered-to-empty* result (e.g. searched for a name with no matches) should differ from a *genuinely-empty* list (e.g. brand-new club, zero players ever added) — the CTA ("+ Ajouter un joueur") makes no sense mid-search. Each page needs to pass different copy/action based on whether a filter is active vs. the underlying list is truly empty; this is a small but real branch in each of the 8 call sites, not just a prop swap.

---

## 2. Team Detail tabs (2.2)

**What ships:** `TeamDetailPage.tsx` (currently 690 lines, 4 stacked full sections) restructures into a `Tabs` shell mirroring `MembersPage`'s URL-driven pattern (`?tab=`, `useSearchParams`): **Effectif** (default) / **Clubs partenaires** / **Administrateurs**, plus a fourth tab that becomes item 5a's agenda view once that lands (until then, it stays the existing Événements table, just moved into a tab). The Effectif tab defaults to a grouped, avatar-chip card view — "JOUEUSES (n)" / "STAFF (n)" sections split on `TeamPlayer.role` (`PLAYER`/`COACH`, already present on every roster row), each player rendered as `Avatar`/`AvatarFallback` with initials + name — with a "Basculer en vue tableau" toggle that reveals the existing sortable/searchable/paginated `Table` unchanged. The Clubs partenaires and Administrateurs tabs keep their current table UI as-is (no card view proposed for those in the wireframe); the Administrateurs tab does **not** gain search/pagination as part of this item (see Open questions).

**Frontend changes:**
- Modify: `app/src/pages/TeamDetailPage.tsx` — wrap the 4 sections in `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (already imported and proven in `MembersPage.tsx`); move the team header/edit/delete block above the tabs, unchanged.
- New: a roster card view component (e.g. `app/src/clubs/TeamRosterCards.tsx`) rendering the grouped avatar-chip layout, reusing `Avatar`/`AvatarFallback`/`Card`/`Badge` from `@basketeasy/ui` — all already exist, confirmed via `packages/@basketeasy/ui/src/components/Avatar.tsx`. A small local `getInitials(firstName, lastName)` helper is needed (not a new primitive, just a string util) since `AvatarFallback` takes children, not a name prop.
- The card view should fetch the **full** roster (all roles, not one paginated page) the same way `TeamDetailPage` already fetches `allTeamPlayers` for the "addable players" computation (`LINKING_PAGE_SIZE = 100`, already defined in the file) — team rosters are small enough that "who's on this team" should never itself be paginated; only the "power view" table toggle should stay paginated at `DEFAULT_PAGE_SIZE = 25`.
- The existing `TeamClubRow`, `TeamPlayerRow` (table variant), `TeamAdminRow` components are unchanged, just relocated under `TabsContent`.
- `TeamDetailPage.test.tsx` needs a substantial rewrite (tab-switching assertions replace "everything visible at once" assertions).

**Backend/types changes:** None — frontend-only. `TeamPlayer` already carries `firstName`, `lastName`, `role`, `clubId` (`packages/@basketeasy/types/teams.ts`), everything the card view needs is already in the existing `GET .../teams/:teamId/players` response.

**Dependencies/sequencing:** Depends on item 1 (`EmptyState` in the roster/admins/clubs-partenaires tabs' empty branches). The Événements tab's content is intentionally left as today's table until item 5a ships — don't block this item on the calendar work; the tab shell should be built so swapping that one tab's content later is a self-contained change.

**Effort estimate:** **L.** This is the largest single page in the app (690 lines) undergoing a real structural rewrite, plus a genuinely new composition (grouped avatar-chip roster view with a view-mode toggle whose state needs to persist sensibly — likely local `useState`, reset on tab change), plus a full test rewrite. Individually the pieces are simple (`Tabs`, `Avatar`, `Card` all exist), but the surface area touched is large.

**Acceptance criteria:**
- [ ] Four tabs (Effectif / Clubs partenaires / Administrateurs / Événements) replace the four stacked sections; tab state is reflected in the URL (`?tab=`) like `MembersPage`.
- [ ] Effectif tab defaults to grouped card view (players split by role), with a working toggle to the existing table view; toggling preserves the current search/sort state of whichever view is active (or explicitly resets it — decide and document).
- [ ] Reaching Administrateurs no longer requires scrolling past three other sections.
- [ ] All existing mutation flows (add/remove club, add/remove/edit roster player, add/remove admin, create/edit/delete event) work unchanged inside their new tab.
- [ ] `TeamDetailPage.test.tsx` passes with tab-aware assertions; coverage for the new card view and the view-mode toggle is added.

**Open questions/risks:**
- **Administrateurs search/pagination parity (called out in 2.2) is explicitly deferred, not included.** `GET .../teams/:teamId/admins` returns a plain `TeamAdmin[]` (no `PaginatedResult`, no `ListTeamAdminsDto` — confirmed in `server/src/teams/teams.controller.ts` and `packages/@basketeasy/types/team-admins.ts`). Adding search/pagination there is a backend contract change, which would break this item's "restructuring, not new UI" framing. Given team-admin lists are realistically 1–3 people, recommend leaving this as a known, accepted inconsistency rather than scope-creeping this item — revisit only if real usage shows teams with large admin lists.
- **Back-link destination, resolved via design review — confirmed intentional, not a mockup slip, but a real behavior change worth flagging as a v1 trade-off.** Today's hardcoded "← Retour à l'effectif" only makes sense for the persona who arrived via the club's Members page — it's wrong for anyone who arrived via `/my-teams` (the only nav path for a plain member or team-only admin, per `CLAUDE.md`). "← Mes équipes" is the simplest fix that works for every persona, but it does change behavior for club admins who currently expect to land back on Effectif. The more correct fix — a contextual back-link that returns to wherever the user actually came from (Members page vs. My Teams), e.g. via `location.state` or a `?from=` param — is out of scope for this item; ship the fixed "← Mes équipes" destination for v1 and track the contextual version as a small follow-up rather than blocking this item on it.
- Card-view roster grouping only has two buckets today (`PLAYER`/`COACH` — `TeamMemberRole` enum). Fine for now, but per `CLAUDE.md`'s roadmap a future `type` field or additional roles could change the grouping; don't hardcode more structure into the card component than the current two-value enum needs.

---

## 3. Club switcher (2.4)

**What ships:** `AppHeader`'s per-admin-club `<label, Effectif button>` list is replaced with a single switcher control next to the BasketEasy wordmark, showing the active club's name + caret. **Click behavior, resolved via design review:** the chip (name + caret, anywhere on it) is a single toggle — click opens/closes the panel, nothing else navigates. Inside the panel, clicking a club row only sets `ActiveClubContext` (checkmark moves to that club, panel closes) — it does not navigate. Navigation to a club's roster is handled by a **new persistent "Effectif" nav item**, added to the header nav alongside "Mes équipes," always routing to `/clubs/:activeClubId/members`. This replaces the plan's original three-candidate ambiguity (chip-click-navigates vs. row-click-navigates vs. only-reachable-via-"Gérer mes clubs") with one link and one non-navigating toggle — and corrects the wireframe's own annotation, which claimed "'Effectif' always points at the currently selected club" without actually drawing that link anywhere in the mockup. The switcher panel still shows a "VOS CLUBS (ADMIN)" section (checkmark on the active club), a divider, then "+ Créer un club" and "Gérer mes clubs →" links. The active club is stored in a new React Context (`ActiveClubContext`, colocated with `AccountContext` per `CLAUDE.md`'s "Context owns local UI state" split) so it can eventually back things like a default landing club, but for this item its consumers are `AppHeader`'s switcher and the new "Effectif" nav item.

**Zero-admin-club state, resolved via design review:** no new mockup needed — mirror today's `AppHeader.tsx` guard (`adminClubs.length > 0`). The switcher (and the new "Effectif" nav item, which has no meaning without an active club) render only for a user administering ≥1 club. A zero-admin-club user sees neither; "Créer un club" stays exactly where it is today, a normal top-level nav link, unchanged by this item.

**Frontend changes:**
- **New primitive required — this is where the audit's "no new primitives needed" claim doesn't hold.** None of `Select`, `Dialog`, `Tabs` fit: the switcher needs a non-form trigger (a nav element, not `<select>`), heterogeneous content inside the panel (a labeled section, checkmarked rows, a divider, footer links that navigate rather than select a value), and hover/click-outside/Escape dismissal matching `Dialog`'s existing a11y quality. `@radix-ui/react-select` is semantically a form control and doesn't support that shape. `packages/@basketeasy/ui/package.json` has no `@radix-ui/react-dropdown-menu` or `@radix-ui/react-popover` installed today (checked directly — only `avatar`, `checkbox`, `dialog`, `label`, `select`, `tabs`, `toast`, `tooltip`). **Flag clearly:** this item needs a new `packages/@basketeasy/ui/src/components/DropdownMenu.tsx` wrapping a newly-added `@radix-ui/react-dropdown-menu` dependency (same family as the Radix primitives already used everywhere else, low integration risk, but it is new surface area, new stories/tests, and a new export entry — not a free reuse of an existing component the way `Tabs` was for item 2).
- New: `app/src/auth/ActiveClubContext.tsx` (provider + `useActiveClub()` hook), mounted alongside `AccountProvider`.
- New: extract the "which clubs does this user admin" computation currently inlined in `AppHeader.tsx:37-40` into a shared `app/src/clubs/useAdminClubs.ts` hook — both the switcher and, later, item 4's dashboard stat tiles consume it (see §0).
- Modify: `app/src/components/AppHeader.tsx` — replace the per-club button block with the new `DropdownMenu` composition, gated behind the existing `adminClubs.length > 0` guard, plus a new persistent "Effectif" `<Link>` (also gated on that guard) routing to `/clubs/${activeClubId}/members`, placed next to the existing "Mes équipes" link. "Créer un club" stays a top-level link exactly as today — not moved into the dropdown, since it must remain visible for the zero-admin-club case where the dropdown doesn't render at all.
- `LandingPage.tsx` is explicitly out of scope here (2.7 already flags its header duplication as separate cleanup) — don't let this item's `AppHeader` changes silently diverge from `LandingPage`'s copy without a follow-up.

**Backend/types changes:** None — `GET /clubs` already returns only the current user's clubs (`ClubsService.listClubsForUser`, confirmed in `clubs.controller.ts`), not every CD44 club, so no scale concern on the data-fetch side.

**Dependencies/sequencing:** Independent of items 1–2; can be built in parallel with item 2 if staffed separately. Item 4 (Dashboard) should consume the `useAdminClubs()` hook this item produces rather than re-deriving admin-club membership a third time.

**Effort estimate:** **M.** Bumped up from what the audit implied ("frontend-only, existing Context split") specifically because of the new `DropdownMenu` primitive + dependency addition; without that it would be S.

**Acceptance criteria:**
- [ ] `DropdownMenu` primitive exists in `@basketeasy/ui` with Storybook coverage and a11y basics (Escape to close, click-outside to close, focus returns to trigger) matching `Dialog`'s existing behavior.
- [ ] `AppHeader` shows the switcher instead of the per-club button list for any user administering ≥1 club; header no longer wraps to multiple lines regardless of admin-club count.
- [ ] Clicking the chip (name or caret) only opens/closes the switcher panel — it never navigates.
- [ ] Clicking a club row inside the panel only updates `ActiveClubContext` (checkmark moves, panel closes) — it never navigates.
- [ ] A persistent "Effectif" nav item, next to "Mes équipes," routes to `/clubs/:activeClubId/members`, visible only when `adminClubs.length > 0`.
- [ ] A user administering 0 clubs sees neither the switcher nor the "Effectif" nav item; "Créer un club" remains a top-level link, unchanged from today.

**Open questions/risks:**
- The mockup also shows a new circular avatar element ("JC" initials) at the far right of the nav that doesn't exist in today's `AppHeader` (today "Mon profil" is a text link, no avatar). Recommend explicitly scoping this item to the switcher only and treating the avatar/account-menu as a separate, unscoped idea — pulling it in silently doubles this item's surface area (new initials-from-account-name logic, new click behavior for "Mon profil" vs. a menu, etc.).
- `proposed-nav-club-switcher.svg`'s annotation text should be corrected to match the resolved click behavior above (it currently implies a direct chip→Effectif link that was never drawn) — cosmetic doc fix, not a blocker on implementation.

---

## 4. Dashboard content (2.5)

**What ships:** `DashboardPage` replaces its current heading/email/logout/`HealthStatus` body with: a personalized greeting, 4 stat tiles ("Équipes gérées," "Événements — 7 prochains jours," "Joueurs au total," "Clubs administrés"), a "Cette semaine" agenda strip (next-7-days events across all the user's teams, with a "Voir le calendrier →" link), and team cards (one per team the user is part of, replacing the header button-list's "jump to a team" use case per the audit). `HealthStatus` moves behind a dev-only flag (env var or route), out of the default logged-in landing page.

**Frontend changes:**
- Modify: `app/src/pages/DashboardPage.tsx` — full rewrite of the body.
- New: stat-tile composition (`Card`-based; no new `@basketeasy/ui` primitive needed — a plain `Card`/`CardContent` with a large number + label reads as a stat tile without a dedicated component). Team cards similarly compose `Card`/`Badge`/`Button`, all existing.
- New: `app/src/clubs/useMyAgenda.ts` (or similar) calling the new backend endpoint below.
- **Not everything here needs the new endpoint** — this is worth calling out explicitly since the audit doesn't distinguish it: "Équipes gérées" and "Clubs administrés" are both already fully computable client-side from data the app already fetches (`useMyTeamList()`'s `isTeamAdmin` count, and the `useAdminClubs()` hook item 3 introduces) — no backend work needed for those two tiles. Only "Événements — 7 prochains jours" (needs the agenda endpoint) and "Joueurs au total" (needs a new aggregate, see below) are genuinely new backend surface.
- Gate `HealthStatus`: simplest option is a `VITE_SHOW_HEALTH_STATUS` env flag checked in `DashboardPage`, or move it to a new `/about` route (matches the audit's own suggestion) — recommend the route, since it keeps `DashboardPage` free of dev-only conditionals and gives the widget a permanent, bookmarkable home instead of an env-flag toggle nobody remembers exists.

**Backend/types changes:** Yes — this is the one item in the top 4 that isn't frontend-only, confirming the audit's characterization.
- **New types file** `packages/@basketeasy/types/my-dashboard.ts` (per `CLAUDE.md`'s "new file + matching `exports` entry" convention, not folded into `my-teams.ts` since it's a distinct response shape): `MyAgendaEvent { eventId, teamId, teamName, clubId, clubName, startsAt, location, notes }` and `MyDashboardSummary { upcomingEvents: MyAgendaEvent[]; totalPlayers: number }`. **"Joueurs au total" definition, resolved via design review:** club-scoped, not team-scoped — `COUNT(DISTINCT Player.id) WHERE Player.clubId IN (<admin's clubs>)`. Matches the tile's neighbors ("Équipes gérées," "Clubs administrés," both also admin-scoped) and needs no dedup logic beyond the `DISTINCT`, since `Player.clubId` is single-valued (a player belongs to exactly one club; CTC multi-club sharing happens at the `ClubTeam`/`TeamPlayer` level, not `Player`, so this query can't double-count).
- **New endpoint** `GET /me/dashboard` (query params `from`/`to`, defaulting server-side to "now → +7 days" if omitted). Recommend a **new small module** (`server/src/dashboard/`) rather than bolting this onto `TeamsModule` or `EventsModule` — `CLAUDE.md`'s Events section explicitly notes `EventsService` re-verifies ownership itself "rather than importing across modules," i.e. the codebase's established convention is to avoid cross-module service injection; a dedicated `DashboardService` querying `PrismaService` directly for the cross-team/cross-club aggregate (teams via the same `TeamAdmin`/`TeamPlayer`-by-`userId` joins `TeamsService.listTeamsForUser` already does, events via `teamId IN (...)`, players via `clubId IN (...)` for admin clubs) fits that pattern better than reaching into `EventsService`/`TeamsService` internals.
- Types-first order per `CLAUDE.md`: `packages/@basketeasy/types/my-dashboard.ts` → `server/src/dashboard/dto/get-dashboard.dto.ts` (query validation for `from`/`to`) → `DashboardController`/`DashboardService` → frontend `useMyAgenda`/`useDashboardSummary` hook → `DashboardPage`.

**Dependencies/sequencing:** Depends on item 3's `useAdminClubs()` hook for the "Clubs administrés" tile and the club data backing "Joueurs au total"'s club-id list. Can start backend work (new module, new endpoint) in parallel with items 1–3 since it touches no shared files; frontend wiring should land after item 3 ships the hook it reuses.

**Effort estimate:** **M.** Frontend composition is straightforward (existing primitives only); backend is one new small module with one new endpoint and one new types file — not large, but it's real net-new backend work unlike items 1–3.

**Acceptance criteria:**
- [ ] `DashboardPage` shows 4 stat tiles with correct live counts (verified against seeded test data for a multi-team, multi-club test user); "Joueurs au total" specifically verified as a distinct club-scoped count (a player rostered on two teams within the same admin club counts once).
- [ ] "Cette semaine" strip shows events across *all* of the user's teams (both team-admin and rostered-player teams), sorted by `startsAt`, for the next 7 days from today.
- [ ] Team cards link correctly to `TeamDetailPage` for each team the user is part of.
- [ ] `HealthStatus` no longer renders on `/dashboard` by default; still reachable at its new home.
- [ ] `GET /me/dashboard` is club/team-membership-scoped per-user (no cross-user data leakage) — covered by a `.spec.ts` analogous to `my-teams.controller.spec.ts`.

**Open questions/risks:**
- **Performance at CD44 scale is a non-issue for this specific query shape** — worth stating explicitly since the audit flags CD44's ~130 clubs as a general scale concern (rightly, for item 3's original per-club button list). This endpoint's query is scoped to *one user's* teams/clubs (typically 1–5 teams, 1–2 admin clubs), not all 130 CD44 clubs, so `Event`'s existing `@@index([teamId])` and `Player`'s existing `@@index([clubId])` are sufficient — no schema/index change needed for the dashboard aggregate itself. (A composite `Event` index on `(teamId, startsAt)` would be a reasonable future addition if a *calendar* feature later needs to scan a wider date range per team, but it's not blocking this item.)
- Should the agenda strip show events from teams the user is only rostered on as a *player* (not admin/coach), or only teams they manage? The wireframe shows both "U15 Filles" and "U18 Garçons" without distinguishing the user's role on each — confirm this is intentional (agenda = "everything relevant to me," not "everything I manage").

---

## 5. Events calendar (2.1, split into 5a/5b — see §0)

**What ships (5a only — the scope recommended for near-term work):** The Événements tab (inside item 2's tab shell) gains a "Vue agenda" list layout as an alternative to the existing table — grouped by day, showing time/location/notes per event, with a toggle back to "Vue liste" (the existing searchable/date-ranged/paginated table, unchanged, framed as the power-user/bulk-edit view per the audit). A month-grid calendar view is **not** included in 5a; see Open questions for why.

**What's explicitly deferred to 5b (not scoped here):** The wireframe's month grid with per-day event chips, "Convocation: 12/15" attendance counts, and event-type color coding. All three depend on data that doesn't exist yet: RSVP status, convocation targeting, and the `type` field distinguishing training from match — all three are listed, in that order, as CLAUDE.md's explicit "next steps" for the Events module, none built yet. Building the grid now would ship a calendar full of visually-identical, unlabeled dots — exactly the audit's own reasoning for why this item should wait.

**Frontend changes (5a):**
- New: `app/src/clubs/TeamEventsAgenda.tsx` — day-grouped list view, reusing `Card` for each day group. No new `@basketeasy/ui` primitive.
- Modify: the Événements tab content (inside `TeamDetailPage`, post-item-2) to default to the agenda view with a toggle to the existing table, mirroring item 2's roster card/table toggle pattern exactly — same interaction model, reduces the amount of genuinely new UX to learn.
- Data: reuse `useEventList` unchanged — `ListEventsParams` already supports `from`/`to` (confirmed in `packages/@basketeasy/types/events.ts`), so the agenda view just calls it with a wider `pageSize` (the existing `LINKING_PAGE_SIZE = 100` pattern already used elsewhere in the same file) and a `from`/`to` window instead of paginating — a team's realistic weekly/monthly event count is well under 100.

**Backend/types changes:** None for 5a — `from`/`to` filtering already exists server-side (`EventsService.listEvents`). 5b, when scoped, will need the RSVP/convocation data model work tracked separately per `CLAUDE.md`'s Events roadmap (items 1–2 of that list) — that's a distinct, larger initiative with its own Prisma schema changes (a new `EventAttendance`-shaped model keyed on `TeamPlayer`/`Event`), not an extension of this item.

**Dependencies/sequencing:** Depends on item 2 (tab shell) for a home to live in; can otherwise proceed independently of items 3–4.

**Effort estimate:** **L** (for 5a as scoped). Even without a month grid, a day-grouped agenda view with correct date-boundary handling (timezone, "today" highlighting, empty-day suppression) and a responsive layout that also serves as the audit's proposed mobile pattern (2.6) for this specific table is real UI work, not a thin wrapper.

**Acceptance criteria:**
- [ ] Événements tab defaults to the agenda/list view, grouped by day, with a toggle to the existing table view (state/behavior parity with item 2's roster toggle).
- [ ] Agenda view correctly shows a full week/month of events without pagination controls (bounded fetch via the `LINKING_PAGE_SIZE` pattern).
- [ ] Empty days are not rendered (no "0 events" placeholder rows cluttering the list).
- [ ] Existing table view (search, from/to filter, sort, pagination) is unchanged and still reachable.

**Resolved via design review:** agenda-only is confirmed as the actual v1 target, not an interim compromise — the month grid in `proposed-events-calendar.svg` was included to show the feature's end-state, not as a near-term build target. With today's event data (Date/Lieu/Notes only, no RSVP counts per `CLAUDE.md`'s roadmap), a grid would render mostly-empty cells with no meaningful chip content, reading as unfinished rather than intentional. No grid shell is scoped now; 5b builds the grid once convocation/RSVP data exists to fill it.

**Open questions/risks:**
- Recurring events (`CLAUDE.md`: series aren't linked by an id, each occurrence is an independent row) mean a day-grouped agenda naturally shows each occurrence correctly with zero special-casing — worth noting as a small validation that this approach doesn't need series-awareness the way a "collapse recurring events" UI would.

---

## 6. Table mobile collapse (2.6)

**What ships:** After items 1–5a land, the tables genuinely left uncollapsed on mobile are narrower in scope than the audit's framing suggests: item 2 converts TeamDetailPage's Effectif tab to cards by default and item 5a does the same for Événements, leaving Clubs partenaires (2 columns) and Administrateurs (2 columns) as the only remaining `TeamDetailPage` tables — both narrow enough that horizontal scroll on mobile is a minor annoyance, not a real usability problem. **The pages item 2 doesn't touch are where this item should actually focus:** `MembersPage`'s three tabs (Membres: 4 columns; Joueurs: 4 columns; Équipes: 4 columns) and `MyTeamsPage` (5 columns) — none of the 6 priority items restructure `MembersPage`, so it remains the widest, most mobile-hostile surface in the app after 1–5a ship. This item converts those specific tables to stacked card rows below the existing 768px breakpoint (matching `AppHeader`'s `DESKTOP_BREAKPOINT_PX`).

**Frontend changes:**
- Extract: `AppHeader.tsx`'s local, unexported `useIsDesktopViewport` hook (lines 12–24) into a shared `app/src/hooks/useIsDesktopViewport.ts` — currently only `AppHeader` can use it; this item needs the identical breakpoint logic in at least two more places.
- New: page-specific card-row components for `MembersPage`'s 3 tabs and `MyTeamsPage` (e.g. `MemberCard`, `PlayerCard`, `TeamListingCard`, `MyTeamCard`) — per the audit's own stated approach (2.6's fix note: "sidestep the problem rather than requiring a separate responsive table component"), these are **not** a generic `Table` responsive mode added to `@basketeasy/ui`; each page swaps its `Table` for a card list below the breakpoint, same data, different presentation. `Card`/`Badge`/`Button` cover the composition, no new primitive.
- Modify: `MembersPage.tsx` (3 tabs), `MyTeamsPage.tsx` — conditionally render table vs. card list based on the shared viewport hook, same pattern `AppHeader` already uses for its own burger-menu/inline-links split.

**Backend/types changes:** None — frontend-only, purely presentational.

**Dependencies/sequencing:** Explicitly sequenced last because its scope is only knowable once items 1–5a have removed the tables they supersede — starting this before those land risks building card views for tables that are about to be replaced anyway (e.g. don't build a mobile card view for `TeamDetailPage`'s old flat Effectif table days before item 2 replaces it with a card view by default).

**Effort estimate:** **M.** Four distinct tables (3 `MembersPage` tabs + `MyTeamsPage`) each need their own card-row layout; mechanically similar to each other but each has different columns/actions to translate, plus the shared hook extraction and its own test coverage.

**Acceptance criteria:**
- [ ] Below 768px, `MembersPage`'s Membres/Joueurs/Équipes tabs and `MyTeamsPage` render as stacked cards, not horizontally-scrolling tables.
- [ ] All existing per-row actions (remove member, edit team, "Voir" team detail, etc.) remain reachable from the card layout.
- [ ] `useIsDesktopViewport` is a shared hook with its own test, consumed by `AppHeader` (refactored, not duplicated) and the newly-converted pages.
- [ ] Desktop (≥768px) behavior is unchanged — tables remain tables above the breakpoint.

**Open questions/risks:**
- Confirm 768px remains the right single breakpoint for this — `AppHeader`'s comment (`AppHeader.tsx:9-11`) justifies it specifically for the burger-menu decision; reusing the same number for table-collapse is reasonable but worth a deliberate "yes, same breakpoint" decision rather than an accidental one from just importing the constant.
- Re-scope this item's card list once items 1–5a actually ship — if either lands differently than planned (e.g. item 2's roster view doesn't ship a table toggle after all), the "what's left" analysis above needs re-checking before this item starts.

---

## Decisions from design review (resolved)

The 5 items originally flagged below as underspecified were reviewed and resolved; each section above has been updated in place. Summary:

1. **Club switcher (§3) — click-target behavior.** Split into two non-overlapping triggers: the chip only toggles the panel open/closed; a club row inside the panel only sets `ActiveClubContext`. Navigation is handled by a new persistent "Effectif" nav item (next to "Mes équipes") routing to the active club's Members page — resolving the ambiguity the wireframe's own annotation had introduced by claiming a link it never drew.
2. **Club switcher (§3) — zero-admin-club state.** No new UI: reuse today's `adminClubs.length > 0` guard. Zero-club users see neither the switcher nor the new "Effectif" link; "Créer un club" is unchanged.
3. **Dashboard (§4) — "Joueurs au total" definition.** Club-scoped: distinct players across the clubs the user administers (`COUNT(DISTINCT Player.id) WHERE clubId IN admin's clubs`), matching its neighboring admin-scoped tiles. Not a team-rostered count, so no CTC double-counting risk.
4. **Events calendar (§5) — 5a vs. 5a+grid-shell.** Agenda-only (5a) is the actual v1 target, not an interim compromise — the wireframe's grid depicts the feature's end-state once RSVP/type data exists (5b), not a near-term build target.
5. **Team Detail tabs (§2) — back-link destination change.** Confirmed intentional: "← Mes équipes" ships as the fixed v1 destination, accepted as a real (if minor) regression for admins used to landing back on Effectif. A contextual, referrer-aware back-link is the more correct long-term fix, tracked as a small separate follow-up rather than folded into this item.

Everything else in this plan (empty-state copy branching, the `DropdownMenu` primitive need, the dashboard endpoint's module placement, the mobile-collapse scope) remains an engineering judgment call documented above, not something that needed outside input.
