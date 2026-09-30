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

## Extracting the venue

The detail page's field names are **unverified** — this sandbox's network
policy blocks egress to `competitions.ffbb.com` (403 on CONNECT), so, as
with the original page-scrape work, extraction is written against fixtures
built from FFBB's documented/observed vocabulary rather than a live fetch,
and is written to recognize several plausible spellings rather than betting
on one:

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
  name, street, then `codePostal ville` — skipping any part that's absent
  and collapsing whitespace. A name-only page yields just the name; a
  street-only page yields just the street.
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

1. **The detail page's real field names are unconfirmed** (network-blocked
   sandbox, as above). The multi-spelling scan is a hedge, not a
   substitute for one live fetch at deploy time — if it comes back empty,
   this is one file and one function to correct.

   **First real-world result (2026-09-01): every import came back with a
   location of just "Salle".** The page ships its UI labels in the same
   payload as its data (`"salle": "Salle"`), and a label under a venue key
   reads exactly like a venue name, so the scan locked onto the label.
   Fixed by rejecting any value that is nothing but the field's own
   category word (`GENERIC_VENUE_WORDS`) — a label can no longer be
   imported as an address.

   **Resolved the same day, against a live page.** A dump of
   `.../competitions/dm3/match/200000014580569` settled both remaining
   branches: the venue **is** server-rendered in the RSC payload, and it is
   published as a typed label/value group, not as a venue-shaped record —
   which is exactly why a scan looking for `adresse`/`ville`-style keys
   found nothing but the i18n dictionary:

   ```json
   {"informations":[{"type":"salle","informations":[
      {"type":"text","label":"Nom","value":"GYMNASE DE LA CHESNAIE"},
      {"type":"address","label":"Adresse","value":…}]}]}
   ```

   That group is now read first (`extractVenueFromInformationGroups`),
   matched on the group's `type` so a `correspondant` group's postal
   address can't stand in for the gym; the key-sniffing scan stays as the
   fallback for any other page shape. The dump also showed the page's own
   field vocabulary is English (`address`, `room`, `city`), so the key
   lists carry those spellings too. Still unconfirmed: whether the address
   item's `value` is always a plain string — it is on the sampled page, and
   an object is handled as well.

   **Second real-world result (2026-09-30): every detail page answered 403.**
   The fixture-list load went through, then four parallel detail-page loads
   were all refused by FFBB's CDN. Detail pages are now loaded one at a
   time, as a navigation from the fixture list (its URL as `Referer`, plus
   a browser's `Accept`/`Sec-Fetch-*` headers), and the first 403/429 stops
   the remaining lookups for that import. The refusal is logged with the
   CDN's `server`/`cf-mitigated` headers. If the 403s persist, those
   headers say whether it is a bot challenge no header set will pass.

2. **Whether the venue is published as far ahead as the fixture list.** The
   parent spec's one detail-page check (~3 weeks out) found no venue, which
   may mean "not yet set" rather than "not on this page." If venues only
   firm up near matchday, the import's re-run is what fills them in — which
   already works, since a changed `location` counts as an `updated` row.
3. **Whether `location` should stop being overwritten** once a coach edits
   it by hand. Out of scope here (see Scope); worth revisiting the first
   time a real coach loses an edit to a re-sync.
