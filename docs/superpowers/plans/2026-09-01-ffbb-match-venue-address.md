# FFBB Match Venue Address Implementation Plan

**Goal:** Imported FFBB matches carry the real gym address instead of
`'Lieu non communiqué'`, by following each fixture row's detail-page link
(`.../competitions/<code>/match/<id>`) during an import.

**Architecture:** Entirely inside the FFBB adapter boundary. Only
`ffbb-page-scrape.provider.ts` learns anything new about FFBB's pages;
`ffbb-provider.ts` gains one options argument (`resolveVenues`, default
off) so link validation keeps costing exactly one fetch; `FfbbImportService`
turns the option on. No Prisma migration, no shared-type change, no
frontend change — `FfbbMatch.location` is an existing field that was
always `null` and now sometimes isn't.

**Spec:** [docs/superpowers/specs/2026-09-01-ffbb-match-venue-address-design.md](../specs/2026-09-01-ffbb-match-venue-address-design.md)

## Global Constraints

- Venue resolution is **best-effort**: no detail-page failure (network,
  404, unrecognized shape, timeout) may fail an import. It degrades to
  `location: null` for that one match.
- Detail URLs are **read off the page**, never composed from guessed
  segments (prefix reuse counts as reading — the prefix comes from the
  page).
- Bounds live in the provider: skip `played` matches, concurrency 4,
  10s per-request timeout, `MAX_VENUE_LOOKUPS = 60` per engagement.
- All FFBB-shape knowledge stays in `ffbb-page-scrape.provider.ts` (the
  parent spec's one-file rule).
- `getMatchesForEngagement`'s default behaviour is unchanged — one fetch,
  `location: null` — so `TeamsService` needs no edit.

---

## File Structure

**Server:**

- Modify `server/src/ffbb/ffbb-provider.ts` — add `GetMatchesOptions`,
  widen `getMatchesForEngagement`'s signature, document `location`'s new
  provenance.
- Modify `server/src/ffbb/ffbb-page-scrape.provider.ts` — detail-URL
  resolution, venue extraction/formatting, bounded concurrent fetching,
  request timeouts.
- Modify `server/src/ffbb/ffbb-import.service.ts` — pass
  `{ resolveVenues: true }`.
- Modify `server/src/ffbb/ffbb-page-scrape.provider.spec.ts` — new cases
  per the spec's Testing section.
- Modify `server/src/ffbb/ffbb-import.service.spec.ts` — option passthrough
  - venue persisted to `Event.location`.

**Docs:**

- Create the spec + this plan.
- Modify `docs/superpowers/specs/2026-08-26-ffbb-calendar-import-design.md`
  — mark its open question 4 (venue) resolved, pointing here.

---

## Task 1 — Interface: `resolveVenues` option

- [x] `ffbb-provider.ts`: add `GetMatchesOptions { resolveVenues?: boolean }`;
      `getMatchesForEngagement(ref, options?)`.
- [x] Update `FfbbMatch.location`'s doc comment: no longer "usually null",
      now "the venue read from the match's FFBB detail page; null when
      unresolvable or when `resolveVenues` is off."

## Task 2 — Detail-URL resolution

- [x] `MATCH_DETAIL_PATH_PATTERN` = `ligues/<x>/comites/<y>/competitions/<z>/match/<id>`,
      matched with a global scan over the decoded chunks.
- [x] `buildDetailPathIndex(chunks)` → `Map<matchId, path>` (tier 2) and the
      first-seen prefix (tier 3).
- [x] `resolveDetailPath(raw, matchId, index)`: per-match serialize-and-scan
      (tier 1) → index lookup (tier 2) → prefix + id (tier 3) → `null`.

## Task 3 — Venue extraction

- [x] `extractVenue(chunks)`: find JSON objects containing a venue-ish key,
      parse them out of the chunk text (balanced-brace forward parse from
      candidate `{` positions, bounded attempts), prefer one reached under
      a `/salle|gymnase|lieu/i` key.
- [x] `formatVenue(obj)`: `name, street, codePostal ville`, absent parts
      skipped, whitespace collapsed, `null` when nothing usable.
- [x] `venueFromRawMatch(raw)`: same formatter applied to a venue-shaped
      object already present on the fixture row (short-circuit).

## Task 4 — Bounded fetching

- [x] `fetchPage` gains `AbortSignal.timeout(FETCH_TIMEOUT_MS)`.
- [x] `resolveVenues(matches, rawMatches, chunks)`: skip `played`, cap at
      `MAX_VENUE_LOOKUPS`, run with concurrency `VENUE_FETCH_CONCURRENCY`,
      swallow per-match failures.
- [x] Wire into `getMatchesForEngagement` behind `options.resolveVenues`.

## Task 5 — Import service

- [x] Pass `{ resolveVenues: true }` from `importSchedule`.

## Task 6 — Tests

- [x] Provider spec: every case in the spec's Testing section.
- [x] Import spec: option passthrough, venue → `Event.location` on create
      and update, null → `'Lieu non communiqué'`.

## Task 7 — Verify & land

- [x] `pnpm --filter @basketeasy/server test -- src/ffbb`
- [x] `pnpm exec prettier --check` + eslint on the touched files.
- [x] Parent spec's open question 4 marked resolved.
- [x] Commit on `claude/game-import-address-scraping-1z5ynl`, push, open PR.

---

## Review round (before landing)

A `/code-review` pass over the implemented diff found six defects, all
fixed and each now covered by a test that fails without the fix:

1. A venue object inside an array (`"organismes":[{…}]`) reached the walk
   with no parent key and slipped past the club/opponent exclusion — a
   club's mailing address imported as the gym.
2. Home and away venues scored identically, so the tie went to
   serialization order — the opponent's gym imported as the venue.
3. A transient detail-page failure on a re-sync overwrote an
   already-resolved address with the placeholder (and counted it
   `updated`).
4. `Event.location` is written through Prisma, bypassing the DTO's
   `@MaxLength(120)`: a long address imported fine, then made the event
   uneditable because `EventEditModal` re-sends `location`.
5. The `MAX_VENUE_LOOKUPS` guard `break`ed the loop, so matches past the
   cap also lost the free row-carried venue check.
6. No overall deadline: worst-case venue resolution could outlive a
   reverse proxy's read timeout and show a 504 for a successful import.

## Not doing (and why)

- **Structured venue columns + map link.** Real value, separate change:
  it needs a migration, `TeamEvent`/DTO changes and UI work with
  screenshots. This change is scoped to "the address stops being missing."
- **Composing detail URLs from the engagement ref.** The competition
  segment isn't derivable from it, and the parent spec forbids
  reconstructing FFBB path segments.
- **Caching venues across imports.** A re-sync re-fetches; at ≤60 pages
  behind a manual button, a cache is unbacked complexity.
