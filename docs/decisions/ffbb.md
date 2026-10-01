# FFBB integration

Kluvo is a companion to the federation's stack, so it reads what competitions.ffbb.com already
publishes instead of asking a coach to retype it. All FFBB knowledge lives behind one interface,
`FfbbProvider` (`server/src/ffbb/ffbb-provider.ts`), implemented by one file,
`ffbb-page-scrape.provider.ts`. When FFBB changes its site, that file changes and nothing else.

## What FFBB actually serves (verified, not assumed)

- **`api.ffbb.com` is a dead end.** It is a Directus API behind a Bunny CDN WAF. Browser-like
  `Referer`/`Origin`/`User-Agent` headers pass the WAF, and `GET /items/configuration` returns a
  public token (`key_dh`), but that token is scoped to configuration and assets: `organismes`,
  `rencontres` and `/collections` answer Directus's own 403. Third-party clients
  (`Fimeo/ffbb-api-ts`, `ffbb-api-client-v2`, `nickdesi/ffbb-data-client`) describe the same API
  and its Meilisearch search, whose token was never found either.
- **The team page is the data source.** `GET competitions.ffbb.com/ligues/<l>/comites/<c>/clubs/<club>/equipes/<id>`
  returns 200 with no auth, and the fixtures are server-rendered JSON inside the Next.js RSC
  chunks (`self.__next_f.push(...)`). The scraper extracts and `JSON.parse`s those objects; no HTML
  parser.
- **A bare engagement id does not resolve** (`/equipes/<id>` 404s, with or without a season
  prefix). Only the full `ligues/…/equipes/<id>` path works, so a team link is the full pasted URL
  and is stored whole. FFBB path segments are opaque: never parse, compose or rebuild them.
- Match fields: `id` (drawn from a pool shared by the whole competition, so unique per team across
  several competitions), `date_rencontre` with **no offset** (local time), `joue`, scores, and team
  names nested at `idEngagementEquipe1.nom` / `idEngagementEquipe2.nom`. Home/away is decided by
  comparing those engagement ids with the stored link's trailing id.
- **`T00:00:00` means « time not set yet»**, not midnight. It surfaces as `timeConfirmed: false`
  and every surface prints « heure à confirmer », never « 00:00 ».
- **The venue is on the per-match detail page** (`…/competitions/<code>/match/<id>`, behind each
  fixture's score link), not on the fixture list. It is published as a typed label/value group,
  `{"informations":[{"type":"salle","informations":[{"label":"Nom","value":…},{"type":"address",…}]}]}`,
  with English field names (`address`, `room`, `city`). The page also ships its UI labels in the
  same payload, so a naive key scan once imported « Salle » as every venue: values equal to a
  category word (`GENERIC_VENUE_WORDS`) are rejected, a `correspondant` group's postal address
  never counts as the gym, and when both teams' gyms appear the receiving side wins.
- **The poule page returns the whole phase in one fetch.** `…/competitions/<code>?phase=&poule=&journee=`
  embeds every poule of the phase with every journée; the query parameters only pick the tab the
  page opens on. Every fixture already carries `idPoule` and `competitionId` (the phase), so the
  poule reference is built from the first imported match, no extra lookup. Standings rows
  (`Classement`: `position`, `matchJoues`, `gagnes`, `perdus`, `points`, numbers as strings) were
  confirmed from `Fimeo/ffbb-api-ts`'s types only; every captured page was pre-season and empty.
- **Rate limiting is real, undocumented, and on the CDN.** Four parallel detail-page loads were
  all refused with 403; later observation showed the first load passes and an immediate second one
  is refused. Detail pages are therefore fetched one at a time, as a navigation (fixture-list URL
  as `Referer`, browser `Accept`/`Sec-Fetch-*` headers), spaced `VENUE_FETCH_INTERVAL_MS` (1.5 s),
  and the first 403/429 stops the remaining lookups (logged with the CDN's `server` /
  `cf-mitigated` headers). Matches still missing a venue are read first next time.
- **These sandboxes cannot reach competitions.ffbb.com** (egress refused). `Fimeo/ffbb-api-ts` on
  GitHub is reachable and has matched the real payloads byte for byte. Captured pages become test
  fixtures; a teammate saving a page from a phone browser is how the poule shape was confirmed.

## Calendar import

- Linking: a **club** FFBB code is stored as typed, unvalidated (no lookup exists to check it); a
  **team** link is validated by one live fetch before it is stored, which also snapshots its label.
  A team may hold several links (championship + cup); `ffbbEngagementRef` is unique globally.
- No club search, no engagement picker: there is no data source to build them on. Revisit only if a
  public read-scoped token or a scrapeable search page turns up.
- The import is a **manual button**, idempotent on `@@unique([teamId, externalId])`. A changed
  match is **updated in place**, so RSVPs and convocations survive a reschedule. Played matches are
  skipped, `notes` is never touched, a match that vanished from FFBB is never deleted.
- One link failing aborts the whole import with a message naming the competition, rather than
  importing half a team's season silently.
- Any fetch or parse surprise throws one typed `FfbbPageFormatError` from the provider. A changed
  RSC shape must fail loud in one place, never flow into `Event` rows as `undefined`.
- Our types use our vocabulary (`FfbbMatch`, not `rencontre`).
- Venue resolution runs **only during an import** (`resolveVenues: true`), never during link
  validation, which needs one fetch. Bounds: skip played matches, 10 s per request, at most 60
  lookups and a 15 s budget per engagement (a reverse proxy's 504 would hide work that succeeded).
  A venue that fails to resolve leaves the match at « Lieu non communiqué » and the import goes on.
  A null never overwrites an address already imported, and an address is clamped to 120 characters
  (the import bypasses the DTO's `@MaxLength`, and an over-long value would make the event
  uneditable).
- The detail URL is **read off the fetched page**, never composed: from the match object, else
  from any `href` in the page, else by reusing another match's `…/match/` prefix with this id.
- After an import, upcoming matches still without a venue are listed (`missingVenue`, first 20 and
  a total) so a manager can fill them in.

## Poule results

- Fetched live and rendered in a panel on the team's agenda; **never persisted** and never written
  into `Event` or `MatchPlayerStat`: it is federation data about other clubs.
- A team with several links uses the most recent one. No link is a 404, which the panel renders as
  « link a competition first », distinct from an FFBB failure and from an empty pre-season poule.
- « Latest results » are the `joue: true` matches of the highest journée that has any (a postponed
  match of that journée has no score and is left out).

## Open

- Whether `00:00:00` reliably flips to the real time near matchday, and whether naive times are
  always Europe/Paris across a DST week.
- What a cancelled or postponed match looks like in the feed.
- Whether a match `id` stays stable across re-fetches over a season (the upsert key relies on it).
- A populated `Classement` row, to confirm the third-party type.
- FFBB's terms of use and robots policy are unchecked.
