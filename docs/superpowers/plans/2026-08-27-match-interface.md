# Match Interface Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Phases are ordered
> by dependency and each ends in a shippable state — commit and, if instructed to, open a PR at
> the end of any phase rather than only at the very end. Do not skip ahead into a later phase's
> schema/service work while a task in an earlier phase is still unchecked.

**Goal:** Build the match interface designed in the mockups — a match detail page (Aperçu /
Effectif / Vote / Feuille de match), jersey/ball logistics, best & worst player voting (both
results public), and e-Marque scoresheet photo capture — pixel-faithful to the mockups.

**Spec:** [`docs/superpowers/specs/2026-08-27-match-interface-design.md`](../specs/2026-08-27-match-interface-design.md)
— read it first for full rationale (why these four slices, why venue/logistics live directly on
`Event`, why voting has no hard deadline, why the scoresheet status enum has one member today).
This plan only repeats what's needed to implement each task.

## The non-negotiable: pixel fidelity to the mockups

**Every task below that touches `.tsx`/JSX references exact line ranges in the committed mockup
source at [`docs/superpowers/specs/assets/2026-08-27-match-interface/`](../specs/assets/2026-08-27-match-interface/).**
Before writing any markup for a task, open the referenced file and read those lines. Rules,
repeated from the spec because they matter more than anything else in this plan:

1. **Transcribe hex values, spacing, radii, font-weights, and letter-spacing exactly.** Don't
   round, don't substitute a "close enough" token.
2. **Copy French copy verbatim** — wording, `&mdash;`/`&laquo;` typography included.
3. **Translate `<div style="...">` markup into real components** (`Card`, `Badge`, `Avatar`,
   `Table`, `Tabs`, `SectionHeading`, `Button`) that render those same pixel values — don't
   paste raw inline-style soup into the app, and don't invent a new one-off primitive when an
   existing shared component can be extended to produce the same output.
4. **After finishing each screen's task, open it in the running app next to the mockup**
   (canvas at `https://claude.ai/code/artifact/b80ff86b-6f3d-4842-a3dd-001c20cd0d50`, or the
   local `.dc.html`) and compare before checking the task done. Phase 6's last task is a
   dedicated full pass doing this across every screen — but don't wait until then to notice a
   drift; catch it in the task that introduced it.
5. Any real conflict between a mockup value and `CLAUDE.md`'s Parquet rules (not-yet-tokenized
   color, a modal where the inline-vs-modal rule says otherwise) — the constraint wins; raise it,
   don't silently pick a side.

## Global Constraints

- TypeScript strict mode, Prettier, ESLint per package — per root `CLAUDE.md`.
- Jest for `server` (`*.spec.ts`), Vitest + RTL for `app` (`*.test.ts(x)`).
- Shared shapes go in `packages/@basketeasy/types` first, mirrored by backend DTOs.
- Every new literal color/shadow/spacing value goes into
  `packages/@basketeasy/ui/tailwind-preset.cjs` first, named — never an arbitrary Tailwind value
  (`bg-[#…]`) in a component file. This includes the `gold` accent (Task 1.1).
- All match-only features (`venue`, logistics, voting, scoresheet) are gated to
  `event.type === 'MATCH'` server-side (400 otherwise) — don't let a `TRAINING` event reach any
  of these new routes.
- Self-service actions (voting, RSVP-adjacent logistics self-assign, scoresheet upload) resolve
  the acting user's own `TeamPlayer` row server-side, never trust an id from the request body for
  "who is this about" — same pattern as RSVP and convocations elsewhere in this module.
- **Sandbox note** (matches the RSVP plan): no live Postgres in this environment. Write migration
  SQL by hand in Prisma's generated style; run `prisma generate` (schema-only) after every schema
  edit so the rest of the build type-checks.

---

## Phase 1 — Foundations: design token, venue field, match detail shell, Aperçu tab

Ends in a shippable state: a working `/clubs/:clubId/teams/:teamId/events/:eventId` page with a
single Aperçu tab (hero, RSVP, informations pratiques — no logistics section yet), reachable from
a real link on the agenda card, which also gains the home/away badge.

### Task 1.1 — `gold` design token

**Files:** Modify `packages/@basketeasy/ui/tailwind-preset.cjs`

- [ ] Add to `theme.extend.colors`:
  ```js
  gold: { DEFAULT: '#C08A2E', text: '#8C5F16', tint: '#FBF1DC' },
  ```
  (values transcribed from the canvas sticky note / `assets/.../Vote.dc.html`'s trophy/leaderboard
  accent — see spec's Fidelity section.)
- [ ] `pnpm --filter @basketeasy/ui exec prettier --check tailwind-preset.cjs`; commit:
  ```bash
  git add packages/@basketeasy/ui/tailwind-preset.cjs
  git commit -m "feat(ui): add gold token for match voting/leaderboard accent"
  ```

### Task 1.2 — Prisma schema: `EventVenue`

**Files:** Modify `server/prisma/schema.prisma`; create
`server/prisma/migrations/20260827000000_add_event_venue/migration.sql`

- [ ] Add `enum EventVenue { HOME AWAY }`; add `venue EventVenue?` to `model Event`.
- [ ] Migration SQL:
  ```sql
  -- CreateEnum
  CREATE TYPE "EventVenue" AS ENUM ('HOME', 'AWAY');
  -- AlterTable
  ALTER TABLE "Event" ADD COLUMN "venue" "EventVenue";
  ```
- [ ] `pnpm --filter @basketeasy/server exec prisma generate`; commit:
  ```bash
  git add server/prisma/schema.prisma server/prisma/migrations
  git commit -m "feat(server): add EventVenue (home/away) to Event"
  ```

### Task 1.3 — Shared types: `venue`

**Files:** Modify `packages/@basketeasy/types/events.ts`

- [ ] Add `export type EventVenue = 'HOME' | 'AWAY';`; add `venue: EventVenue | null` to
      `TeamEvent`; add `venue?: EventVenue` to the create/update request types (required
      server-side for MATCH, validated below, so keep it optional in the wire type and let the
      DTO enforce presence).
- [ ] Verify + commit:
  ```bash
  pnpm --filter @basketeasy/types build
  git add packages/@basketeasy/types/events.ts
  git commit -m "feat(types): add EventVenue to TeamEvent and event requests"
  ```

### Task 1.4 — Backend: validate + return `venue`

**Files:** Modify `server/src/events/dto/create-event.dto.ts`,
`server/src/events/dto/update-event.dto.ts`, `events.service.ts`, `events.service.spec.ts`,
`events.controller.spec.ts` (fixtures only)

- [ ] DTOs: add `venue?: EventVenue` (`@IsEnum(EventVenue) @IsOptional()`).
- [ ] `EventsService`: wherever `opponentName` is required-for-MATCH/forced-null-for-TRAINING
      (`createEvent`, `updateEvent`, `buildOccurrences`), apply the identical rule to `venue`
      (400 `"Le domicile/extérieur est requis pour un match"` if missing on a MATCH create/update;
      force `null` on TRAINING). Add `venue` to `toTeamEvent`'s mapped output.
- [ ] Tests: MATCH create/update without `venue` → 400; TRAINING create/update with `venue` set
      → forced null in response; `listEvents`/`createEvent`/`updateEvent` responses carry `venue`.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/server test -- events.service.spec.ts events.controller.spec.ts
  git add server/src/events
  git commit -m "feat(server): validate and return Event.venue"
  ```

### Task 1.5 — Frontend: match detail route + page shell + Aperçu tab

**Files:** Create `app/src/pages/MatchDetailPage.tsx` (+ test), create
`app/src/clubs/matchDetailLabels.ts` (+ test); modify `app/src/App.tsx` (route registration)

Reference: `assets/.../Main.dc.html` lines 1–150 (everything above the `<!-- Logistique -->`
comment — that section is Phase 2).

- [ ] Add route `clubs/:clubId/teams/:teamId/events/:eventId` inside the authenticated route
      tree in `App.tsx`, rendering `MatchDetailPage`.
- [ ] `MatchDetailPage.tsx`:
  - Fetches the event via the existing `useEventList`/a new single-event lookup (prefer adding a
    `GET .../events/:eventId` single-fetch if one doesn't already exist — check
    `events.controller.ts` first; reuse `listEvents`'s existing query hook filtered client-side
    only if a single-event endpoint would be net-new backend work disproportionate to this task,
    otherwise add the trivial single-GET route + hook, mirroring `assertEventInTeam`'s existing
    fetch).
  - Renders: back link to the team's Événements tab (label = team name, per
    `Main.dc.html:35-38`), header (match title + Domicile/Extérieur badge, `venue === 'HOME'` →
    "Domicile" else "Extérieur" — lines 41-53), hero time-block + vs framing (lines 55-79, reuse
    the existing time-block pattern from `TeamEventsAgenda`'s `AgendaEventCard` rather than a new
    one), `EventRsvpControl` reused as-is for the RSVP segment (lines 81-104 — the mockup's inline
    buttons ARE `EventRsvpControl`, not a redesign of it), a `Tabs`/`TabsTrigger` shell with
    `?tab=` query param (default `apercu`) holding just one trigger for now ("Aperçu"), and the
    "Informations pratiques" info-card grid (lines 114-150: date/heure, lieu, adversaire, notes —
    four `Card`-based tiles in a 2-column grid).
  - Query branches error → loading → empty → data, per `CLAUDE.md`.
  - Redirects (or 400s inline) if the resolved event's `type !== 'MATCH'` — this page doesn't
    exist for trainings.
- [ ] `matchDetailLabels.ts`: `venueLabel(venue)` → "Domicile"/"Extérieur".
- [ ] Tests: renders header/hero/info grid from a mocked `TeamEvent`; error/loading/empty
      branches; redirects on a TRAINING event id.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/app test -- MatchDetailPage matchDetailLabels
  git add app/src/pages/MatchDetailPage.tsx app/src/pages/MatchDetailPage.test.tsx app/src/clubs/matchDetailLabels.ts app/src/clubs/matchDetailLabels.test.ts app/src/App.tsx
  git commit -m "feat(app): match detail page shell with Aperçu tab"
  ```

### Task 1.6 — Frontend: agenda card gains home/away badge + becomes a real link

**Files:** Modify `app/src/clubs/EventRow.tsx`, `app/src/clubs/TeamEventsAgenda.tsx` (+ their
tests)

Reference: `assets/.../AgendaCard.dc.html` lines 56-74 (upcoming match) and 109-124 (past match) —
just the badge row and the link-wrap for this task; logistics mini-chips and "Votes ouverts" are
Phases 2/4.

- [ ] Wrap the whole `MATCH`-type agenda card / table row in a `<Link>` to
      `/clubs/:clubId/teams/:teamId/events/:eventId` (per `CLAUDE.md`'s A1 — every URL-changing
      control is a link; `TRAINING` rows stay exactly as they are, not linked).
  - `EventRow.tsx`'s existing "Convoqué par le coach" badge (see current source) sits alongside
    the new Domicile/Extérieur badge — same visual weight, don't let one crowd out the other;
    match `AgendaCard.dc.html`'s flex-wrap grouping exactly.
- [ ] Add the Domicile/Extérieur badge next to the existing type/opponent info, using
      `matchDetailLabels.venueLabel`.
- [ ] Update tests for the new link-wrap and badge.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/app test -- EventRow TeamEventsAgenda
  git add app/src/clubs/EventRow.tsx app/src/clubs/EventRow.test.tsx app/src/clubs/TeamEventsAgenda.tsx app/src/clubs/TeamEventsAgenda.test.tsx
  git commit -m "feat(app): link MATCH agenda cards to the match detail page, add venue badge"
  ```

### Task 1.7 — Phase 1 verification

- [ ] `pnpm format`, lint, test, `tsc --noEmit`, build for both `server` and `app` (scoped
      commands from `CLAUDE.md`'s Verification cadence bullet suffice mid-phase; run the
      unscoped root commands only before the final push in Phase 6).
- [ ] Manually run the app (`run` skill), open a MATCH event's detail page, compare against
      `Main.dc.html`'s Aperçu section and `AgendaCard.dc.html`'s upcoming-match card.

---

## Phase 2 — Effectif tab (merged roster table)

No new backend. Pure reuse of `useEventRsvps`/`useEventConvocations` (already exist per
`CLAUDE.md`'s Events module section) merged into one table.

### Task 2.1 — `MatchRosterTab.tsx`

**Files:** Create `app/src/clubs/MatchRosterTab.tsx` (+ test); modify `MatchDetailPage.tsx` (add
second tab trigger)

Reference: `assets/.../Roster.dc.html` lines 22-90+ (condensed context strip already covered by
the page shell — only build the summary meters + table from this file).

- [ ] Fetch both `useEventRsvps` and `useEventConvocations` for the event id; merge by
      `teamPlayerId` into one row set (name, avatar-initials via existing `Avatar` component,
      role, convocation status, RSVP status).
- [ ] Two summary meters ("Convoqués N/M", "Présences confirmées N/M" — `Roster.dc.html:38-50`)
      derived client-side from the merged data, matching this module's established
      no-backend-aggregate convention.
- [ ] Manager-only "Gérer la convocation" button (reuse existing `EventConvocationModal`, opened
      from here instead of duplicating its logic) — `Roster.dc.html:49`.
- [ ] Desktop: `Table`/`TableRow`/`TableCell`, matching `Roster.dc.html:53-90`'s column order
      (Joueur, Rôle, Convocation, Présence) and the exact status-dot + color convention already
      used by `EventRsvpBreakdown`/`EventConvocationBreakdown` (reuse those components' status→
      color mapping rather than re-deriving it). Below `useIsDesktopViewport`'s breakpoint,
      collapse to cards — same pattern `MembersPage`/`MyTeamsPage` already use, which
      `Roster.dc.html` doesn't show but `CLAUDE.md`'s Consistency section already flags as a gap
      not to repeat.
- [ ] Add the "Effectif" `TabsTrigger` to `MatchDetailPage.tsx`.
- [ ] Tests: merge logic (a player convoked-and-present, convoked-and-absent, not-convoked),
      meter math, desktop/mobile render branches.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/app test -- MatchRosterTab MatchDetailPage
  git add app/src/clubs/MatchRosterTab.tsx app/src/clubs/MatchRosterTab.test.tsx app/src/pages/MatchDetailPage.tsx app/src/pages/MatchDetailPage.test.tsx
  git commit -m "feat(app): match detail Effectif tab"
  ```

---

## Phase 3 — Jersey/ball logistics

### Task 3.1 — Prisma schema

**Files:** Modify `server/prisma/schema.prisma`; create
`server/prisma/migrations/20260827000001_add_event_logistics/migration.sql`

- [ ] Add `jerseysTeamPlayerId String?`, `ballsTeamPlayerId String?`, and the two named relations
      to `model Event` exactly as in the spec's Data model section; add the two back-relations to
      `model TeamPlayer`.
- [ ] Migration SQL (columns + two FKs with `ON DELETE SET NULL`).
- [ ] `prisma generate`; commit:
  ```bash
  git add server/prisma/schema.prisma server/prisma/migrations
  git commit -m "feat(server): add jersey/ball logistics assignment to Event"
  ```

### Task 3.2 — `isTeamManager` extraction + `EventsService.setEventLogistics`

**Files:** Modify `server/src/auth/guards/team-manager.guard.ts` (extract), `events.service.ts`,
`events.service.spec.ts`

- [ ] Extract `TeamManagerGuard`'s "club ADMIN of a linked club OR TeamAdmin of this team" check
      into a standalone, injectable method (`AuthService.isTeamManager(clubId, teamId, userId)`
      or similar — match wherever the guard's dependencies already live) callable from both the
      guard and `EventsService` without duplicating the query logic.
- [ ] Implement `setEventLogistics` exactly per the spec's Service logic section (self-assign/
      self-clear always allowed for a rostered member; assigning/clearing someone else requires
      `isTeamManager`; 400 on non-MATCH event or a `teamPlayerId` not on this team's roster).
- [ ] Tests: self-assign by a rostered non-manager succeeds; a non-manager assigning a teammate
      403s; a manager reassigning anyone succeeds; a 400 for a `teamPlayerId` off-roster; a 400
      on a TRAINING event.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/server test -- events.service.spec.ts team-manager.guard.spec.ts
  git add server/src/auth/guards/team-manager.guard.ts server/src/events/events.service.ts server/src/events/events.service.spec.ts
  git commit -m "feat(server): jersey/ball logistics self-assign and manager reassign"
  ```

### Task 3.3 — Controller route + shared types + DTO

**Files:** Modify `events.controller.ts`, `events.controller.spec.ts`,
`packages/@basketeasy/types/events.ts`; create `server/src/events/dto/set-event-logistics.dto.ts`

- [ ] `SetEventLogisticsDto`: `field` (`@IsIn(['JERSEYS','BALLS'])`), `teamPlayerId`
      (`@IsString() @IsOptional()` — null clears).
- [ ] `PATCH :eventId/logistics` route, `ClubRoles('ADMIN','MEMBER')` guard (service narrows
      further, per Task 3.2).
- [ ] Shared types: `EventLogisticsAssignee`, `SetEventLogisticsRequest`, `TeamEvent.logistics`
      exactly per spec.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/types build
  pnpm --filter @basketeasy/server test -- events.controller.spec.ts
  git add server/src/events/events.controller.ts server/src/events/events.controller.spec.ts server/src/events/dto/set-event-logistics.dto.ts packages/@basketeasy/types/events.ts
  git commit -m "feat(server): wire logistics route; add logistics shared types"
  ```

### Task 3.4 — Frontend: `EventLogisticsSection` (Aperçu tab) + agenda mini-chips

**Files:** Create `app/src/clubs/useEventLogisticsSet.ts` (+ test),
`app/src/clubs/EventLogisticsSection.tsx` (+ test); modify `MatchDetailPage.tsx`, `EventRow.tsx`,
`TeamEventsAgenda.tsx` (+ their tests)

References:

- `assets/.../Main.dc.html` lines 152-190 (the Logistique section — assigned-row and
  unassigned-row anatomy, exact icon paths, exact button styling for "Changer" vs
  "Je m'en occupe").
- `assets/.../AgendaCard.dc.html` lines 76-86 (the mini-chip pair on the agenda card — note the
  check-mark glyph and muted styling for the unassigned chip).

- [ ] `useEventLogisticsSet.ts`: mutation `({ field, teamPlayerId }) => apiClient.patch<TeamEvent>(.../logistics, {...})`;
      `onSuccess` invalidates the event detail query and `teamEventsQueryKey` (so the agenda
      card's mini-chips refresh too).
- [ ] `EventLogisticsSection.tsx`: two rows (Maillots, Ballons), each showing either the current
      assignee (avatar-initials + name + a small check icon, "Changer" button when the viewer is
      a manager or is the current assignee themself) or an unassigned state ("Non assigné" badge + "Je m'en occupe" primary button, shown to any rostered member). "Changer" opens an inline
      `SelectField` of the roster (not a `Dialog` — same reasoning as `TeamPlayerRow`'s role
      select), not a second click target that navigates anywhere.
- [ ] Wire into `MatchDetailPage.tsx`'s Aperçu tab, right below "Informations pratiques".
- [ ] Agenda card: two small chips (`AgendaCard.dc.html:77-86`) — reuse the same "assigned/
      unassigned" copy and icon logic as `EventLogisticsSection`, factored so both share one
      small presentational piece rather than duplicating the assigned/unassigned branching.
- [ ] Tests: self-assign, self-clear, manager-reassign-flow, unassigned rendering, chip rendering
      on the agenda card.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/app test -- EventLogistics useEventLogisticsSet EventRow TeamEventsAgenda MatchDetailPage
  git add app/src/clubs/useEventLogisticsSet.ts app/src/clubs/useEventLogisticsSet.test.ts app/src/clubs/EventLogisticsSection.tsx app/src/clubs/EventLogisticsSection.test.tsx app/src/pages/MatchDetailPage.tsx app/src/clubs/EventRow.tsx app/src/clubs/TeamEventsAgenda.tsx
  git commit -m "feat(app): jersey/ball logistics UI in match detail and agenda card"
  ```

---

## Phase 4 — Best & worst player voting

### Task 4.1 — Prisma schema

**Files:** Modify `server/prisma/schema.prisma`; create
`server/prisma/migrations/20260827000002_add_event_vote/migration.sql`

- [ ] Add `enum EventVoteCategory { BEST WORST }` and `model EventVote` exactly per spec (note
      `voterTeamPlayerId` is stored but must never be serialized in any API response — flag this
      loudly in a code comment on the model and again in the service, since it's the one field in
      this whole feature that would be a real privacy regression if leaked).
- [ ] Migration SQL: enum, table, the composite unique index, the `(eventId, category)` index,
      two FKs.
- [ ] `prisma generate`; commit:
  ```bash
  git add server/prisma/schema.prisma server/prisma/migrations
  git commit -m "feat(server): add EventVote model for best/worst player voting"
  ```

### Task 4.2 — `EventsService` voting methods

**Files:** Modify `events.service.ts`, `events.service.spec.ts`

- [ ] `castVote` and `getEventVoteResults` exactly per the spec's Service logic section
      (before-match rejection, self-vote rejection, off-roster rejection, upsert-on-recast,
      aggregation that never includes `voterTeamPlayerId`).
- [ ] `buildVoteResults(votes, myTeamPlayerId)` helper: groups by category, counts per
      `votedTeamPlayerId`, sorts descending, resolves `myVote.best`/`myVote.worst` from the
      caller's own two rows if present.
- [ ] Tests: vote before match start → 400; self-vote → 400; off-roster target → 400; recast
      updates (not duplicates) the row; results never contain `voterTeamPlayerId` under any
      circumstance (explicit assertion, not just implicit from the mapped shape); `totalVoters`
      reflects roster size, `votesCast` reflects distinct voters who've cast at least one vote.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/server test -- events.service.spec.ts
  git add server/src/events/events.service.ts server/src/events/events.service.spec.ts
  git commit -m "feat(server): best/worst player vote casting and results aggregation"
  ```

### Task 4.3 — Controller routes + shared types + DTO

**Files:** Modify `events.controller.ts`, `events.controller.spec.ts`,
`packages/@basketeasy/types/events.ts`; create `server/src/events/dto/cast-event-vote.dto.ts`

- [ ] `CastEventVoteDto`: `category` (`@IsIn(['BEST','WORST'])`), `teamPlayerId` (`@IsString()`).
- [ ] `PATCH :eventId/votes` and `GET :eventId/votes`, `ClubRoles('ADMIN','MEMBER')` (service
      narrows to rostered-only for the PATCH).
- [ ] Shared types: `EventVoteCategory`, `EventVoteCandidateResult`, `EventVoteResults`,
      `CastEventVoteRequest` exactly per spec.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/types build
  pnpm --filter @basketeasy/server test -- events.controller.spec.ts
  git add server/src/events packages/@basketeasy/types/events.ts
  git commit -m "feat(server): wire voting routes; add voting shared types"
  ```

### Task 4.4 — Frontend: `MatchVoteTab`

**Files:** Create `app/src/clubs/useEventVoteCast.ts`, `app/src/clubs/useEventVoteResults.ts` (+
tests), `app/src/clubs/MatchVoteTab.tsx` (+ test); modify `MatchDetailPage.tsx`, `EventRow.tsx`,
`TeamEventsAgenda.tsx` (+ their tests)

References: **`assets/.../Vote.dc.html` — the already-updated, public-results version.** Read
the whole file; it's short enough. Ballot: lines ~32-91. Merged public results card (best +
worst leaderboards, gold vs. blue-green accents): lines ~93-131 in the current committed file.
Sensitivity rationale sticky note (for understanding intent, not for literal UI): the file's
final block. Agenda card's "Votes ouverts" badge: `AgendaCard.dc.html:126-129`.

- [ ] `useEventVoteCast.ts` / `useEventVoteResults.ts`: mutation + query against the two new
      routes; cast's `onSuccess` invalidates the results query.
- [ ] `MatchVoteTab.tsx`:
  - Ballot card: one roster-radio-group per category (`BEST` uses the orange-filled selected
    state per `Vote.dc.html:44-48`; `WORST` — labeled "Joueur en difficulté ce match" — uses the
    blue-green selected state per lines 74-78), single submit button, success state
    ("Vote envoyé — merci !"), pre-selected from `myVote` on load. Excludes the voter themself
    from both candidate lists.
  - Results card: merged, both public, gold leaderboard-with-trophy-icon (`TrophyIcon`) for BEST,
    sober blue-green bars for WORST — transcribe `Vote.dc.html`'s exact bar-width/opacity
    convention for 1st/2nd/3rd place rather than inventing a new one.
  - Gate the whole tab's ballot behind "vote window open" (`event.startsAt` in the past); before
    that, show only a "Le vote ouvrira après le match" state, not an empty ballot.
- [ ] Add "Vote" `TabsTrigger` to `MatchDetailPage.tsx`.
- [ ] Agenda card: "Votes ouverts · N j restants" badge on past MATCH events within
      `VOTE_WINDOW_DAYS` of `startsAt` (client-computed, define `VOTE_WINDOW_DAYS = 7` alongside
      the badge logic — no new fetch).
- [ ] Tests: ballot excludes self; cast → results refetch; pre-vote-window state; results never
      render a `voterTeamPlayerId`-shaped field (there isn't one in the type, but assert the
      rendered output doesn't leak anything beyond `EventVoteCandidateResult`); agenda badge
      date-window math.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/app test -- MatchVoteTab useEventVote EventRow TeamEventsAgenda MatchDetailPage
  git add app/src/clubs/useEventVoteCast.ts app/src/clubs/useEventVoteCast.test.ts app/src/clubs/useEventVoteResults.ts app/src/clubs/useEventVoteResults.test.ts app/src/clubs/MatchVoteTab.tsx app/src/clubs/MatchVoteTab.test.tsx app/src/pages/MatchDetailPage.tsx app/src/clubs/EventRow.tsx app/src/clubs/TeamEventsAgenda.tsx
  git commit -m "feat(app): best/worst player voting tab and agenda badge"
  ```

---

## Phase 5 — E-marque scoresheet capture

The heaviest phase — new infrastructure, not just a new tab. Expect this to need judgment calls
the plan can't fully anticipate (bucket CORS, upload size limits); keep every addition scoped to
"get the photo stored," per the spec's Storage section.

### Task 5.1 — `StorageService` (Scaleway S3 wiring)

**Files:** Create `server/src/storage/storage.module.ts`, `storage.service.ts`,
`storage.service.spec.ts`; modify `docker-compose.yml`, `.env.example`, `server/src/app.module.ts`

- [ ] Add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `server/package.json`.
- [ ] `StorageService.getUploadUrl(key: string, contentType: string): Promise<string>` — presigned
      PUT, short expiry (e.g. 5 minutes — long enough for a mobile upload over a gym's wifi,
      short enough not to leave stale writable URLs around).
- [ ] Env vars `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
      `S3_SECRET_ACCESS_KEY` — add to `docker-compose.yml`'s `server` service and `.env.example`,
      matching `JWT_ACCESS_SECRET`'s existing treatment exactly.
- [ ] Test: mock the S3 client, assert `getUploadUrl` is called with the right bucket/key/expiry
      — no real network call in tests.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/server test -- storage.service.spec.ts
  git add server/src/storage server/package.json docker-compose.yml .env.example server/src/app.module.ts
  git commit -m "feat(server): StorageService for presigned S3 uploads"
  ```

### Task 5.2 — Prisma schema

**Files:** Modify `server/prisma/schema.prisma`; create
`server/prisma/migrations/20260827000003_add_event_scoresheet/migration.sql`

- [ ] Add `enum EventScoresheetStatus { UPLOADED }` and `model EventScoresheet` exactly per spec.
- [ ] Migration SQL.
- [ ] `prisma generate`; commit:
  ```bash
  git add server/prisma/schema.prisma server/prisma/migrations
  git commit -m "feat(server): add EventScoresheet model"
  ```

### Task 5.3 — `EventsService` scoresheet methods + controller + types

**Files:** Modify `events.service.ts`, `events.service.spec.ts`, `events.controller.ts`,
`events.controller.spec.ts`, `packages/@basketeasy/types/events.ts`; create
`server/src/events/dto/get-scoresheet-upload-url.dto.ts`,
`server/src/events/dto/confirm-scoresheet-upload.dto.ts`

- [ ] `getScoresheetUploadUrl`, `confirmScoresheetUpload`, `getScoresheetStatus` exactly per spec
      (content-type allowlist, rostered-member gate, non-MATCH 400, upsert-on-confirm).
- [ ] Routes: `POST :eventId/scoresheet/upload-url`, `PATCH :eventId/scoresheet`,
      `GET :eventId/scoresheet`, `ClubRoles('ADMIN','MEMBER')` + service-level rostered check.
- [ ] Shared types: `EventScoresheetStatus`, `EventScoresheetUploadUrlRequest/Response`,
      `ConfirmEventScoresheetRequest`, `EventScoresheet` exactly per spec.
- [ ] Tests: content-type rejection; non-rostered caller 403; non-MATCH 400; confirm upserts (not
      duplicates) on a retried upload; status returns `null` before any upload.
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/types build
  pnpm --filter @basketeasy/server test -- events.service.spec.ts events.controller.spec.ts
  git add server/src/events packages/@basketeasy/types/events.ts
  git commit -m "feat(server): scoresheet upload-url/confirm/status endpoints"
  ```

### Task 5.4 — Frontend: `MatchScoresheetTab`

**Files:** Create `app/src/clubs/useEventScoresheetUpload.ts` (+ test),
`app/src/clubs/useEventScoresheetStatus.ts` (+ test), `app/src/clubs/MatchScoresheetTab.tsx` (+
test); modify `MatchDetailPage.tsx` (+ test)

Reference: `assets/.../Scoresheet.dc.html` — all four frames (Capture, Aperçu avant envoi, En
file d'attente, Échec/retry — lines noted in the file's own comments). Read the whole file; the
persistent-not-toast failure state (the file's closing annotation) is a real requirement, not
mockup flavor text — implement it against the existing `QueryError` component/pattern, not a
`toast()` call.

- [ ] `useEventScoresheetUpload.ts`: orchestrates the three-step flow — request the presigned URL
      (`POST .../upload-url`), `PUT` the file directly to that URL (raw `fetch`, not
      `ApiClient` — this goes to S3, not the API), then confirm (`PATCH .../scoresheet`). Exposes
      enough state (`idle | uploading | confirming | error`) for the tab to render each frame.
- [ ] `useEventScoresheetStatus.ts`: query against `GET .../scoresheet`.
- [ ] `MatchScoresheetTab.tsx`: capture (native file input with `capture="environment"` on
      mobile, plain picker on desktop) → preview (show the selected image locally before
      uploading, per `Scoresheet.dc.html`'s frame 2) → on submit, run the upload hook → queued
      state once confirmed (status `UPLOADED`, displayed with the mockup's exact "En file
      d'attente pour analyse" copy — a static label for this one status, not a live queue read)
      → persistent failure card with "Réessayer l'envoi" on any step's error, replacing the whole
      capture flow until resolved (not a toast — see above).
- [ ] Add "Feuille de match" `TabsTrigger` to `MatchDetailPage.tsx`.
- [ ] Tests: happy path through all three async steps; upload-URL failure and PUT failure both
      surface the persistent error card; retry re-runs from the top; already-uploaded state on
      mount shows the queued frame directly (skips capture).
- [ ] Run, commit:
  ```bash
  pnpm --filter @basketeasy/app test -- MatchScoresheetTab useEventScoresheet MatchDetailPage
  git add app/src/clubs/useEventScoresheetUpload.ts app/src/clubs/useEventScoresheetUpload.test.ts app/src/clubs/useEventScoresheetStatus.ts app/src/clubs/useEventScoresheetStatus.test.ts app/src/clubs/MatchScoresheetTab.tsx app/src/clubs/MatchScoresheetTab.test.tsx app/src/pages/MatchDetailPage.tsx
  git commit -m "feat(app): e-Marque scoresheet capture tab"
  ```

---

## Phase 6 — Mobile pass, fidelity review, docs, final verification

### Task 6.1 — Mobile responsive pass

**Files:** Modify `MatchDetailPage.tsx` and the four tab components as needed

Reference: `assets/.../MobileDetail.dc.html` — the full file, it's the single source for how
every section restacks at phone width.

- [ ] Verify (and fix where it doesn't already fall out of the desktop layout's flex/grid
      wrapping) that the hero, info grid, logistics section, and tab bar all restack per
      `MobileDetail.dc.html` at a phone viewport. This should mostly "just work" if Phase 1-5's
      layouts used `flex-wrap`/grid with `useIsDesktopViewport` collapses as instructed — this
      task is verification + targeted fixes, not a rebuild.
- [ ] Check against the "no fake status bar / no fake keyboard" rule if any mobile-specific
      chrome was added — `MobileDetail.dc.html` has none, keep it that way.

### Task 6.2 — Full fidelity review

- [ ] Run the app locally (`run` skill). For each of the six mockup artboards, open the
      corresponding real screen at the same approximate viewport and compare side by side:
      `AgendaCard` → team Événements tab agenda view; `Main` → match detail Aperçu tab (desktop);
      `Roster` → Effectif tab; `Vote` → Vote tab (both ballot and results); `Scoresheet` → Feuille
      de match tab, all four states; `MobileDetail` → match detail page at phone width.
- [ ] Fix anything that drifted — a rounded spacing value, a substituted color, a reworded
      string. This is the enforcement mechanism for the "non-negotiable" section at the top of
      this plan; don't skip it because individual tasks already did spot checks.

### Task 6.3 — Docs: `CLAUDE.md`

**Files:** Modify `CLAUDE.md`'s Events module section

- [ ] Document: `Event.venue`, jersey/ball logistics (self-assign vs. manager-reassign split),
      `EventVote` (both categories public, voting anonymous, no hard deadline), `EventScoresheet` + the new `server/src/storage` module, and the match detail page route/tabs. Follow the
      existing section's density and style — bullet points grounded in file paths, not prose
      walkthroughs.
- [ ] Commit:
  ```bash
  git add CLAUDE.md
  git commit -m "docs: document the match interface in the Events module section"
  ```

### Task 6.4 — Full verification + push + PR

- [ ] `pnpm format`, `pnpm --filter @basketeasy/server lint`, `pnpm --filter @basketeasy/app lint`
- [ ] `pnpm --filter @basketeasy/server test`, `pnpm --filter @basketeasy/app test`
- [ ] `pnpm --filter @basketeasy/server exec tsc --noEmit`, `pnpm --filter @basketeasy/app exec tsc --noEmit`
- [ ] `pnpm --filter @basketeasy/server build`, `pnpm --filter @basketeasy/app build`
- [ ] Push, open the PR — link both the spec and this plan, and the published mockup canvas URL,
      in the PR description.
