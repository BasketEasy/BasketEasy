# FFBB match venue address

Status: draft (loop 1)
Date: 2026-09-01

Extends [`2026-08-26-ffbb-calendar-import-design.md`](./2026-08-26-ffbb-calendar-import-design.md),
whose open question 4 ("venue (`salle`) field location, unresolved") this
spec closes: the venue **is** published by FFBB, just not on the page the
importer currently reads.

## Why

Every `Event` the FFBB import creates today lands with
`location: 'Lieu non communiqué'` — `FfbbPageScrapeProvider` always returns
`location: null`, because the team's fixture-list page carries no venue
field. So a coach who imports the official calendar still has to open
FFBB's site, find each match, and retype the gym into BasketEasy by hand —
exactly the retyping the import exists to remove, and the one field that
actually matters on matchday for an away game.

The address does exist. Each row of the fixture list has a score column
that links to a **per-match detail page**, e.g.

```
https://competitions.ffbb.com/ligues/pdl/comites/0044/competitions/dm3/match/200000014580569
```

and the venue (salle + street + postcode + commune) is part of that page.
This spec is one change: while importing, follow that link per match and
fill `FfbbMatch.location` from it.

## Scope

**In scope:**

- Resolving each listed match's detail-page URL from the fixture-list page
  itself (never by composing a URL out of parts we'd have to guess).
- Fetching that page and extracting the venue into a single human-readable
  French address string, stored in the existing `Event.location`.
- Doing this **only during an import**, not during link validation — see
  "One provider, two costs" below.
- Failing soft, per match: a detail page that 404s, times out, or whose
  shape we don't recognize leaves that one match at `location: null`
  (`'Lieu non communiqué'`, exactly today's behaviour) and the import
  completes normally.

**Out of scope (deliberately):**

- **No schema change.** `Event.location` is already a string and already
  rendered everywhere the venue belongs (`EventRow`, `EventDetailPage`,
  `AgendaEventCard`). Structured venue columns (`venueName`,
  `venueStreet`, `venuePostalCode`, `venueCity`) plus a "voir sur la carte"
  affordance are a real product idea, but they're a separate change with
  their own UI surface — this one is "the address stops being missing."
- **No shared-type change, no frontend change, no migration.** Nothing
  downstream of `FfbbProvider` learns a new concept; an imported event just
  stops saying "Lieu non communiqué."
- **No geocoding, no map links, no venue deduplication** into a `Venue`
  entity shared across events.
  **Two things the import does with a resolved address, both in
  `FfbbImportService` rather than the provider — they're facts about our
  schema, not about FFBB's pages:**

- **A null never overwrites an address already imported.** Venue resolution
  is best-effort, so one flaky re-sync (a timed-out detail page) would
  otherwise wipe every venue back to `'Lieu non communiqué'` and report it
  as an `updated` row.
- **An address longer than 120 characters is clamped.** The import writes
  through Prisma directly, bypassing the `@MaxLength(120)` on
  `Create/UpdateEventDto` — an over-long venue would import fine and then
  make the event uneditable, since `EventEditModal` re-sends `location` on
  every save.

- **Not protecting a manually-edited `location` from being overwritten on
  re-sync.** Unchanged from the import's existing behaviour (`notes` is the
  one field a re-sync never touches); making `location` sticky would be a
  change to the import's contract, not to this feature.

## How the detail page is reached

The importer must never _compose_ a detail URL. The path carries a
competition code (`dm3` in the example above) that appears nowhere in a
stored `TeamFfbbLink.ffbbEngagementRef`
(`ligues/pdl/comites/0044/clubs/pdl0044190/equipes/<id>`), and the
research in the parent spec is explicit that FFBB path segments are opaque
values, never reconstructed. So the URL is **read off the page we already
fetched**, in three tiers, first hit wins:

1. **Per-match.** The raw match object from the fixture list is
   re-serialized and scanned for a `.../competitions/<code>/match/<id>`
   path whose `<id>` is that match's own id.
2. **Whole page.** The same scan across every decoded
   `self.__next_f.push(...)` chunk, building a `matchId → path` map — the
   score column is a Next `<Link>`, so its `href` is serialized into the
   RSC payload for every row.
3. **Prefix reuse.** If tiers 1–2 found a path for _some_ match but not
   this one, its `ligues/<x>/comites/<y>/competitions/<z>/match/` prefix is
   reused with this match's own id. The match id is the addressing key in
   that URL, so a stale competition segment either still resolves or 404s —
   and a 404 is already a handled, non-fatal outcome.

No tier hits ⇒ `location: null`. That is a normal result, not an error.

## Verified structure

The field names this design originally shipped as guesses are now
**confirmed**. `competitions.ffbb.com` is still unreachable from the build
sandbox (403 on CONNECT, and the same for the Anthropic fetch service), so
the confirmation comes from FFBB's own published response shapes instead:
the `ffbb-api-client-v2` and `ffbb-data-client` packages on PyPI are
generated against live `api.ffbb.app` responses — the same backend the
`competitions.ffbb.com` front end reads — and both model a rencontre's
venue identically.

A rencontre carries its venue as **`salle`**:

```jsonc
"salle": {
  "id": "2ba4e0a1-…",
  "numero": "044115001",
  "libelle": "SALLE DE LA HERDRIE",   // the gym's name
  "libelle2": "",
  "adresse": "12 RUE DES SPORTS",     // street line
  "adresseComplement": "Complexe sportif de la Herdrie",
  "commune": { "codePostal": "44115", "libelle": "BASSE-GOULAINE" },
  "cartographie": { "latitude": 47.2081, "longitude": -1.4498 }
}
```

Three things this settles:

1. **The venue's name is a bare `libelle`, under the key `salle`** — not
   `nomSalle`/`libelleSalle`. The hedge held: `libelle` is trusted exactly
   when the object was reached under a `/salle|gymnase|lieu|equipement/i`
   key, which is the real shape. `adresse` was likewise already covered.
2. **The locality is nested, and was being dropped.** `codePostal` and the
   city are one level below the venue, in `commune` — the extractor read
   both as flat keys, so against the real payload it produced
   `«SALLE DE LA HERDRIE, 12 RUE DES SPORTS»` and silently lost
   `44115 BASSE-GOULAINE`. A street with no city is not enough to navigate
   to a gym, so locality is now read flat first, then through `commune`
   (where a bare `libelle` _is_ the city) and `cartographie`. Covered by a
   test built field-for-field from the shape above.
3. **The fixture list genuinely has no venue.** FFBB's own fixture-list
   item model (`PouleRencontreItemModel`: `id`, `numero`, `numeroJournee`,
   `idPoule`, `competitionId`, `resultatEquipe1/2`, `joue`, `nomEquipe1/2`,
   `date_rencontre`) carries no `salle` at all, which confirms the premise
   this whole design rests on — the detail-page fetch is not avoidable.

`adresseComplement` is deliberately **not** appended: it is as often a
restatement of the gym's name as it is a usable complement, and every
character competes with the 120-char clamp `Create/UpdateEventDto` accepts
back. Revisit if real imports come back ambiguous.

Sources: [`ffbb-api-client-v2`](https://pypi.org/project/ffbb-api-client-v2/)
(`models/salle.py`, `models/rencontres_hit.py`,
`models/get_competition_response.py`, `models/poule_rencontre_item_model.py`)
and [`ffbb-data-client`](https://pypi.org/project/ffbb-data-client/).

## Extracting the venue

Extraction still recognizes several spellings rather than betting on one —
the shape above is verified, but nothing about it is contractual, and the
same venue appears elsewhere in FFBB's payloads under a `cartographie`
carrying `adresse`/`codePostal`/`ville`:

- The RSC chunks are scanned for JSON objects that look like a venue: an
  object carrying a street-ish key (`adresse`, `adresse1`, `rue`,
  `libelleVoie`) together with a locality-ish key (`ville`, `commune`,
  `libelleCommune`, `codePostal`, `cp`). An object reached under a key
  matching `/salle|gymnase|lieu/i` is preferred over one found loose, so a
  club's or an opponent's postal address can't be mistaken for the gym.
- **The home side's gym wins.** A match is played at the receiving team's
  venue, so a candidate under a `recevant`/`domicile`-ish ancestor outranks
  one under a `visiteur`/`exterieur`-ish ancestor. Without this the tie
  between two venues on one page is broken by serialization order, which
  sends half the teams to their opponent's gym.
- **An array element is walked from its array's key, not keylessly.** A
  venue object found by the text scan inside `"organismes":[{…}]` has no
  key of its own; taking it as-is would let a club's mailing address past
  the exclusion above, so the scan keeps expanding outward until it finds
  an object whose key is known.
- The parts found are formatted into one string,
  `«Salle de la Herdrie, 12 rue des Sports, 44115 Basse-Goulaine»` —
  name, street, then `codePostal ville`, the last two read out of the
  nested `commune`/`cartographie` when they aren't flat — skipping any
  part that's absent and collapsing whitespace. A name-only page yields
  just the name; a street-only page yields just the street.
- **The fixture list is checked first.** If a match row already carries a
  venue-shaped object (FFBB may start publishing one there; the parent
  spec's sample was truncated), it's used and the detail page is never
  fetched for that match.

Anything unrecognized returns `null` — the import must never write a
half-parsed address, and per the parent spec's boundary rule, all of this
knowledge lives in `ffbb-page-scrape.provider.ts` and nowhere else.

## One provider, two costs

`getMatchesForEngagement` has two callers with opposite cost profiles:

| Caller                             | What it needs                      | Detail fetches |
| ---------------------------------- | ---------------------------------- | -------------- |
| `TeamsService.validateFfbbLink`    | "does this URL resolve?" + a label | none           |
| `FfbbImportService.importSchedule` | every match, with venues           | up to N        |

Making link validation pay for N extra page loads would turn a "paste a
URL" form into a multi-second wait for data it discards. So the interface
gains an options argument, defaulting to the cheap behaviour:

```typescript
export interface GetMatchesOptions {
  /** Follow each match's detail page to resolve its venue. Off by default: link validation only needs the page to resolve. */
  resolveVenues?: boolean;
}

getMatchesForEngagement(
  engagementRef: string,
  options?: GetMatchesOptions,
): Promise<FfbbEngagementFetchResult>;
```

`TeamsService` keeps calling it with one argument and is untouched.
`FfbbImportService` passes `{ resolveVenues: true }`. This is the intended
kind of change to the boundary: an option about _our_ cost, not a leak of
FFBB's page shape — `FfbbMatch` itself doesn't change at all.

## Bounds

N extra HTTP requests per import against a federation site with no
published rate limits or terms deserves explicit ceilings, all in the
provider:

- **Skip played matches.** `joue: true` matches are already skipped by
  `FfbbImportService.upsertMatch` on re-sync, so resolving their venue is
  pure waste.
- **Concurrency 4**, so a 30-match season is ~8 sequential round-trips, not
  30 — and never a 30-way burst at FFBB.
- **Per-request timeout, 10s** (`AbortSignal.timeout`), applied to the
  fixture-list fetch too: today a hung FFBB response would hang the import
  request until the client gives up.
- **`MAX_VENUE_LOOKUPS = 60` per engagement**, a runaway guard on the same
  footing as the existing `MAX_RECURRING_OCCURRENCES`. Matches past the cap
  keep `location: null` — but still get the free look at their own fixture
  row, which costs no request.
- **A 15s wall-clock budget per engagement.** A per-request timeout doesn't
  bound the total (60 slow pages, four at a time, is minutes), and an
  import that outlives the reverse proxy's read timeout shows the admin a
  504 for work that actually succeeded. Once spent, the remaining matches
  keep `location: null` and the import finishes normally.

## Testing

`FfbbPageScrapeProvider` (fixtures, `fetch` mocked — same approach as the
existing suite):

- Detail URL from a per-match field; from a page-wide `href` scan; via
  prefix reuse for a match whose own href is missing; none available ⇒ no
  detail fetch, `location: null`.
- Venue formatting: name + street + postcode + commune; partial data
  (name only, street only); alternative key spellings (`commune` vs.
  `ville`, `adresse1` vs. `rue`); a page with no venue-shaped object ⇒
  `null`.
- A club/opponent postal address elsewhere on the page is not mistaken for
  the gym when a `salle`-keyed object exists, including when it's published
  as an array element.
- Both teams' venues on one page ⇒ the home side's is chosen, whichever is
  serialized first.
- A match past the fetch cap still picks up a venue carried on its own row.
- Fail-soft: detail fetch rejects, returns 404, or returns unparseable
  HTML ⇒ that match's `location` is `null`, the other matches still carry
  theirs, and `getMatchesForEngagement` resolves rather than throwing.
- `resolveVenues` off (the default) ⇒ exactly one `fetch`, `location` null.
- `played: true` matches are never fetched.
- The venue on the fixture-list row itself short-circuits the detail fetch.

`FfbbImportService`: passes `{ resolveVenues: true }`; a resolved venue is
written to `Event.location` on create and on update; a null venue falls
back to `'Lieu non communiqué'` on create but leaves an already-imported
address alone on re-sync; an over-long address is clamped to 120
characters.

## Open questions

1. ~~**The detail page's real field names are unconfirmed.**~~ Resolved —
   see "Verified structure" above. What remains unconfirmed is narrower:
   whether the _page_ embeds the `salle` object in its RSC payload as the
   _API_ returns it. The scan is shape-driven rather than path-driven, so
   a differently-nested but same-named payload still resolves; a page that
   renders the venue only as pre-formatted HTML text would not, and that
   is the one case still needing a live fetch to rule out.
2. **Whether the venue is published as far ahead as the fixture list.** The
   parent spec's one detail-page check (~3 weeks out) found no venue, which
   may mean "not yet set" rather than "not on this page." If venues only
   firm up near matchday, the import's re-run is what fills them in — which
   already works, since a changed `location` counts as an `updated` row.
3. **Whether `location` should stop being overwritten** once a coach edits
   it by hand. Out of scope here (see Scope); worth revisiting the first
   time a real coach loses an edit to a re-sync.
