# Team Season Statistics Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Phases are ordered by
> dependency and each ends in a shippable state — commit and, if instructed to, open a PR at the end
> of any phase rather than only at the very end. Do not skip ahead into a later phase's
> schema/service work while a task in an earlier phase is still unchecked.

**Goal:** Ship the team statistics screen from
[issue #78](https://github.com/BasketEasy/BasketEasy/issues/78) — per-player season averages, season
highs, points repartition and award counts, aggregated over a season's confirmed scoresheets.

**Spec:** [`docs/superpowers/specs/2026-09-02-team-season-stats-design.md`](../specs/2026-09-02-team-season-stats-design.md)
— read it first. It carries the rationale this plan does not repeat: why the jersey→roster join is
persisted at confirm time rather than derived, why the three MIN columns from the issue are cut, why
the repartition is a composition and not a shooting percentage, and how the season window is
defined.

## The two things this plan is most likely to get wrong

1. **Silently reintroducing the MIN columns.** Issue #78 lists GP, PPG, FPG, **MPG**, season highs
   for PTS, FLS and **MIN**. There is no minutes data anywhere in the system and the FFBB paper
   sheet has none. Build the eight columns the spec lists, not the eleven the issue lists, and do
   not approximate minutes from quarter marks.
2. **Treating the repartition as accuracy.** `3PT %` here is _share of points scored_, never
   made/attempted — the sheet records no misses. The French label is `Répartition des points`, and
   nothing in the UI may call it a percentage of shots.

## Global Constraints

- TypeScript strict mode, Prettier, ESLint per package — per root `CLAUDE.md`.
- Jest for `server` (`*.spec.ts`), Vitest + RTL for `app` (`*.test.ts(x)`).
- Shared shapes go in `packages/@basketeasy/types` **first**, then the Nest DTO, then the frontend
  caller.
- Every new literal colour/shadow/spacing value goes into
  `packages/@basketeasy/ui/tailwind-preset.cjs` first, **named** — never `bg-[#…]` in a component.
  This includes the three repartition-bar tones (Task 5.1).
- Query consumers branch `error → loading → empty → data`, in that order.
- All stats routes are read-only and guarded `ClubRoles('ADMIN','MEMBER')`; the only writer is the
  existing confirm endpoint, which stays `ClubRoles('ADMIN','MEMBER')` as it is today.
- `voterTeamPlayerId` is never selected or serialized anywhere in this feature — voting stays
  anonymous even though award counts are public.
- **Sandbox note** (matches the RSVP and match-interface plans): no live Postgres in this
  environment. Write migration SQL by hand in Prisma's generated style; run `prisma generate`
  (schema-only) after every schema edit so the rest of the build type-checks.
- Verify once per phase, scoped to what you touched (`pnpm exec prettier --check <files>`, the
  package's `eslint`, the relevant test paths) — not the repo-wide scripts, per `CLAUDE.md`.

## File Structure

```
server/prisma/schema.prisma                                  MODIFY  MatchPlayerStat + two back-relations
server/prisma/migrations/<ts>_match_player_stat/migration.sql NEW    hand-written
packages/@basketeasy/types/team-stats.ts                     NEW     TeamSeasonStats, TeamSeasonPlayerStats
packages/@basketeasy/types/scoresheet-extraction.ts          MODIFY  rosterMapping, suggestedRosterMapping
packages/@basketeasy/types/package.json                      MODIFY  "./team-stats" exports entry
server/src/scoresheets/dto/confirm-scoresheet-extraction.dto.ts MODIFY rosterMapping validation
server/src/scoresheets/scoresheets.service.ts                MODIFY  mapping write + suggestion read
server/src/team-stats/team-stats.module.ts                   NEW
server/src/team-stats/team-stats.controller.ts               NEW
server/src/team-stats/team-stats.service.ts                  NEW
server/src/team-stats/dto/get-team-stats.dto.ts              NEW
server/src/app.module.ts                                     MODIFY  register TeamStatsModule
packages/@basketeasy/ui/src/components/PointsRepartitionBar.tsx NEW  + .test.tsx, .stories.tsx
packages/@basketeasy/ui/package.json                         MODIFY  "./points-repartition-bar"
packages/@basketeasy/ui/tailwind-preset.cjs                  MODIFY  named repartition tones
app/src/clubs/useTeamSeasonStats.ts                          NEW     query hook
app/src/clubs/TeamSeasonStatsTab.tsx                         NEW     + .test.tsx
app/src/clubs/TeamStatsRow.tsx                               NEW     + .test.tsx (ResponsiveTable record)
app/src/clubs/ScoresheetExtractionCard.tsx                   MODIFY  roster-mapping step
app/src/pages/TeamDetailPage.tsx                             MODIFY  Statistiques tab
CLAUDE.md                                                    MODIFY  Team stats module section
```

---

## Phase 1 — The join: schema, confirm-time mapping

Ends shippable: confirming a scoresheet writes typed per-player rows. Nothing reads them yet.

### Task 1.1: Prisma schema — `MatchPlayerStat`

- [ ] Add the `MatchPlayerStat` model exactly as written in the spec's **Data model** section,
      comment included — it is the record of _why_ the table exists rather than a JSON field.
- [ ] Add `playerStats MatchPlayerStat[]` to `Event` and `matchStats MatchPlayerStat[]` to
      `TeamPlayer`.
- [ ] Hand-write the migration SQL (table, both FKs with `ON DELETE CASCADE`, the
      `@@unique([eventId, teamPlayerId])` index, the `teamPlayerId` index).
- [ ] `pnpm --filter @basketeasy/server exec prisma generate`.

### Task 1.2: Shared types — mapping in and suggestion out

- [ ] `packages/@basketeasy/types/scoresheet-extraction.ts`: add
      `ScoresheetRosterMappingEntry { jerseyNumber: number; teamPlayerId: string }` to
      `ConfirmScoresheetExtractionRequest` as required `rosterMapping`, and
      `SuggestedRosterMappingEntry { jerseyNumber: number; teamPlayerId: string | null; sheetName: string | null }[]`
      as `suggestedRosterMapping` on `ScoresheetExtraction`.
- [ ] Document on the type that an empty `rosterMapping` clears the match's stats, and that an
      unmapped jersey number is legal (a licensed guest who isn't in the app).

### Task 1.3: Confirm DTO

- [ ] `rosterMapping` as a `@ValidateNested({ each: true })` `@Type(() => …)` array of a class with
      `@IsInt()` `jerseyNumber` and `@IsUUID()` `teamPlayerId`; `@IsArray()`, allowed empty.

### Task 1.4: `ScoresheetsService.confirmExtraction` writes the rows

- [ ] Load the event alongside the scoresheet so `venue` and `teamId` are available; 400 with a
      French message if `venue` is null on a `MATCH`.
- [ ] Resolve our side (`venue === 'HOME' ? 'home' : 'away'`).
- [ ] Validate the mapping: every `teamPlayerId` belongs to this event's team (one `findMany`, not
      one query per entry), no duplicate `teamPlayerId`, no duplicate `jerseyNumber`. 400 each,
      messages in French, same shape as `setEventConvocations`.
- [ ] In the **same transaction** as the existing status/parsedData write: `deleteMany({ eventId })`
      then `createMany` the mapped rows — folding our side's `scoringPlays` into
      `freeThrowPoints`/`twoPointPoints`/`threePointPoints` by play value, summing `points`, and
      copying `fouls` from the matching `ScoresheetPlayerStats` row.
- [ ] Honour zero-vs-unknown: if our side contributed no plays at all, every point field is null,
      not 0. A mapped number with no sheet row still gets a row (all-null stats) so GP counts it.
- [ ] Do **not** touch `parsedData` beyond the existing `corrections` behaviour — it stays the
      verbatim read.

### Task 1.5: `getExtraction` returns `suggestedRosterMapping`

- [ ] Build it from our side's `ScoresheetPlayerStats`: normalize `name` (strip diacritics,
      casefold, drop punctuation) and match against the team's roster surnames; a unique hit sets
      `teamPlayerId`, ambiguous or no hit leaves it null.
- [ ] Extract the normalizer as a small module-local helper with its own tests — it is the piece
      most likely to be wrong and the cheapest to test.

### Task 1.6: Backend tests for Phase 1

- [ ] `scoresheets.service.spec.ts`: side chosen from `venue`; null `venue` 400s; foreign
      `teamPlayerId` 400s; duplicate player and duplicate jersey 400; re-confirm replaces rather
      than appends; empty mapping clears; buckets fold correctly (a 1/2/3 mix); unread column yields
      nulls not zeros; mapped-but-absent number yields an all-null row.
- [ ] Suggestion tests: exact surname, accented surname, casefold, ambiguous surname → null.
- [ ] Verify: prettier + eslint on the touched files, `pnpm --filter @basketeasy/server test -- scoresheets`.

---

## Phase 2 — Aggregation: the `team-stats` module

Ends shippable: the endpoint returns real season stats. No UI yet.

### Task 2.1: Shared types

- [ ] `packages/@basketeasy/types/team-stats.ts` exactly as the spec's **Shared types** section
      defines it, doc comments included (especially "the year the season starts").
- [ ] Add the `"./team-stats"` entry to the package's `exports` — new file _and_ entry together, per
      `CLAUDE.md`'s no-barrel rule.

### Task 2.2: `TeamStatsService`

- [ ] New `server/src/team-stats/`, injecting `PrismaService` directly (no `TeamsService`/
      `EventsService` import — the cross-module convention Events and Dashboard already follow).
- [ ] `assertTeamInClub(clubId, teamId)` local to this service, same defense-in-depth shape as
      `EventsService`'s.
- [ ] Season window helpers: `seasonYearFor(date)` and `seasonWindow(year)` → 1 Sep 00:00:00Z to
      31 Aug 23:59:59.999Z of the following year. Pure functions, unit-tested on the boundaries.
- [ ] Three queries, bounded regardless of match count: roster (`TeamPlayer` + `Player`),
      `MatchPlayerStat` joined to `Event` filtered to team + window, `EventVote` `groupBy`
      `votedTeamPlayerId` × `category` over the window's events. **Never** select
      `voterTeamPlayerId`.
- [ ] `availableSeasons`: distinct season years that actually have stats or votes for this team,
      newest first.
- [ ] Fold in memory: GP = count of stat rows; averages over **non-null** values only (null
      denominator → null, never 0); season highs = max over non-null; repartition = season bucket
      totals. Sort by `pointsPerGame` desc, nulls last, then surname.
- [ ] Round averages to one decimal server-side so every client shows the same number.

### Task 2.3: Controller, DTO, module registration

- [ ] `GET clubs/:clubId/teams/:teamId/stats`, `@UseGuards(JwtAuthGuard, ClubRolesGuard)`,
      `@ClubRoles('ADMIN','MEMBER')`.
- [ ] `GetTeamStatsDto`: optional `season`, `@Type(() => Number) @IsInt()`, with a sane range guard.
- [ ] Register `TeamStatsModule` in `app.module.ts`.

### Task 2.4: Backend tests for Phase 2

- [ ] Season boundaries (31 Aug vs 1 Sep, both directions), nulls excluded from both sides of an
      average, season highs across nulls, roster member with no data present with zeros, awards
      counted for a match with no scoresheet, `availableSeasons` ordering, sort order with null PPG.
- [ ] Controller spec covering the guard wiring and the default-season path.
- [ ] Verify: prettier + eslint on the touched files, `pnpm --filter @basketeasy/server test -- team-stats`.

---

## Phase 3 — The mapping UI

Ends shippable: a manager can actually produce the data Phase 1 writes.

### Task 3.1: `ScoresheetExtractionCard` roster mapping

- [ ] Render one row per jersey number on our side of the sheet: the sheet's number and name (read
      only) next to a roster `SelectField` pre-set to `suggestedRosterMapping`, with an explicit
      `Non attribué` option.
- [ ] A roster player already chosen on another row is disabled in the other selects (the server
      400s on duplicates; the UI shouldn't let it happen).
- [ ] Confirm sends `rosterMapping` built from the selects, skipping `Non attribué`.
- [ ] Success and failure of the confirm mutation are `toast()`s — the card can scroll out of view.
      Field-level problems (nothing mapped at all, say) are inline `FieldError`.
- [ ] Update `MatchScoresheetTab.test.tsx` / the card's tests for the new step.

### Task 3.2: Verify Phase 3

- [ ] prettier + eslint on the touched files, `pnpm --filter @basketeasy/app test -- ScoresheetExtractionCard MatchScoresheetTab`.
- [ ] Screenshot the mapping step (mock API + Vite dev server + Playwright, per `CLAUDE.md`).

---

## Phase 4 — The screen

### Task 4.1: `PointsRepartitionBar` primitive

- [ ] Add three **named** tones to `tailwind-preset.cjs` first if the ones needed don't exist —
      never an arbitrary value in the component.
- [ ] `packages/@basketeasy/ui/src/components/PointsRepartitionBar.tsx`: takes the three counts,
      renders a stacked bar, owns its own colours (no colour prop, no `className` that changes
      look). Accessible label reads the three shares. Zero total renders an empty/neutral track, not
      a division by zero.
- [ ] `.test.tsx` (zero total, single non-zero bucket, all three) + `.stories.tsx` +
      `"./points-repartition-bar"` in the package's `exports`.

### Task 4.2: `useTeamSeasonStats` hook

- [ ] TanStack Query hook keyed on `(clubId, teamId, season)`, calling through `ApiClient`.

### Task 4.3: `TeamSeasonStatsTab` + `TeamStatsRow`

- [ ] Tab component branches `error → loading → empty → data`, in that order. The error branch is
      an `Alert`, never an `EmptyState`.
- [ ] Season `SelectField` above the table, inline (single-field, low-risk, high-frequency).
- [ ] `ResponsiveTable` with `columns`, and **one** `TeamStatsRow` branching on `useTableLayout()`
      — not a row/card pair.
- [ ] Columns: Joueur · MJ · PTS/M · FA/M · Meilleur total (PTS) · Meilleur total (FA) ·
      Répartition des points · Distinctions. `.tabular` on every numeric cell. `—` for a null
      average, never `0`.
- [ ] Distinctions render as `Badge`s carrying the 🏆/🛡️ glyph in the label; no colour named at the
      call site.
- [ ] Caption under the table: "Calculé sur N matchs analysés" from `matchesPlayed`, making the
      "only processed games count" rule visible.

### Task 4.4: Wire into `TeamDetailPage`

- [ ] Fifth tab `Statistiques` (`?tab=stats`), between Effectif and Événements, using the same
      `replace: true` `TabsTrigger` pattern as the existing four.
- [ ] Render the tab only when the team has at least one match.
- [ ] Extend `TeamDetailPage.test.tsx` for the new tab and its visibility rule.

### Task 4.5: Verify Phase 4

- [ ] prettier + eslint on the touched files; `pnpm --filter @basketeasy/app test -- TeamSeasonStatsTab TeamStatsRow TeamDetailPage`;
      `pnpm --filter @basketeasy/ui test -- PointsRepartitionBar` if the package has a test script.
- [ ] **Screenshot the Statistiques tab** against a mock API, per `CLAUDE.md` — including the empty
      branch (team with no analysed match) and a populated table.

---

## Phase 5 — Docs, full verification, push

### Task 5.1: `CLAUDE.md`

- [ ] Add a **Team stats module** section after Scoresheets: what `MatchPlayerStat` is and why the
      join is persisted at confirm time, the season definition, the zero-vs-unknown rule carried
      forward, that the repartition is a composition and not accuracy, and that MPG/MIN are
      deliberately absent pending a real playing-time source.
- [ ] Update the Scoresheets section: confirming now also writes `MatchPlayerStat` rows, and
      "nothing renders `parsedData` yet" is no longer true.
- [ ] Update **What's deliberately not here yet** accordingly.

### Task 5.2: Close out

- [ ] Repo-wide `pnpm format:check`, `pnpm lint`, `pnpm test`, `pnpm build` before pushing.
- [ ] Commit per phase; push to `claude/team-stats-aggregation-tv6ceo`.
- [ ] Reference issue #78 in the PR body, and call out explicitly that the three MIN columns from
      the issue are cut, with the reason.
