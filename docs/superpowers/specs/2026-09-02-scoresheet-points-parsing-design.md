# Scoresheet Points Parsing

Status: draft (loop 0)
Date: 2026-09-02

## Why

The scoresheet OCR pipeline (`server/src/scoresheets`) reads a photo of an FFBB e-Marque sheet and
returns a `ParsedScoresheetData` box score. Everything in it lands correctly except **points**: the
model was asked for "each listed player's … points scored" without being told where points live, so
it read the left-hand roster block — which has a licence number, a name, a jersey number and a
five-cell fouls grid, and no points column at all — and returned nulls or invented totals.

Points exist only on the right-hand half of the sheet, in the **MARQUE COURANTE** (running score):
a grid of pre-printed cumulative totals from 1 to 120 in paired A/B columns. When a team scores,
the marker strikes the total that team has just reached and writes the **scorer's jersey number**
next to it. The value of the basket is carried by the notation around that number:

| Notation on the sheet                                         | Points         |
| ------------------------------------------------------------- | -------------- |
| Jersey number drawn inside a circle                           | 3              |
| Jersey number written plainly                                 | 2              |
| Jersey number written plainly, struck box carries a dot/point | 1 (free throw) |

So a player's total is not a number to be read anywhere — it is a sum over the running-score
column, and the number written beside a box is an identity (a jersey number), not a score.

## Scope

**In scope:**

- The vision prompt names both halves of the sheet, states that the roster block carries no points,
  and spells out the three notations above.
- `ParsedScoresheetData` gains `scoringPlays: ScoresheetScoringPlay[]` — one entry per struck box
  (`team`, `jerseyNumber`, `points`, `runningScore`), in sheet order.
- `ScoresheetPlayerStats` gains `team: ScoresheetTeamSide | null`. A jersey number is unique only
  within a team (both squads can field a number 7), so the roster block and the running-score
  column can only be joined on the pair.
- `ScoresheetOcrProcessor` **derives** each player's `points` by summing their own plays, and
  overwrites whatever the model put in `points` with the derived value. The prompt tells the model
  to leave `points` null for exactly this reason.
- Two consistency checks on top of the existing quarter-sum one: a play must be worth 1, 2 or 3,
  and a team's plays must add up to that team's final score. Either failing flips the sheet to
  `NEEDS_REVIEW` rather than failing the job, as before.
- The prompt asks for each overtime period ("Prolongations") as an extra `quarterScores` entry, so
  the existing quarter-sum check stops flagging every overtime game as inconsistent.

**Out of scope (deferred, don't build speculatively):**

- **Any UI for the parsed box score.** `MatchScoresheetTab` still stops at "file queued for
  analysis" — nothing renders `parsedData` yet, so nothing renders scoring plays either. The
  play-by-play is stored because it is the evidence behind each player's total, and a reviewer
  correcting a wrong total will need it; the review screen is its own task.
- **Matching a scoresheet jersey number to a `TeamPlayer`.** The extraction stays a standalone read
  of the sheet, not a write into roster/stats tables.
- **Period attribution per play.** The sheet does mark period boundaries in the running score, but
  nothing needs per-quarter player points yet.

## Decisions

**Derived, not read.** The model reports plays; the server sums them. A per-player total from a
model that has to hold ~80 marks in its head is a guess; a sum over the plays it actually reported
is arithmetic, and the sum-vs-final-score check makes a bad read visible instead of plausible.

**Zero versus unknown.** A rostered player with no matching play scored 0 — but only once at least
one play was read for _their_ team. If that team's column came back empty, their points stay null:
an unreadable column must not report a whole squad as having scored nothing.

**`scoringPlays` is left out of `computeConfidence`.** A full game is 40–80 plays of three fields
each; counting them would swamp every other field and turn the confidence heuristic into a measure
of one column. The column's legibility already reaches the metric through the derived player
points, which are counted.

**`home`/`away`, not `A`/`B`.** The sheet's Équipe A is the receiving team and Équipe B the
visitor, so the existing `homeScore`/`awayScore` pairing already names both sides; a second
vocabulary for the same two teams would only need translating at every join.
