# Team Season Statistics

Status: draft (loop 0)
Date: 2026-09-02
Issue: [#78 — feat: team player statistics screen](https://github.com/BasketEasy/BasketEasy/issues/78)

## Why

The scoresheet pipeline (`server/src/scoresheets`) now reads an FFBB e-Marque sheet into a
`ParsedScoresheetData` box score, and a manager confirms it. That data is per-match and lands
nowhere a coach can use: `MatchScoresheetTab` renders one sheet's extraction and stops. Issue #78
asks for the other half — a **Statistiques** screen on the team, aggregating every confirmed match
of a season into per-player averages, season highs, a points repartition, and award counts.

The blocker is that a confirmed extraction is a read of a **piece of paper**, not a statement about
the roster. `ScoresheetPlayerStats` identifies a scorer by `{ team: 'home' | 'away', number: 7 }`
and, when legible, a handwritten name. `EventVote` identifies an MVP by `TeamPlayer.id`. Nothing
joins the two, so today there is no query that can answer "how many points has _this player_ scored
this season". Establishing that join is the substance of this cut; the aggregation and the screen on
top of it are comparatively mechanical.

## Scope

**In scope:**

- A `MatchPlayerStat` table: one row per (event, `TeamPlayer`), written when a manager confirms a
  scoresheet extraction, carrying that player's `points`, `fouls`, and their points split into
  `freeThrowPoints` / `twoPointPoints` / `threePointPoints`.
- A **roster-mapping step in the confirm flow**: the confirm request carries an explicit
  jersey-number → `teamPlayerId` mapping for our own side of the sheet. The server pre-computes a
  suggested mapping; the manager confirms or corrects it in `ScoresheetExtractionCard`.
- `GET clubs/:clubId/teams/:teamId/stats?season=YYYY` returning `TeamSeasonStats` — one
  `TeamSeasonPlayerStats` entry per roster member, plus the season's own bounds and match count.
- A **Statistiques** tab on `TeamDetailPage` rendering that table: GP, PPG, FPG, season highs for
  PTS and FLS, a stacked 3PT/2PT/FT repartition bar, and 🏆/🛡️ award counts.
- A season selector, defaulting to the current season. "Previous year" in the issue means a
  **French basketball season** (1 September → 31 August), not a calendar year.

**Out of scope (deferred, don't build speculatively):**

- **MPG and the "Season High — MIN" column from issue #78.** The FFBB paper sheet has no minutes
  column; `ScoresheetPlayerStats` has no minutes field because there is nothing on the sheet to
  read. Shipping an MPG column would mean either inventing the number or building a whole second
  capture path. Both MIN columns are cut from this screen and stay blocked on
  `docs/feature-set.md`'s P1 _fair playing-time tracking_, which needs its own source of truth.
  Decided with the issue author; see **Minutes** below.
- **Opponent players.** Only our own side of the sheet is mapped and persisted. The other team's
  rows stay in `parsedData` (untouched — it remains the verbatim read) and never become
  `MatchPlayerStat` rows: they aren't in any roster we manage.
- **Club-wide or cross-team stats, and per-player career pages.** This is one team, one season.
- **Shooting percentages in the real basketball sense** (FG%, 3P%, FT% as made/attempted). The
  sheet records makes, not attempts — a missed shot leaves no mark in the running-score column. The
  issue's "3PT % / 2PT % / FT %" is therefore a **repartition of points scored**, not an accuracy
  rate, and the UI must label it as such (`Répartition des points`) so nobody reads 45 % as a
  shooting percentage. See **Repartition, not accuracy**.
- **Backfilling stats for already-confirmed scoresheets.** A sheet confirmed before this ships has
  no mapping and therefore no rows; it can be re-confirmed through the new flow to gain them.

## Decisions

### The join is persisted at confirm time, not derived at read time

Three ways to get from a jersey number to a roster row:

1. **A `jerseyNumber` column on `TeamPlayer`.** Cheapest, and wrong: amateur clubs share one jersey
   set across several teams, so a player's number changes between matches. A stable column would
   silently misattribute points the first time the set gets shuffled, and there'd be no record of
   which read produced which total.
2. **Match by name at read time**, scanning every confirmed `parsedData` blob on every page load.
   No migration, but it re-does fuzzy handwriting matching on every request, can't be corrected
   once wrong, and turns the stats query into a JSON scan.
3. **Resolve once, at confirm, into typed rows.** Chosen.

Confirming an extraction is _already_ the human-review step — a manager is already reading the
sheet against reality and correcting the AI. Asking them to also say which roster row each of their
own jersey numbers is adds one question to a screen they're already on, and it is the only moment
in the system where a person is looking at both the sheet and the team at the same time. Downstream,
aggregation becomes a `groupBy` over integer columns, and awards join on the same `TeamPlayer.id`
the mapping produced.

The mapping is **suggested, not guessed silently**: the server pre-matches by normalized surname
(the sheet's roster block does carry names, when legible) and the manager sees each suggestion next
to the sheet's own row. An unmapped jersey number is allowed — its points simply don't reach any
player's total — because a squad can field a licensed guest, and a confirm flow that refuses to
close until every number resolves would block the sheet on a player who isn't in the app.

### Which side of the sheet is ours

`Event.venue` (`HOME` | `AWAY`) is required on every `MATCH`, and `ScoresheetTeamSide` uses the same
`home`/`away` pairing for Équipe A/Équipe B. So our side is `venue === 'HOME' ? 'home' : 'away'` —
no new field, no per-sheet question. A `MATCH` with a null `venue` cannot happen (`EventsService`
enforces it), and the confirm endpoint 400s if one somehow does rather than picking a side.

### Repartition, not accuracy

Each `ScoresheetScoringPlay` is worth 1, 2 or 3, so a player's points split three ways exactly. The
three percentages are `bucketPoints / totalPoints` and sum to 100 % by construction. That makes them
a composition, which is why the UI renders them as one stacked bar rather than three numbers: a
stacked bar cannot be misread as three independent rates. `MatchPlayerStat` stores the three point
**counts**, not the percentages — percentages of a sum-of-sums are not the average of per-match
percentages, and storing counts keeps the season total honest.

### Zero versus unknown, carried forward

The points-parsing spec's rule survives into aggregation: a player with no scoring play scored 0
only if their team's column was read at all. `MatchPlayerStat.points` is therefore nullable, and a
null contributes to **neither** the numerator nor the denominator of PPG. Games played counts
matches where the player has a row at all (they were on the sheet), so GP stays truthful even when
one match's points are unknown; the UI shows `—` for an average with an empty denominator, never 0.

### Fouls are read, points are derived

`ScoresheetPlayerStats.fouls` comes straight off the left-hand roster block's five-cell grid, which
_is_ a thing to read, unlike points. It is copied to `MatchPlayerStat.fouls` as-is (nullable on the
same unknown-vs-zero rule) with no derivation.

### Awards come from `EventVote`, not the sheet

MVP (🏆) and "joueur en difficulté" (🛡️) counts are `EventVote` rows in category `BEST` / `WORST`,
counted per `votedTeamPlayerId` over the season's matches. They need no mapping — they already key
on `TeamPlayer`. Two consequences: award counts exist for a match with **no** scoresheet at all, and
they must not leak who voted (`voterTeamPlayerId` is never selected, per the match-interface spec's
anonymity rule). A player can therefore appear on the stats screen with awards and no box score.

### Minutes

Cut, per the Scope section. Stating it as a decision rather than an omission because issue #78 lists
three MIN columns and a future reader will otherwise assume they were forgotten: there is no minutes
data anywhere in the system, the FFBB paper sheet does not carry any, and approximating minutes from
quarter-participation marks would put an invented number in a column coaches would read as measured.

### Season boundary

`seasonYear` is the year the season **starts**: season `2026` runs `2026-09-01T00:00:00Z` through
`2027-08-31T23:59:59.999Z`, matching how the FFBB labels a season ("saison 2026-2027"). It is
derived from `Event.startsAt`, not stored — nothing else in the schema knows about seasons, and a
stored column would need backfilling and would drift from the event it describes.

## Data model (Prisma)

```prisma
// One roster player's line in one match, resolved from a confirmed
// ScoresheetExtraction. Its own table rather than a JSON field on the
// extraction because it is the only place the sheet's jersey numbers have
// been joined to real TeamPlayer rows — a typed, queryable projection of
// parsedData, which itself stays the verbatim read and is never rewritten by
// this flow. Rewritten wholesale (deleteMany + createMany in one
// transaction) each time the extraction is re-confirmed, so a corrected
// mapping never leaves stale rows behind.
//
// Every stat is nullable on the points-parsing spec's zero-vs-unknown rule:
// an unread column must not report a squad as having scored nothing. A null
// contributes to neither side of an average.
model MatchPlayerStat {
  id               String     @id @default(uuid())
  eventId          String
  teamPlayerId     String
  // The jersey number this row was read under, kept for traceability back
  // to the sheet — the same player can wear a different number next match.
  jerseyNumber     Int?
  points           Int?
  fouls            Int?
  // points split by play value; these three sum to `points` when all are
  // known. Stored as counts, not percentages (see the spec's
  // "Repartition, not accuracy").
  freeThrowPoints  Int?
  twoPointPoints   Int?
  threePointPoints Int?
  createdAt        DateTime   @default(now())
  event            Event      @relation(fields: [eventId], references: [id], onDelete: Cascade)
  teamPlayer       TeamPlayer @relation(fields: [teamPlayerId], references: [id], onDelete: Cascade)

  @@unique([eventId, teamPlayerId])
  @@index([teamPlayerId])
}
```

`Event` gains `playerStats MatchPlayerStat[]`, `TeamPlayer` gains `matchStats MatchPlayerStat[]`.
Both cascades follow the module's existing convention (`EventRsvp`, `EventConvocation`): deleting an
event or a roster entry takes its stat rows with it, no manual cleanup.

No migration backfills anything — see Scope.

## Service logic

### `ScoresheetsService.confirmExtraction` (extended)

`ConfirmScoresheetExtractionRequest` gains `rosterMapping: { jerseyNumber: number; teamPlayerId: string }[]`.
After the existing `parsedData`/status write, in the **same transaction**:

1. Resolve our side: `event.venue === 'HOME' ? 'home' : 'away'`; 400 if `venue` is null.
2. Validate every `teamPlayerId` is a `TeamPlayer` on this event's own team (400 otherwise — same
   check shape as `setEventConvocations`), and that no `teamPlayerId` and no `jerseyNumber` appears
   twice (400: one row per player per match, and a number identifies one person on the sheet).
3. `deleteMany({ eventId })`, then `createMany` one row per mapped jersey number, folding
   `parsedData.scoringPlays` filtered to our side into the three point buckets and reading `fouls`
   off the matching `ScoresheetPlayerStats` row.
4. Jersey numbers present on the sheet but absent from the mapping are skipped silently; mapped
   numbers absent from the sheet write a row with all-null stats (the manager is asserting the
   player was on the sheet, and GP should count them).

An empty `rosterMapping` is legal and clears the match's stats — the escape hatch for a sheet whose
own-side column was unreadable.

`GET .../scoresheet-extraction` gains `suggestedRosterMapping: { jerseyNumber, teamPlayerId | null, sheetName | null }[]`,
computed on read from our side's `ScoresheetPlayerStats` rows: normalize the sheet's name (strip
accents, casefold, drop punctuation) and match against roster surnames; a unique surname hit wins,
anything ambiguous returns `teamPlayerId: null` for the manager to resolve. It is a suggestion —
the server never persists it without a confirm carrying it back.

### `TeamStatsService.getTeamSeasonStats(clubId, teamId, seasonYear)`

New module `server/src/team-stats`, querying `PrismaService` directly rather than injecting
`TeamsService`/`EventsService` — the same cross-module convention as Events and Dashboard. Its own
module rather than a route on `TeamsService` because it owns a distinct read model (aggregation over
two unrelated tables) and would otherwise push `TeamsService` past what one service should hold.

1. `assertTeamInClub(clubId, teamId)` — the same defense-in-depth re-verification every module in
   this codebase does before touching a team.
2. Resolve the season window from `seasonYear` (default: the season containing "now").
3. Three queries, bounded regardless of match count:
   - the team's full roster (`TeamPlayer` + `Player`, so a player with no data still gets a row);
   - `MatchPlayerStat` joined to its `Event`, filtered to this team and window;
   - `EventVote` grouped by `votedTeamPlayerId` and `category` over the same window's events.
4. Fold in memory: GP is the count of stat rows; PPG/FPG are means over non-null values only;
   season highs are maxima over non-null values; the repartition is the season's bucket totals over
   the season's total points. Sort descending by PPG, nulls last, then by surname.

`matchesPlayed` on the response is the count of **matches with confirmed stats** in the window, so
the UI can say "sur N matchs analysés" and make the "only processed games count" rule visible rather
than leaving a coach to wonder why a match is missing.

## API surface

| Method | Route                               | Guard                         | Returns           |
| ------ | ----------------------------------- | ----------------------------- | ----------------- |
| GET    | `clubs/:clubId/teams/:teamId/stats` | `ClubRoles('ADMIN','MEMBER')` | `TeamSeasonStats` |

Query params: `season?: number` (the starting year; defaults to the current season).

Read access matches the events/RSVP roster endpoints — anyone who can see the team's events can see
its stats. No new write route: the only writer is the existing confirm endpoint.

## Shared types (`packages/@basketeasy/types/team-stats.ts`)

New file plus a `"./team-stats"` entry in the package's `exports`, per the no-barrel convention.

```ts
export interface TeamSeasonPlayerStats {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
  role: TeamMemberRole;
  /** Matches this player has a confirmed stat row for. */
  gamesPlayed: number;
  /** Null when no match contributed a known value. */
  pointsPerGame: number | null;
  foulsPerGame: number | null;
  seasonHighPoints: number | null;
  seasonHighFouls: number | null;
  /** Season totals per play value; the screen renders them as shares. */
  freeThrowPoints: number;
  twoPointPoints: number;
  threePointPoints: number;
  totalPoints: number;
  mvpAwards: number;
  worstPlayerAwards: number;
}

export interface TeamSeasonStats {
  /** The year the season starts: 2026 means "saison 2026-2027". */
  seasonYear: number;
  seasonStart: string;
  seasonEnd: string;
  /** Matches in the window with confirmed stats — the screen's denominator. */
  matchesPlayed: number;
  /** Seasons that actually have data, for the selector. Newest first. */
  availableSeasons: number[];
  players: TeamSeasonPlayerStats[];
}
```

`ConfirmScoresheetExtractionRequest` gains `rosterMapping`; `ScoresheetExtraction` gains
`suggestedRosterMapping`. Types change first, then the Nest DTO, then the callers — per `CLAUDE.md`.

## Frontend

- **`TeamDetailPage`** gains a fifth tab, `Statistiques` (`?tab=stats`), between Effectif and
  Événements. Rendered only when the team has at least one match — an empty tab on a team that has
  never played is noise, and the tab list is already four wide on mobile.
- **`TeamSeasonStatsTab`** (`app/src/clubs/`) owns the query. Branches `error → loading → empty →
data`, in that order, per `CLAUDE.md` — a failed fetch must not render as "no stats yet".
- The table is a `ResponsiveTable` with a `useTableLayout()` branch inside one `TeamStatsRow`
  component, not a row/card pair. Numeric cells carry `.tabular`.
- **`PointsRepartitionBar`** is a new `@basketeasy/ui` primitive (`./points-repartition-bar`): a
  stacked bar taking three counts and rendering three segments with an accessible label. Its colours
  are its own — three tones from the preset, chosen so the 3PT segment reads as the notable one —
  never passed in by a caller, per the closed-prop-API rule. If the three tones it needs aren't in
  `tailwind-preset.cjs`, they get added and **named** there first.
- Award counts render as `Badge` with the existing tones; the 🏆/🛡️ glyphs from issue #78 sit
  inside the badge label. No new colour at a call site.
- A season `SelectField` sits above the table, inline (single-field, low-risk, high-frequency — not
  a dialog, per the modals-vs-inline rule).
- **`ScoresheetExtractionCard`** gains the mapping step: each of our side's jersey numbers gets a row
  showing the sheet's number and name next to a roster `SelectField` pre-set to the server's
  suggestion, with an explicit "Non attribué" option. The confirm button sends the mapping. Failure
  is a `toast()` (the card may have scrolled), field-level problems are inline `FieldError`.
- Copy is French-first: `Statistiques`, `Matchs joués`, `Points/match`, `Fautes/match`,
  `Meilleur total`, `Répartition des points`, `Distinctions`.

## Testing

- `ScoresheetsService`: mapping validation (foreign `teamPlayerId`, duplicate player, duplicate
  jersey), correct side chosen from `venue`, re-confirm replaces rather than appends, empty mapping
  clears, null `venue` 400s, the three point buckets fold correctly from `scoringPlays`.
- Suggestion matching: exact surname, accented/casefolded surname, ambiguous surname → null.
- `TeamStatsService`: season window boundaries (31 August vs. 1 September), nulls excluded from both
  sides of an average, season highs over nulls, roster members with no data present with zeros,
  awards counted without a scoresheet, `voterTeamPlayerId` never selected.
- Frontend: `TeamSeasonStatsTab` error/loading/empty/data branches, season switching, the tab hidden
  for a team with no matches, `PointsRepartitionBar` with a zero total and with one non-zero bucket.
- A screenshot of the Statistiques tab against a mock API, per `CLAUDE.md`'s screenshot rule.
