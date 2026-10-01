# Scoresheets and stats

Rules live in `CLAUDE.md` (« Scoresheets module », « Team stats module »). This is the reasoning,
plus the one piece of infrastructure that needs a human to set up.

## Reading an e-Marque sheet

- **Points are never read, they are summed.** The left half of the sheet (licence, name, jersey,
  five-cell fouls grid) has no points column. Points live in the right half, the MARQUE COURANTE:
  pre-printed cumulative totals 1–120 in A/B columns; the marker strikes the total reached and
  writes the scorer's jersey number beside it.

  | Notation                               | Points         |
  | -------------------------------------- | -------------- |
  | jersey number inside a circle          | 3              |
  | jersey number written plainly          | 2              |
  | plain number, struck box carries a dot | 1 (free throw) |

  The model reports one `scoringPlay` per struck box; the server sums them per player and overwrites
  whatever the model put in `points`. A total from a model holding 80 marks in its head is a guess;
  a sum over reported plays is arithmetic, and the « plays sum to the final score » check makes a
  bad read visible.

- **Fouls are read** off the roster grid, not derived.
- **Zero versus unknown.** A rostered player with no play scored 0 only if at least one play was
  read for their team; an unreadable column leaves the whole squad at null. The rule carries into
  every average (a null is in neither numerator nor denominator) and every screen (`—`, never `0`).
- Équipe A is the receiving team, so the sheet's sides are named `home`/`away`, the vocabulary the
  rest of the code already uses. A jersey number is unique only within a side, so every join uses
  `(team, jerseyNumber)`.
- Overtime periods are extra `quarterScores` entries, so the quarter-sum check holds.
- `scoringPlays` (40–80 per game) is left out of the confidence metric so one column doesn't swamp
  it; legibility still reaches the metric through the derived player points.
- Inconsistent arithmetic flips the sheet to `NEEDS_REVIEW` instead of failing the job. A
  confirming manager's corrections are trusted as ground truth.

## Who scored: the confirm-time join

Three ways to tie a jersey number to a `TeamPlayer` were weighed:

1. a `jerseyNumber` column on `TeamPlayer`: wrong, clubs share jersey sets between teams, so the
   number changes between matches and points would be silently misattributed;
2. name matching at read time: redoes fuzzy handwriting matching on every request and can't be
   corrected once wrong;
3. **resolve once, at confirm, into typed `MatchPlayerStat` rows**: chosen. Confirm is the one
   moment a person looks at the sheet and the roster together.

The server pre-suggests a mapping by normalised surname (accents stripped, case folded,
punctuation dropped); a surname shared by two roster members suggests nothing. An unmapped number
is allowed (a licensed guest), an empty mapping clears the match's stats, duplicates are a 400.
A mapped number the running score never mentions scored 0. Rows are replaced wholesale on
re-confirm; sheets confirmed before the mapping existed have no rows until re-confirmed.

## Season stats

- A season runs 1 September to 31 August and is named by its starting year (« saison 2026-2027 »
  = 2026), derived from `Event.startsAt`, never stored.
- The 3/2/1-point split is a **repartition of points scored**, rendered as one stacked bar and
  labelled « Répartition des points » / « par type de panier », never as a shooting percentage: the
  sheet records makes and no attempts. Counts are stored, not percentages (a share of a
  sum of sums is not the mean of per-match shares).
- **No minutes, no MPG**, though issue #78 asked: the paper sheet has no minutes and nothing else
  tracks playing time. Approximating from quarter marks would put an invented number in a column
  coaches read as measured. Blocked on P1 fair playing-time tracking.
- Awards come from `EventVote`, so a match with no scoresheet still counts its MVP; the voter is
  never selected.
- `matchesPlayed` is the number of matches with confirmed stats, shown as « sur N matchs analysés »
  so a coach sees why a match is missing. The tab is hidden for a team that has never played.
- One match's lines (`GET .../stats/matches/:eventId`) load only when « Après la rencontre » opens.

## Storage: Cloudflare R2

- Chosen over S3/Scaleway for **zero egress** (a sheet is re-read on every retry and by OCR), same
  S3 API (`@aws-sdk/client-s3`, `region: 'auto'`).
- **The bucket must be created with the EU jurisdiction**: these photos are minors' data, and R2
  is not EU-resident by default. The jurisdiction can't be changed later. The endpoint is
  `https://<R2_ACCOUNT_ID>.eu.r2.cloudflarestorage.com` (no `.eu.` for a non-restricted bucket).
- The browser uploads straight to R2 with a presigned PUT; the API never carries the bytes. Keys
  are `scoresheets/<eventId>/<uuid>.<ext>`, content types limited to JPEG, PNG, WebP and PDF.

### Manual setup (a human with the Cloudflare account; an agent can't do it)

1. Enable R2 (needs a payment method even on the free tier).
2. Create the bucket (e.g. `basketeasy-scoresheets-prod`) with jurisdiction **European Union**.
3. Bucket CORS: `AllowedMethods: ["PUT"]`, `AllowedHeaders: ["content-type"]`, `AllowedOrigins`:
   the deployed frontend plus `http://localhost:5173`. Without it the presigned URL works from
   `curl` and fails silently from the browser.
4. Create an R2 API token (R2 → Manage API Tokens, not a general Cloudflare token) with Object
   Read & Write on that bucket only.
5. Hand over `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` to the
   environment's secrets. Never commit them; `.env.example` holds names only. Dev and prod may share
   the bucket under distinct key prefixes.

## Open

- The vision provider (`GeminiClient` behind `SCORESHEET_VISION_CLIENT`) was never put through the
  accuracy bake-off `docs/backend-stack.md` asks for.
