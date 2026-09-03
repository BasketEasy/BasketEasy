# Kluvo — Player-first revamp: implementation plan

Date: 2026-09-02. Companion to [`player-journey.md`](./player-journey.md) (the analysis) and [`mockups/`](./mockups/) (the design). This document is the build order: what to write, in which package, in which sequence, and what "done" means for each slice.

**Ground rules for every phase below**, restated because they are the ones this work is most likely to break:

- **Design system first.** No screen in this plan introduces a look at a call site. If a mockup needs something the enums cannot express, the fix is a variant or a new component in `@basketeasy/ui`, added in the same phase that needs it — never a `className` carrying a colour, a background, a radius or a font weight. §1 lists every DS addition this revamp requires; nothing outside that list should appear.
- **Tokens live in one file.** `packages/@basketeasy/ui/tailwind-preset.cjs`. Two additions are required (§1.4) and both are named. Zero arbitrary values (`shadow-[…]`, `bg-[#…]`, `h-[76px]`).
- **Types → DTO → caller.** Every API change edits `packages/@basketeasy/types` first, then the NestJS DTO/service, then the frontend hook. Never the other way round.
- **Query branches.** Every new block is a query consumer and branches `error → loading → empty → data`, in that order. `DashboardPage`, `TeamDetailPage` and `EventDetailPage` are all rewritten here — trap 4 of the Parquet spec (a rewrite silently drops an error branch) is the single most likely regression in this whole plan.
- **One component per record.** The event card appears on the player home, the team agenda and the results feed. It is _one_ component branching on viewport, not three.
- **Dead code goes in the same commit that orphans it.** Named explicitly per phase.
- **Screenshot gate.** Every phase that touches UI ends with a Playwright render against the mock API server, attached to the PR. Not optional, not deferred to the end.

Phases are ordered so that **1–5 ship the whole player loop with no blocking backend work**, and each is independently mergeable.

---

## 1. Design system work (phase 0 — do this first)

Everything here is consumed by two or more later phases. Building it up front is what keeps the screens from re-deriving looks.

### 1.1 New components

| Component                   | Export                             | Why it must exist                                                                                                                                                                                                                                                                                                                                                                 | Consumed by          |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **`TimeBlock`**             | `@basketeasy/ui/time-block`        | The signature Parquet element — solid `bg-blue-green` for a `MATCH`, bordered `bg-surface-2` for a `TRAINING`, time in Big Shoulders with `.tabular`, "à confirmer" fallback. It exists today **inline inside** `TeamEventsAgenda.tsx:43-80` and the mockups put it on four more surfaces. Props: `type`, `startsAt`, `timeConfirmed`, `size` (`sm`/`md`). No `className` colour. | Phases 2, 3, 4, 5, 6 |
| **`SegmentedControl`**      | `@basketeasy/ui/segmented-control` | Generalises `ViewModeToggle` (`TeamDetailPage.tsx:81-121`, currently local and single-use-shaped) and the À venir/Passés toggle. Owns roving tabindex + arrow/Home/End keys the local one lacks, same as `RadioCardGroup` does for radio cards. Props: `ariaLabel`, `value`, `options`, `onChange`, `tone`.                                                                       | Phases 5, 6          |
| **`ResponseMeter`**         | `@basketeasy/ui/response-meter`    | The proportional presence bar (« 9 oui · 2 peut-être · 1 non · 2 sans réponse »). Closed tone set — `success`/`structure`/`danger`/`neutral` — mapped internally, never a caller-side colour. Renders `role="img"` with an `aria-label` carrying the counts, so it is not a colour-only signal.                                                                                   | Phases 3, 5, 6, 7    |
| **`AvatarGroup`**           | `@basketeasy/ui/avatar-group`      | The overlapped avatar row with a `+N` overflow chip on « Qui vient ? ». Composes `Avatar`; props `people`, `max`, `size`.                                                                                                                                                                                                                                                         | Phases 3, 5          |
| **`StatTile`**              | `@basketeasy/ui/stat-tile`         | Currently local at `DashboardPage.tsx:29-47`. The admin home keeps all four tiles and the player stats card needs the same tile at a smaller size. Props: `icon`, `label`, `value`, `size`. Moving it out is what stops phase 4's rewrite of `DashboardPage` from orphaning it.                                                                                                   | Phases 4, 6          |
| **`TabBar` / `TabBarItem`** | `@basketeasy/ui/tab-bar`           | The presentational shell of the bottom navigation: fixed row, safe-area padding, 44 px targets, icon + label, active treatment, optional count badge. `asChild` so the app passes a `NavLink` — routing stays in `app/`, the look stays in the DS.                                                                                                                                | Phase 2              |

**Deliberately _not_ new components:**

- The « À traiter » row (label + meta + action) — that is domain composition over `Card` + `Text` + `Button`, and lives at `app/src/clubs/ActionItemRow.tsx`.
- A generalised `ProportionBar` unifying `ResponseMeter` and `PointsRepartitionBar`. The latter carries its own `points.*` ramp, in-bar `bar-count` numerals and a documented legend rule; folding both into one primitive now would destabilise a shipped screen for no call-site gain. Revisit only if a third proportional bar appears.
- A player-specific `Card`. The surface ladder already expresses every card in the mockups through `variant`.

### 1.2 New icons

Add to `packages/@basketeasy/ui/src/components/icons/`, each taking `tone` from the shared `@basketeasy/ui/icon-variants` API (never a `text-*` class at the call site), each with its `exports` entry:

`HomeIcon` (`./icons/home`), `UserIcon` (`./icons/user`), `RouteIcon` (`./icons/route` — the « Itinéraire » action), `BellIcon` (`./icons/bell` — « Relancer », phase 9).

### 1.3 Extensions to existing components

- **`Badge`** — no new variant needed. Verified against every badge in the seven mockups: « Convoquée » is `solid`/`brand`, « Domicile »/« Extérieur » is `soft`/`structure`, « Heure à confirmer » is `outline`/`neutral`, « Victoire » is `soft`/`success`, the MVP chip is `soft`/`accent`. If a screen ever needs a look outside this set, add the variant — do not reach for a class.
- **`Avatar`** — needs a `size` step small enough for `AvatarGroup`'s overlap if one is missing; check before adding.
- **`Tabs`** — unchanged. The role split in phases 5 and 6 is _which_ `TabsTrigger`s render, not a new tab look.

### 1.4 Token additions (`tailwind-preset.cjs`)

```
boxShadow: {
  // The bottom tab bar's active item. shadow-nav-active is inset 0 -2px 0,
  // a rule at the bottom edge — correct for a top nav, wrong for a bar
  // sitting at the bottom of the viewport, where the rule must sit above
  // the item.
  'nav-active-top': 'inset 0 2px 0 #D4622A',
}
```

Plus, in `app/src/index.css` next to the existing `.safe-area-top` (`index.css:17`):

```
.safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }
```

**Phase 0 done when:** each new component has a `*.test.tsx` and a `*.stories.tsx`, an `exports` entry in `packages/@basketeasy/ui/package.json`, and `TimeBlock`/`StatTile`/`SegmentedControl` have replaced their inline originals in `TeamEventsAgenda.tsx`, `DashboardPage.tsx` and `TeamDetailPage.tsx` respectively — with the originals deleted, not left behind.

---

## 2. Phase-by-phase delivery

Each phase is one PR. "Ranked #" refers to the priority table in `player-journey.md` §5.

### Phase 1 — Agenda rows lead to the event, and answer inline (ranked #1, size S, no API)

The highest ratio in the plan: it removes three taps and a visual search from the single most repeated action in the product.

- `app/src/pages/DashboardPage.tsx:49` — `AgendaRow`'s `Link` target changes from `/clubs/:clubId/teams/:teamId?tab=events` to `/clubs/:clubId/teams/:teamId/events/:eventId`, which already exists (`App.tsx:40-43`).
- The row gains an inline `EventRsvpControl` for a rostered viewer. **Nesting an interactive control inside a `Link` is invalid** — restructure the row so the card is a container, the title is the link, and the control is a sibling. Do not wrap a button in an anchor.
- `EventRsvpControl` (`app/src/clubs/EventRsvpControl.tsx`) is typed against `TeamEvent`; `MyAgendaEvent` is a different shape. Narrow its prop to the fields it actually reads (`id`, `myRsvpStatus`) rather than widening `MyAgendaEvent` — this also unblocks phase 4 reusing it.
- Cache: the RSVP mutation invalidates the event list key; add the `myDashboardQueryKey` invalidation in `useEventRsvpSet`/`useEventRsvpClear` so the home screen updates in place.

Tests: `DashboardPage.test.tsx` asserts the row href is the event route and that a rostered user gets a working tri-state control; a non-rostered manager gets none.

### Phase 2 — Bottom tab bar and role-aware navigation (ranked #3, size M, no API)

- New `app/src/components/AppBottomNav.tsx`, composing `TabBar`/`TabBarItem` from phase 0 with `NavLink` via `asChild`. Role resolved from the signals that already exist — `useAdminClubs()`, `useMyTeamList()` (`isTeamAdmin`, `rosterRole`) — with the same `hasManageRights` derivation `DashboardPage.tsx:130` already uses. **Extract that derivation into a `useHasManageRights()` hook** in `app/src/clubs/`; phases 4, 5 and 6 all branch on it and three copies will drift.
- Items per `player-journey.md` §4.2. Player tab 2 points at the single team when `useMyTeamList()` returns one, and at `/my-teams` when it returns several.
- `app/src/components/AppHeader.tsx` — the burger, the mobile panel, the backdrop and the link list are **deleted** (`AppHeader.tsx:90-176, 227-240`). The header keeps the brand mark, the club switcher, the context line and the account menu. « Créer un club » (`AppHeader.tsx:170-172`) moves into `AccountMenu.tsx`.
- Desktop keeps the horizontal links in the header and hides the bar; the bar is mobile-only. One component, two viewport branches — not two components.
- `ProtectedRoute` mounts the bar next to the header. Every page needs bottom padding equal to the bar height so the last row is not covered; do this once in `PageContainer` behind a prop, not per page.
- A11y: `<nav aria-label="Navigation principale">`, `aria-current="page"` on the active item, 44 px minimum targets, the count badge's number also in the item's accessible name.

Tests: `AppBottomNav.test.tsx` covers both role variants and the one-team/many-teams branch; `AppHeader.test.tsx` loses its burger assertions and gains "no burger on mobile".

### Phase 3 — The event page, reordered around the decision (ranked #5, size M, no blocking API)

`app/src/pages/EventDetailPage.tsx` (473 lines) splits into `EventDetailPlayerView.tsx` and `EventDetailManagerView.tsx` under `app/src/clubs/`, with the page keeping data fetching, the `error → loading` branches and the `useIsTeamManager()` split. This is a rewrite of a file that already has correct query branches — re-check them line by line after the split.

- **Player view**: hero (`TimeBlock` + opponent + venue badge) → decision band (convocation as a sentence, `EventRsvpControl`) → « S'y rendre » (address, `Itinéraire` as an `a` to a `maps:` deep link built with `encodeURIComponent(event.location)`, transport note, equipment duty from the existing `logistics` field) → « Qui vient ? » (`ResponseMeter` + `AvatarGroup` + link to the full roster) → coach notes. **No tabs.**
- **Manager view**: hero → pilot band (convoked count, non-responders, `ResponseMeter`, « Modifier la convocation » opening the existing `EventConvocationModal`, « Relancer » disabled with a tooltip until phase 9) → logistique → roster with per-row RSVP + convocation → « Après la rencontre » with the scoresheet CTA. Grouped by _when used_, not by tab. **Nothing is removed** — Modifier, Supprimer, Convocations, Logistique and the whole scoresheet flow all keep their entry points.
- A rostered coach gets her own `EventRsvpControl` under the pilot band.
- Until §6.2 lands (phase 8), « Qui vient ? » sources its counts from the existing `useEventRsvps()` roster call, which is correct for a single event page — the aggregate field is what the _list_ contexts need.
- The `?tab=` triggers disappear for the player. Preserve deep links: an incoming `?tab=vote` on the player view scrolls to the vote block rather than 404-ing the state.

### Phase 4 — `/dashboard` becomes « Ma semaine » (ranked #2 and #4, size M+XS)

- Split `DashboardPage.tsx` into `PlayerHome.tsx` and `ManagerHome.tsx`, branching on `useHasManageRights()` from phase 2. The page keeps fetching and the `error → loading → empty → data` ladder.
- **Player** blocks in order: « Prochain rendez-vous » hero, « À répondre (n) » (upcoming with `myRsvpStatus === null`, convocations first, control inline), « Les 14 prochains jours », « Après le match ». Removed for this persona: the stat tiles, the « Mes équipes » grid (`DashboardPage.tsx:221-242` — the bottom bar owns it now), the e-mail line.
- **Ranked #4 lands here**: call `useMyAgenda({ from, to })` with a 14-day window. The endpoint already accepts `from`/`to` (`GetDashboardDto`); `DEFAULT_AGENDA_WINDOW_DAYS = 7` (`dashboard.service.ts:7`) stays as the server default. Client-side change only.
- « Après le match » is stubbed against a second `useMyAgenda({ from: −30d, to: now })` call and shows only what today's payload carries (that the match happened, and a link) until phase 8 adds `result`. Ship the block empty-capable rather than holding the whole phase.
- **Manager** keeps all four tiles verbatim, including the club-scoped definition of « Joueurs au total » (`dashboard.service.ts:42-44`), plus « Cette semaine » and the team cards. The « À traiter » band is added in phase 9.
- `MyTeamsPage` is **not** deleted — it becomes the multi-team player's tab 2.

### Phase 5 — Team page role split (ranked #7, size M, no API)

`TeamDetailPage.tsx` is 1001 lines and is the riskiest file in the plan. **Extract each tab body into its own component under `app/src/clubs/` first, as a pure refactor with no behaviour change and no visual change, in its own commit** — then apply the split. Reviewing a 1000-line rewrite and a role change in one diff is how the error branches get lost.

- Player: three tabs — Agenda (default) · Effectif · Mes stats. The Agenda/Liste `ViewModeToggle` is not rendered; À venir/Passés becomes the phase-0 `SegmentedControl`. Every agenda card carries its own `EventRsvpControl`, so the weekly loop closes here too.
- Manager: all five tabs, the full paginated Liste view with its search, date bounds, sort and pagination — unchanged, framed as the desktop power view.
- « Mes stats » ships its _squad ranking_ half now; the personal card lands with phase 7 (it needs `isMe`).

### Phase 6 — `isMe` and the personal stats card (ranked #8, blocking API, S + M)

1. `packages/@basketeasy/types/team-stats.ts` — add `isMe: boolean` to `TeamSeasonPlayerStats`.
2. `server/src/team-stats/team-stats.service.ts` — resolve it server-side exactly as `EventRsvpRosterEntry.isMe` already is (`packages/@basketeasy/types/events.ts:139` and its service). The client **cannot** derive this: it never learns its own `teamPlayerId` on this screen.
3. Frontend: the personal card (MJ, PTS/M, meilleur total, FA/M, `PointsRepartitionBar`, distinctions) using `StatTile` at its small size, then the squad ranking with the player's own row marked.
4. **The repartition legend is reproduced verbatim.** The « ce n'est pas une adresse » sentence and the point _counts_ (never percentages) are a module rule in `CLAUDE.md` and outrank any compression of this card. MPG and season-high minutes stay absent, for the reason the same rule gives.
5. **Jersey number: cut from the design.** The mockup shows « n° 7 »; `CLAUDE.md` forbids a `jerseyNumber` column on `TeamPlayer` for a documented reason. Deriving it from the most recent `MatchPlayerStat` is possible but is a separate decision — ship the card without it and update the mockup.

### Phase 7 — Aggregate RSVP counts (ranked #10, blocking API, S + API)

The single most reused new field across the mockups (screens 1, 2, 3, 5, 7).

1. Types: `rsvpSummary: { going, notGoing, maybe, pending }` and `convokedCount: number` on both `TeamEvent` (`events.ts:19-51`) and `MyAgendaEvent` (`my-dashboard.ts:4-20`).
2. Server: extend the existing `resolveMyEventState` helper in `EventsService` and the equivalent block in `DashboardService.getDashboard`. **Keep the bounded-query property**: one `groupBy` over the batch of event ids plus one roster-size lookup — not a per-event aggregate. The current helper is explicitly documented as at most three queries per call regardless of batch size; do not regress that.
3. Frontend: `ResponseMeter` replaces the expand-to-fetch pattern in every list context. `useEventRsvps()` stays for the roster _detail_.
4. **Also in this phase, §6.1**: `MyAgendaEvent` gains `venue`, `timeConfirmed`, `logistics`, `isImported`, `recurrenceId` to match `TeamEvent`. `toAgendaEvent` (`dashboard.service.ts:99-115`) already has the row in hand — a `select`/mapping change, not a new query. Without it the player home cannot render « Domicile », « Heure à confirmer » or « Vous apportez les chasubles », which are three of the seven things a player opens the app for.

### Phase 8 — The post-match surface (ranked #6, blocking API, L)

1. Types: `result: { ourScore, theirScore, outcome: 'WIN' | 'LOSS' | 'DRAW' } | null` and `myMatchStats: { points, fouls } | null` on `TeamEvent` and `MyAgendaEvent`.
2. Server: derive `result` from the **confirmed** `ScoresheetExtraction` plus `Event.venue`, reusing the same `venue → home/away` resolution `MatchPlayerStat` writing already performs. Reasons this is a projection on the event and not a client read of `parsedData`: `parsedData` is the verbatim OCR read and stays that way (`CLAUDE.md`, Team stats module); a player must never see an unconfirmed score; and reading it per event from the scoresheet endpoint makes any results list N+1. `myMatchStats` reads `MatchPlayerStat` for the caller's own `TeamPlayer`.
3. Frontend: « Après le match » on both homes, and the player's « Résultats » destination (tab 3 of the bottom bar) reading `GET /me/dashboard` with an inverted window (`from = now − 30 j`, `to = now`) — no new endpoint. The vote CTA renders while the existing 5-day window is open.
4. This is the surface that finally makes the scoresheet-capture differentiator visible to the people it produces data about.

### Phase 9 — Manager « À traiter » band (ranked #9, blocking API, M)

- Types + `GET /me/dashboard`: `actionItems` with `MATCH_WITHOUT_CONVOCATIONS`, `EVENT_PENDING_RSVPS` (J-n threshold), `MATCH_WITHOUT_CONFIRMED_SCORESHEET`, `PLAYERS_WITHOUT_ACCOUNT`. All four derive from data already stored; none is queryable in one round trip today. Cap the count and paginate rather than returning an unbounded list.
- Frontend: `ActionItemRow` on the manager home above the tiles, and on the team agenda. Each row's action reuses an existing flow (`EventConvocationModal`, the scoresheet upload, the player-invite path) — no new mutation in this phase.

### Phase 10+ — Separate initiatives, not part of this revamp

- **`rsvpDeadline` on `Event`** (§6.3) — a migration plus an edit control. « Réponse attendue avant vendredi 20h00 » is what converts a notification into an obligation, but it is independent of every screen above; the mockups degrade cleanly without it.
- **Reminders** (§6.7, ranked #11) — `POST .../events/:eventId/reminders` plus the scheduled job. Brevo and BullMQ are both chosen and neither is wired. Until this exists every RSVP depends on the player opening the app unprompted, which is the strongest argument for phases 1–4.
- **`PlayerGuardian`** (§6.8, ranked #12) — replaces the 1–1 `Player.userId` for the parent persona (`schema.prisma:32,43`). `docs/feature-set.md` P2. Until then the product copy should say plainly that a minor's account is held by a parent.

---

## 3. Dependency graph

```
Phase 0 (DS)
   ├──▶ 1 (agenda → event + inline RSVP)   ─┐
   ├──▶ 2 (bottom bar, role nav)            │  no backend work;
   ├──▶ 3 (event page split)                │  the whole player loop
   ├──▶ 4 (Ma semaine + 14 days)  ← needs 2 │  ships here
   └──▶ 5 (team page split)       ← needs 2 ─┘
             │
             ├──▶ 6 (isMe → personal stats card)   ← needs 5
             ├──▶ 7 (rsvpSummary + MyAgendaEvent parity) ← needs 3, 4
             ├──▶ 8 (match result → post-match)    ← needs 2, 4, 7
             └──▶ 9 (actionItems → à traiter)      ← needs 4
```

Phases 6 and 7 are independent of each other and can run in parallel. Phase 8 is the largest single slice and should not be started before 7 lands, or it will re-derive the same event projection twice.

---

## 4. Verification, per phase

Per `CLAUDE.md`'s verification cadence: make all of a phase's changes, then verify once, scoped to what changed.

1. **Unit tests** — Vitest colocated for every new/changed component; Jest colocated for every service change. Specifically: each new DS component gets a test _and_ a story; every role-branching page gets a test per role; every query consumer gets an explicit error-branch test, because that is the regression this plan is most exposed to.
2. **Scoped checks** — `pnpm exec prettier --check <files>`, `pnpm --filter @basketeasy/app exec eslint <files>`, `pnpm --filter @basketeasy/server exec eslint <files>`, and only the relevant test paths. Not the root `format`/`lint`/`test` until the push.
3. **Screenshot gate** — render the phase's screens with Playwright (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, never `playwright install`) against the real Vite dev server, driven by the mock API server if no Postgres is available, and attach the PNGs to the PR. Compare against the mockup PNG in `docs/ux-audit/mockups/png/` and note any deliberate divergence in the PR body.
4. **Mobile first, literally** — every screenshot at 390 px before any desktop width. The whole premise of this revamp is a phone held in one hand in a badly-lit gym.
5. **CI** (`.github/workflows/ci.yml`) runs the full format → lint → test → build as the repo-wide net.

## 5. Risks, and what they cost

| Risk                                                                                                                                 | Where                                                                          | Mitigation                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| A rewrite silently drops an `error →` branch, so a failed fetch renders an `EmptyState` and tells a player their data does not exist | `DashboardPage`, `TeamDetailPage`, `EventDetailPage` — all three are rewritten | Explicit error-branch test per query consumer; it has already happened three times in this repo |
| The 1001-line `TeamDetailPage` rewrite hides a behaviour change in the diff                                                          | Phase 5                                                                        | Pure extraction commit first, role split second                                                 |
| An interactive RSVP control nested inside a row-wide `Link`                                                                          | Phases 1, 4, 5                                                                 | Card is a container; the title is the link; the control is a sibling                            |
| `rsvpSummary` regresses the bounded-query property of `resolveMyEventState`                                                          | Phase 7                                                                        | One `groupBy` over the batch; assert query count in the service spec                            |
| The bottom bar covers the last row of every page                                                                                     | Phase 2                                                                        | Padding handled once in `PageContainer`, not per page                                           |
| A player is shown an unconfirmed score                                                                                               | Phase 8                                                                        | Projection derives from the **confirmed** extraction only                                       |
| Mockup details that `CLAUDE.md` forbids get transcribed                                                                              | Phases 2, 6                                                                    | Both already caught: the `nav-active-top` token (§1.4) and the jersey number (phase 6, item 5)  |

## 6. Out of scope, and why

Carried over from `player-journey.md` §8, restated so no phase quietly picks one up: the month-grid calendar (a planner's question, and the planner is a manager on a desktop), in-app chat (deprioritised in `docs/feature-set.md`; « Relancer » covers the one message that matters), a separate player app or route namespace (every proposal reuses the existing routes and the three role signals already in the client), and removing anything at all from the manager.
