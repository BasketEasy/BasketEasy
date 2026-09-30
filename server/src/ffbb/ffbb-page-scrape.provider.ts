import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FfbbEngagementFetchResult,
  FfbbMatch,
  FfbbPageFormatError,
  FfbbPouleMatchday,
  FfbbPouleResult,
  FfbbPouleStandings,
  FfbbPouleTeamStanding,
  FfbbProvider,
  GetMatchesOptions,
} from './ffbb-provider';

const DEFAULT_FFBB_BASE_URL = 'https://competitions.ffbb.com';

// `ligues/<x>/comites/<y>/clubs/<z>/equipes/<id>` is the only path shape
// FFBB's site resolves — a bare id 404s (confirmed during this design's
// research), so the full path is what gets stored and re-fetched.
const ENGAGEMENT_PATH_PATTERN =
  /^https:\/\/competitions\.ffbb\.com\/(ligues\/[A-Za-z0-9-]+\/comites\/[A-Za-z0-9-]+\/clubs\/[A-Za-z0-9-]+\/equipes\/(\d+))\/?(?:[?#].*)?$/;

const TRAILING_ENGAGEMENT_ID_PATTERN = /\/equipes\/(\d+)\/?$/;

// A match's own detail page — the page behind the score column of each row
// of a team's fixture list, and the only place FFBB publishes the venue.
// Note the `competitions/<code>` segment: it is NOT derivable from a stored
// engagement ref (`.../clubs/<code>/equipes/<id>`), which is why detail
// paths are always read off the fetched page rather than composed.
// The match id is matched as an opaque token, not as digits: ids are FFBB's
// to shape (see the parent spec's "never parse an FFBB identifier" rule).
const MATCH_DETAIL_PATH_PATTERN =
  /(ligues\/[A-Za-z0-9-]+\/comites\/[A-Za-z0-9-]+\/competitions\/[A-Za-z0-9-]+\/match\/([A-Za-z0-9-]+))/g;

// Strips a match detail path's own `/match/<id>` tail, leaving the
// competition page's own path — the same prefix a poule standings page
// resolves at, just with `?phase=<id>&poule=<id>` appended (see
// docs/superpowers/specs/2026-09-03-poule-weekend-results-design.md).
const COMPETITION_PATH_FROM_DETAIL_PATTERN = /^(.*)\/match\/[^/]+$/;

// The poule standings/results page — confirmed against a real captured
// page (2026-09-03): `phase`/`poule` are FFBB's own internal numeric ids,
// read off an already-fetched match's `idPoule`/`competitionId` fields
// rather than derived from the competition code. `journee` is deliberately
// not part of a stored pouleRef: the query parameter filters nothing (the
// whole poule's season comes back in one fetch regardless of its value).
const POULE_PAGE_PATTERN =
  /^(ligues\/[A-Za-z0-9-]+\/comites\/[A-Za-z0-9-]+\/competitions\/[A-Za-z0-9-]+)\?phase=(\d+)&poule=(\d+)$/;

// Bounds on the extra page loads venue resolution costs us: FFBB publishes
// no rate limit or terms, so an import of a full season stays a handful of
// small sequential waves rather than one N-wide burst.
const VENUE_FETCH_CONCURRENCY = 4;
const MAX_VENUE_LOOKUPS = 60;
const FETCH_TIMEOUT_MS = 10_000;
// A per-request timeout alone doesn't bound the total: 60 slow pages four at
// a time is minutes, and an import that outlives the reverse proxy's read
// timeout shows the admin a 504 for work that actually succeeded. Once the
// budget is spent, the remaining matches simply keep location null.
const VENUE_RESOLUTION_BUDGET_MS = 15_000;

// Venue field names are unverified against a live detail page (this
// design's sandbox has no egress to competitions.ffbb.com), so extraction
// recognizes several plausible spellings instead of betting on one. See
// docs/superpowers/specs/2026-09-01-ffbb-match-venue-address-design.md.
const VENUE_NAME_KEYS = [
  'nomSalle',
  'libelleSalle',
  'salle',
  'nomEquipement',
  'libelleEquipement',
] as const;
/** Only trusted on an object already known to be a venue (reached under a salle-ish key) — on anything else, `nom` is as likely to be a club's. */
const VENUE_GENERIC_NAME_KEYS = ['libelle', 'nom'] as const;
const VENUE_STREET_KEYS = [
  'adresseSalle',
  'adresse',
  'adresse1',
  'rue',
  'address',
  'street',
] as const;
/** FFBB's other address shape: a street split into number + name. Formatted back together rather than read as a plain street key. */
const VENUE_STREET_NUMBER_KEY = 'numeroVoie';
const VENUE_STREET_NAME_KEY = 'libelleVoie';
const VENUE_POSTAL_KEYS = ['codePostalSalle', 'codePostal', 'cp', 'zipCode', 'postalCode'] as const;
const VENUE_CITY_KEYS = ['villeSalle', 'ville', 'commune', 'libelleCommune', 'city'] as const;
const VENUE_KEY_MARKERS = [
  ...VENUE_NAME_KEYS,
  ...VENUE_STREET_KEYS,
  VENUE_STREET_NAME_KEY,
  ...VENUE_CITY_KEYS,
];

const VENUE_PARENT_KEY_PATTERN = /salle|gymnase|lieu|equipement/i;
// A match is played at the home team's gym, so when a detail page carries
// both teams' venues the receiving side's wins — without this the tie is
// broken by serialization order, which would sometimes send a team to its
// opponent's gym.
const HOME_CONTEXT_KEY_PATTERN = /recevant|receveur|domicile|locaux|hote/i;
const AWAY_CONTEXT_KEY_PATTERN = /visiteur|visiteuse|exterieur|adverse/i;
/** A club's, an opponent's or an official's postal address is an address too — never mistake one for the gym. */
const EXCLUDED_PARENT_KEY_PATTERN = /club|organisme|equipe|engagement|correspondant|arbitre|user/i;

// A rendered page ships its UI labels in the same payload as its data
// ("salle": "Salle", "adresse": "Adresse"), and a label sitting under a
// venue key reads exactly like a venue name — that is how imports ended up
// with a location of just "Salle". A value that is nothing but the category
// word is a label, never an address.
const GENERIC_VENUE_WORDS = new Set([
  'salle',
  'salles',
  'gymnase',
  'gymnases',
  'lieu',
  'lieux',
  'equipement',
  'equipements',
  'terrain',
  'adresse',
  'adresses',
  'rue',
  'voie',
  'ville',
  'villes',
  'commune',
  'communes',
  'code postal',
  'cp',
  'libelle',
  'nom',
]);

// The shape a match detail page actually publishes its venue in, confirmed
// against a live page (2026-09-01):
//
//   {"informations":[{"type":"salle","informations":[
//      {"type":"text","label":"Nom","value":"GYMNASE DE LA CHESNAIE"},
//      {"type":"address","label":"Adresse","value":…}]}]}
//
// A typed label/value list, not a venue-shaped record — which is why the
// key-sniffing scan below found only the page's i18n dictionary
// ("salle":"Salle") and imported that as the address. This group is read
// first; the key scan stays as the fallback for any other page shape.
const VENUE_GROUP_TYPE_PATTERN = /^(salle|gymnase|equipement|lieu)$/i;
const VENUE_ITEM_NAME_LABEL_PATTERN = /nom|salle|gymnase/i;
const VENUE_ITEM_ADDRESS_TYPE_PATTERN = /address|adresse/i;
const MAX_INFO_ITEM_DEPTH = 6;

interface InfoItem {
  type?: unknown;
  label?: unknown;
  value?: unknown;
}

/** Bounds how many `"data":[` occurrences extractDataArray will try before giving up on a chunk. */
const MAX_DATA_ARRAY_SCANS = 20;

/** Bounds how many `"poules":[` occurrences extractPoulesArray will try before giving up on a chunk. */
const MAX_POULES_ARRAY_SCANS = 20;

/** Bounds how many `"dataEngagement":{` occurrences extractEngagementPouleId will try before giving up on a chunk. */
const MAX_ENGAGEMENT_POULE_ID_SCANS = 20;

/** Guards on the text scan that finds a venue object inside an RSC chunk. */
const MAX_VENUE_MARKER_SCANS = 40;
const MAX_ENCLOSING_OBJECT_CANDIDATES = 24;
const MAX_ENCLOSING_OBJECT_LENGTH = 200_000;
const MAX_VENUE_WALK_DEPTH = 8;

interface VenueCandidate {
  object: Record<string, unknown>;
  /** The key this object sits under — decides whether generic name keys are trustworthy. */
  parentKey: string | null;
  /** Which side's venue this is, when an ancestor key said so. */
  side?: 'home' | 'away';
}

/** Detail-page paths read off a fixture-list page: per match, plus the shared prefix so a row whose own link is missing can still be addressed by id. */
interface DetailPathIndex {
  byMatchId: Map<string, string>;
  prefix: string | null;
}

// Best-effort candidate keys for a competition/poule display label — no
// field for this was confirmed during research (see the design spec's
// research notes); if FFBB's payload doesn't carry any of these, the label
// stays null and the frontend falls back to neutral copy ("Compétition
// liée").
const COMPETITION_LABEL_CANDIDATE_KEYS = [
  'libelleCompetition',
  'nomCompetition',
  'libellePoule',
  'nomPoule',
  'competition',
  'poule',
] as const;

interface RawFfbbMatch {
  id?: unknown;
  date_rencontre?: unknown;
  joue?: unknown;
  numeroJournee?: unknown;
  resultatEquipe1?: unknown;
  resultatEquipe2?: unknown;
  idEngagementEquipe1?: { id?: unknown; nom?: unknown } | null;
  idEngagementEquipe2?: { id?: unknown; nom?: unknown } | null;
  // Confirmed present on a poule page's rencontre objects (2026-09-03
  // capture). Confirmed ABSENT on the team-engagement page's own rencontre
  // objects (2026-09-04 capture) — that page carries the poule id only on
  // its separate `dataEngagement` object (see derivePouleRef/
  // extractEngagementPouleId), never per-match. Kept on this shared
  // interface because getPouleStandings's own rencontre rows (via
  // RawFfbbPoule.rencontres) do carry it.
  idPoule?: { id?: unknown; nom?: unknown } | null;
  competitionId?: { id?: unknown } | null;
  [key: string]: unknown;
}

/** A poule's standings row — see docs/superpowers/specs/2026-09-03-poule-weekend-results-design.md, confirmed via Fimeo/ffbb-api-ts's Classement type since every classements array captured so far is empty (pre-season). */
interface RawFfbbClassement {
  id?: unknown;
  idEngagement?: { id?: unknown; nom?: unknown } | null;
  matchJoues?: unknown;
  points?: unknown;
  position?: unknown;
  gagnes?: unknown;
  perdus?: unknown;
}

interface RawFfbbPoule {
  id?: unknown;
  nom?: unknown;
  rencontres?: unknown;
  classements?: unknown;
}

/**
 * The only FFBB-contract-aware file in this module: everything about the
 * URL shape, the page-scrape strategy, and the RSC-payload extraction lives
 * here so a future FFBB frontend change touches this one file, never the
 * FfbbProvider interface or anything downstream of it.
 *
 * `competitions.ffbb.com` has no reachable REST API for club/match data
 * (verified during this design's research — the only public Directus token
 * is scoped to `configuration`/`assets`, not `organismes`/`rencontres`).
 * What works instead: fetching a team's own page and parsing the match data
 * out of its embedded Next.js RSC streaming payload
 * (`self.__next_f.push([...])` script chunks) — no auth needed.
 *
 * Extraction here is verified against fixtures built from real captured
 * pages (2026-09-01 match detail, 2026-09-03 poule standings, 2026-09-04
 * team engagement — sandbox egress to competitions.ffbb.com is blocked, so
 * captures were taken outside it and copied in as literal fixture text, not
 * re-derived from the design spec's guessed shape). Any shape it doesn't
 * recognize throws FfbbPageFormatError rather than guessing — this is
 * deliberately the one file expected to need updates when FFBB's frontend
 * changes.
 */
@Injectable()
export class FfbbPageScrapeProvider implements FfbbProvider {
  private readonly logger = new Logger(FfbbPageScrapeProvider.name);

  constructor(private readonly config: ConfigService) {}

  parseEngagementRef(url: string): string | null {
    const match = ENGAGEMENT_PATH_PATTERN.exec(url.trim());
    return match ? match[1] : null;
  }

  async getMatchesForEngagement(
    engagementRef: string,
    options: GetMatchesOptions = {},
  ): Promise<FfbbEngagementFetchResult> {
    const engagementIdMatch = TRAILING_ENGAGEMENT_ID_PATTERN.exec(engagementRef);
    if (!engagementIdMatch) {
      throw new FfbbPageFormatError(`Not a valid FFBB engagement ref: "${engagementRef}"`);
    }
    const engagementId = engagementIdMatch[1];

    const html = await this.fetchPage(engagementRef);
    const chunks = this.extractNextFPushChunks(html);
    const rawMatches = this.extractRawMatches(chunks);

    const matches: FfbbMatch[] = rawMatches.map((raw) => this.toFfbbMatch(raw, engagementId));
    const competitionLabel = this.extractCompetitionLabel(rawMatches);
    const pouleRef = this.derivePouleRef(rawMatches, chunks);

    if (options.resolveVenues) {
      await this.resolveVenues(matches, rawMatches, chunks, options.knownVenueMatchIds);
    }

    return { competitionLabel, matches, pouleRef };
  }

  async getPouleStandings(pouleRef: string, ourEngagementId: string): Promise<FfbbPouleStandings> {
    const refMatch = POULE_PAGE_PATTERN.exec(pouleRef.trim());
    if (!refMatch) {
      throw new FfbbPageFormatError(`Not a valid FFBB poule ref: "${pouleRef}"`);
    }
    const pouleId = refMatch[3];

    const html = await this.fetchPage(pouleRef);
    const chunks = this.extractNextFPushChunks(html);
    const poules = this.extractRawPoules(chunks);

    const poule = poules.find((p) => String(p.id) === pouleId);
    if (!poule) {
      throw new FfbbPageFormatError(`Poule ${pouleId} not found in FFBB competition payload`);
    }

    return {
      standings: this.toStandings(poule.classements, ourEngagementId),
      matchdays: this.toMatchdays(poule.rencontres, ourEngagementId),
    };
  }

  /**
   * `ligues/<x>/comites/<y>/competitions/<code>?phase=<id>&poule=<id>` — the
   * whole poule standings reference, built entirely from data this same
   * fetch already pulled (see docs/superpowers/specs/2026-09-03-poule-weekend-results-design.md):
   * a match detail link anywhere in the page gives the competition prefix,
   * any one raw match's own competitionId gives the phase id, and the page's
   * `dataEngagement` object gives the poule id (see its own comment — a raw
   * match row never carries idPoule on a team's own engagement page,
   * confirmed against a live page 2026-09-04). A team plays in exactly one
   * poule per engagement, so it doesn't matter which fetched match supplies
   * the phase id.
   */
  private derivePouleRef(rawMatches: RawFfbbMatch[], chunks: string[]): string | null {
    let competitionPrefix: string | null = null;
    outer: for (const chunk of chunks) {
      for (const [, path] of chunk.matchAll(MATCH_DETAIL_PATH_PATTERN)) {
        const prefixMatch = COMPETITION_PATH_FROM_DETAIL_PATTERN.exec(path);
        if (prefixMatch) {
          competitionPrefix = prefixMatch[1];
          break outer;
        }
      }
    }
    if (!competitionPrefix) return null;

    const pouleId = this.extractEngagementPouleId(chunks);
    if (!pouleId) return null;

    for (const raw of rawMatches) {
      const phaseId = this.readNestedId(raw.competitionId);
      if (phaseId) {
        return `${competitionPrefix}?phase=${phaseId}&poule=${pouleId}`;
      }
    }
    return null;
  }

  /**
   * The team's own poule id, read off the page's `dataEngagement.idPoule`
   * object — the RSC payload's summary of the engagement itself, distinct
   * from its `data` array of matches. Confirmed against a live page
   * (2026-09-04): none of that array's rencontre rows carry an `idPoule`
   * field, only this sibling object does. A shape mismatch (unparseable, or
   * missing `idPoule`) keeps scanning forward for the next occurrence of the
   * marker within the same chunk rather than giving up on it — the same
   * fragility extractDataArray/extractPoulesArray were fixed for.
   */
  private extractEngagementPouleId(chunks: string[]): string | null {
    const marker = '"dataEngagement":{';
    for (const chunk of chunks) {
      let searchFrom = 0;
      let scans = 0;
      for (;;) {
        if (scans >= MAX_ENGAGEMENT_POULE_ID_SCANS) break;
        scans += 1;
        const markerIndex = chunk.indexOf(marker, searchFrom);
        if (markerIndex === -1) break;
        searchFrom = markerIndex + marker.length;
        const objectText = this.readBalancedObject(chunk, markerIndex + marker.length - 1);
        if (!objectText) continue;
        let parsed: unknown;
        try {
          parsed = JSON.parse(objectText);
        } catch {
          continue;
        }
        if (typeof parsed !== 'object' || parsed === null) continue;
        const pouleId = this.readNestedId((parsed as { idPoule?: unknown }).idPoule);
        if (pouleId) return pouleId;
      }
    }
    return null;
  }

  private readNestedId(value: unknown): string | null {
    if (value && typeof value === 'object' && 'id' in value) {
      const id = (value as { id?: unknown }).id;
      return typeof id === 'string' ? id : null;
    }
    return null;
  }

  private get baseUrl(): string {
    return this.config.get<string>('FFBB_BASE_URL') ?? DEFAULT_FFBB_BASE_URL;
  }

  private async fetchPage(path: string): Promise<string> {
    const url = `${this.baseUrl}/${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        // Without a deadline a hung FFBB response would hold the import
        // request open until the client gives up — and an import makes one
        // of these calls per match, not one per request.
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          // The CDN in front of competitions.ffbb.com WAF-blocks requests
          // with no Referer/Origin/browser User-Agent — confirmed during
          // this design's research.
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Referer: 'https://competitions.ffbb.com/',
          Origin: 'https://competitions.ffbb.com',
        },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new FfbbPageFormatError(`Could not reach FFBB for "${path}": ${reason}`);
    }
    if (!response.ok) {
      throw new FfbbPageFormatError(`FFBB returned ${response.status} for "${path}"`);
    }
    return response.text();
  }

  /**
   * Next.js RSC streaming payloads are shipped as a sequence of
   * `self.__next_f.push([<index>,"<escaped RSC text>"])` statements. The
   * second array element is a JSON string literal, so we hand-scan for each
   * `push(` call and lean on JSON.parse to unescape its string argument
   * (correctly resolving embedded `\"`/`\\`/`\n` etc.) rather than
   * hand-rolling escape handling in a regex, which breaks on nested quotes.
   */
  private extractRawMatches(chunks: string[]): RawFfbbMatch[] {
    for (const chunk of chunks) {
      const dataArray = this.extractDataArray(chunk);
      if (dataArray) {
        return dataArray;
      }
    }
    throw new FfbbPageFormatError('Could not find a match-data array in the FFBB page payload');
  }

  private extractNextFPushChunks(html: string): string[] {
    const marker = 'self.__next_f.push([';
    const chunks: string[] = [];
    let searchFrom = 0;
    for (;;) {
      const start = html.indexOf(marker, searchFrom);
      if (start === -1) break;
      const stringStart = html.indexOf('"', start + marker.length);
      if (stringStart === -1) break;
      const stringLiteral = this.readJsonStringLiteral(html, stringStart);
      if (stringLiteral === null) {
        searchFrom = start + marker.length;
        continue;
      }
      try {
        chunks.push(JSON.parse(stringLiteral) as string);
      } catch {
        // Not a valid string literal at this position — skip past it.
      }
      searchFrom = stringStart + stringLiteral.length;
    }
    return chunks;
  }

  /** Reads a double-quoted JSON string literal starting at `startIndex` (which must point at the opening `"`), respecting backslash escapes. Returns the literal including its quotes, or null if unterminated. */
  private readJsonStringLiteral(text: string, startIndex: number): string | null {
    let i = startIndex + 1;
    while (i < text.length) {
      const ch = text[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') {
        return text.slice(startIndex, i + 1);
      }
      i += 1;
    }
    return null;
  }

  /**
   * Finds `"data":[...]` in a decoded RSC chunk and parses the array,
   * respecting nested brackets/strings. A team's own page ships more than
   * one array under this key before the match list — confirmed live
   * (2026-09-04): a `"data":[...]` full of the club's *other* teams (a
   * competition switcher, shaped nothing like a match) sits earlier in the
   * same chunk. So a shape mismatch keeps scanning forward for the next
   * occurrence rather than giving up on the whole chunk.
   */
  private extractDataArray(chunk: string): RawFfbbMatch[] | null {
    const marker = '"data":[';
    let searchFrom = 0;
    let scans = 0;
    for (;;) {
      if (scans >= MAX_DATA_ARRAY_SCANS) return null;
      scans += 1;
      const markerIndex = chunk.indexOf(marker, searchFrom);
      if (markerIndex === -1) return null;
      searchFrom = markerIndex + marker.length;
      const parsed = this.parseArrayAt(chunk, markerIndex + marker.length - 1);
      if (!parsed || parsed.some((entry) => typeof entry !== 'object' || entry === null)) {
        continue;
      }
      // A false positive on "data":[...] with no match-shaped entries (e.g.
      // an unrelated array) — only trust arrays whose entries actually look
      // like matches.
      if (
        !parsed.every((entry) => 'id' in (entry as object) && 'date_rencontre' in (entry as object))
      ) {
        continue;
      }
      return parsed as RawFfbbMatch[];
    }
  }

  /**
   * Finds `"poules":[...]` in a decoded RSC chunk and parses the array. A
   * false positive worth ruling out here specifically: FFBB's page ships
   * more than one array under this same key before the real one — a
   * lightweight index holding bare id *strings*, and a second holding
   * poule objects with only `id`/`nom` (no `rencontres`/`classements`) —
   * all three confirmed to live in the *same* single RSC chunk on a live
   * page (2026-09-04), not separate ones. So a shape mismatch keeps
   * scanning forward for the next occurrence in this chunk rather than
   * giving up on it.
   */
  private extractPoulesArray(chunk: string): RawFfbbPoule[] | null {
    const marker = '"poules":[';
    let searchFrom = 0;
    let scans = 0;
    for (;;) {
      if (scans >= MAX_POULES_ARRAY_SCANS) return null;
      scans += 1;
      const markerIndex = chunk.indexOf(marker, searchFrom);
      if (markerIndex === -1) return null;
      searchFrom = markerIndex + marker.length;
      const parsed = this.parseArrayAt(chunk, markerIndex + marker.length - 1);
      if (!parsed || parsed.some((entry) => typeof entry !== 'object' || entry === null)) {
        continue;
      }
      if (
        !parsed.every(
          (entry) =>
            'id' in (entry as object) &&
            'nom' in (entry as object) &&
            'rencontres' in (entry as object) &&
            'classements' in (entry as object),
        )
      ) {
        continue;
      }
      return parsed as RawFfbbPoule[];
    }
  }

  private extractRawPoules(chunks: string[]): RawFfbbPoule[] {
    for (const chunk of chunks) {
      const poules = this.extractPoulesArray(chunk);
      if (poules) return poules;
    }
    throw new FfbbPageFormatError('Could not find a poule-data array in the FFBB page payload');
  }

  /** Parses a bracket-balanced JSON array starting at `arrayStart` (which must point at the opening `[`), respecting strings and escapes. Returns null if unterminated, malformed, or not actually an array. Shared by every RSC-array extractor in this file — only the marker searched for and the per-entry shape validation differ between them. */
  private parseArrayAt(chunk: string, arrayStart: number): unknown[] | null {
    let depth = 0;
    let inString = false;
    for (let i = arrayStart; i < chunk.length; i++) {
      const ch = chunk[i];
      if (inString) {
        if (ch === '\\') {
          i += 1;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === '[') {
        depth += 1;
      } else if (ch === ']') {
        depth -= 1;
        if (depth === 0) {
          const arrayText = chunk.slice(arrayStart, i + 1);
          try {
            const parsed: unknown = JSON.parse(arrayText);
            return Array.isArray(parsed) ? parsed : null;
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  /** Maps raw classement rows to standings, sorted by FFBB's own `position`. A malformed row (missing team identity or a non-numeric stat) is skipped rather than failing the whole listing — one bad row shouldn't hide the other nine. */
  private toStandings(rawClassements: unknown, ourEngagementId: string): FfbbPouleTeamStanding[] {
    if (!Array.isArray(rawClassements)) return [];

    const rows: { position: number; standing: FfbbPouleTeamStanding }[] = [];
    for (const entry of rawClassements) {
      if (typeof entry !== 'object' || entry === null) continue;
      const raw = entry as RawFfbbClassement;
      const engagement = raw.idEngagement;
      const teamLabel =
        engagement && typeof engagement === 'object'
          ? (engagement as { nom?: unknown }).nom
          : undefined;
      const teamId =
        engagement && typeof engagement === 'object'
          ? (engagement as { id?: unknown }).id
          : undefined;
      const played = this.toNumber(raw.matchJoues);
      const won = this.toNumber(raw.gagnes);
      const lost = this.toNumber(raw.perdus);
      const points = this.toNumber(raw.points);
      const position = this.toNumber(raw.position);
      if (
        typeof teamLabel !== 'string' ||
        played === null ||
        won === null ||
        lost === null ||
        points === null ||
        position === null
      ) {
        continue;
      }
      rows.push({
        position,
        standing: {
          teamLabel,
          played,
          won,
          lost,
          points,
          isOurTeam: String(teamId) === ourEngagementId,
        },
      });
    }
    return rows.sort((a, b) => a.position - b.position).map((row) => row.standing);
  }

  /** Every played journée, most recent first — a played match with no journée number is dropped rather than mis-grouped. */
  private toMatchdays(rawRencontres: unknown, ourEngagementId: string): FfbbPouleMatchday[] {
    if (!Array.isArray(rawRencontres)) return [];

    const played = rawRencontres.filter(
      (entry): entry is RawFfbbMatch =>
        typeof entry === 'object' && entry !== null && (entry as RawFfbbMatch).joue === true,
    );

    const byJournee = new Map<number, FfbbPouleResult[]>();
    for (const raw of played) {
      const journee = this.toNumber(raw.numeroJournee);
      const home = raw.idEngagementEquipe1;
      const away = raw.idEngagementEquipe2;
      const homeScore = this.toNumber(raw.resultatEquipe1);
      const awayScore = this.toNumber(raw.resultatEquipe2);
      if (
        journee === null ||
        !home ||
        typeof home.nom !== 'string' ||
        !away ||
        typeof away.nom !== 'string' ||
        homeScore === null ||
        awayScore === null
      ) {
        continue;
      }
      const result: FfbbPouleResult = {
        homeLabel: home.nom,
        awayLabel: away.nom,
        homeScore,
        awayScore,
        involvesOurTeam: String(home.id) === ourEngagementId || String(away.id) === ourEngagementId,
      };
      const results = byJournee.get(journee);
      if (results) {
        results.push(result);
      } else {
        byJournee.set(journee, [result]);
      }
    }

    return [...byJournee.entries()]
      .sort(([a], [b]) => b - a)
      .map(([journee, results]) => ({ matchdayLabel: `Journée ${journee}`, results }));
  }

  /** FFBB's own numeric fields are strings on this API — accepts either. */
  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return null;
  }

  private toFfbbMatch(raw: RawFfbbMatch, engagementId: string): FfbbMatch {
    const id = raw.id;
    const startsAt = raw.date_rencontre;
    if (typeof id !== 'string' || typeof startsAt !== 'string') {
      throw new FfbbPageFormatError('FFBB match payload is missing id/date_rencontre');
    }

    const home = raw.idEngagementEquipe1;
    const away = raw.idEngagementEquipe2;
    let isHome: boolean;
    let opponentLabel: string;
    if (
      home &&
      String(home.id) === engagementId &&
      typeof home.nom === 'string' &&
      typeof away?.nom === 'string'
    ) {
      isHome = true;
      opponentLabel = away.nom;
    } else if (
      away &&
      String(away.id) === engagementId &&
      typeof away.nom === 'string' &&
      typeof home?.nom === 'string'
    ) {
      isHome = false;
      opponentLabel = home.nom;
    } else {
      throw new FfbbPageFormatError(
        `FFBB match ${id} doesn't reference engagement ${engagementId} on either side`,
      );
    }

    return {
      id,
      startsAt,
      timeConfirmed: !startsAt.endsWith('T00:00:00'),
      opponentLabel,
      isHome,
      location: null,
      played: raw.joue === true,
    };
  }

  // --- Venue resolution -------------------------------------------------
  //
  // A team's fixture list carries no venue; each row's score column links
  // to the match's own detail page, and that page does. So an import (and
  // only an import — see GetMatchesOptions.resolveVenues) follows one
  // detail page per unplayed match. Every step below is best-effort: an
  // unreachable or unrecognized detail page leaves that one match's
  // location null, exactly as before this existed, and never fails the
  // import that a whole season's fixtures depend on.

  /** Fills `location` in place on the matches we just built — they're local objects, not anything a caller has seen yet. */
  private async resolveVenues(
    matches: FfbbMatch[],
    rawMatches: RawFfbbMatch[],
    chunks: string[],
    knownVenueMatchIds: ReadonlySet<string> = new Set(),
  ): Promise<void> {
    const detailIndex = this.buildDetailPathIndex(chunks);
    const pending: { match: FfbbMatch; raw: RawFfbbMatch }[] = [];

    for (const [index, match] of matches.entries()) {
      // A played match is skipped by the import's upsert anyway — fetching
      // its venue would be a page load spent on a row nothing will write.
      if (match.played) continue;
      const raw = rawMatches[index];
      const inline = this.pickVenue(this.collectVenueCandidates(raw, null, false));
      if (inline) {
        match.location = inline;
        continue;
      }
      pending.push({ match, raw });
    }

    // The fetch cap and the time budget cut the tail of this list, so the
    // matches that need a page load most go first: no venue known yet, then
    // the soonest. In fixture order, a season's last matches were never
    // reached, and a re-sync spent its budget re-reading venues it had.
    pending.sort(
      (a, b) =>
        Number(knownVenueMatchIds.has(a.match.id)) - Number(knownVenueMatchIds.has(b.match.id)) ||
        a.match.startsAt.localeCompare(b.match.startsAt),
    );
    const queued = pending.slice(0, MAX_VENUE_LOOKUPS);

    const deadline = Date.now() + VENUE_RESOLUTION_BUDGET_MS;
    let noPath = 0;
    let outOfBudget = 0;
    let unread = 0;
    await this.runWithConcurrency(queued, VENUE_FETCH_CONCURRENCY, async ({ match, raw }) => {
      if (Date.now() >= deadline) {
        outOfBudget += 1;
        return;
      }
      const path = this.resolveDetailPath(raw, match.id, detailIndex);
      if (!path) {
        noPath += 1;
        return;
      }
      match.location = await this.fetchVenue(path);
      if (!match.location) unread += 1;
    });
    const skipped = pending.length - queued.length + outOfBudget;
    if (noPath + unread + skipped > 0) {
      // No venue on a page is often legit (not published yet), but a spike
      // here is the only trace a changed FFBB page shape leaves.
      this.logger.warn(
        `Venue resolution: ${queued.length - noPath - unread - outOfBudget}/${pending.length} resolved, ` +
          `${unread} detail pages without a readable venue, ${noPath} without a detail link, ` +
          `${skipped} skipped (cap or time budget)`,
      );
    }
  }

  private buildDetailPathIndex(chunks: string[]): DetailPathIndex {
    const byMatchId = new Map<string, string>();
    let prefix: string | null = null;
    for (const chunk of chunks) {
      for (const [, path, matchId] of chunk.matchAll(MATCH_DETAIL_PATH_PATTERN)) {
        if (!byMatchId.has(matchId)) byMatchId.set(matchId, path);
        prefix ??= path.slice(0, path.length - matchId.length);
      }
    }
    return { byMatchId, prefix };
  }

  /**
   * Three tiers, first hit wins: the match row's own serialized link, the
   * page-wide link index, then the shared prefix plus this match's id. The
   * competition segment of a detail path can't be derived from an
   * engagement ref, so nothing here composes a path out of thin air — the
   * last tier reuses a prefix the page itself gave us, and a stale one just
   * 404s, which is already a handled outcome.
   */
  private resolveDetailPath(
    raw: RawFfbbMatch,
    matchId: string,
    index: DetailPathIndex,
  ): string | null {
    const fromRow = this.findDetailPathFor(JSON.stringify(raw), matchId);
    if (fromRow) return fromRow;
    const fromPage = index.byMatchId.get(matchId);
    if (fromPage) return fromPage;
    return index.prefix ? `${index.prefix}${matchId}` : null;
  }

  private findDetailPathFor(text: string, matchId: string): string | null {
    for (const [, path, id] of text.matchAll(MATCH_DETAIL_PATH_PATTERN)) {
      if (id === matchId) return path;
    }
    return null;
  }

  private async fetchVenue(path: string): Promise<string | null> {
    try {
      const html = await this.fetchPage(path);
      const chunks = this.extractNextFPushChunks(html);
      return (
        this.extractVenueFromInformationGroups(chunks) ??
        this.pickVenue(this.collectVenueCandidatesFromChunks(chunks))
      );
    } catch (err: unknown) {
      this.logger.warn(`Venue fetch failed for "${path}": ${String(err)}`);
      return null;
    }
  }

  /** The confirmed page shape: an `informations` group typed `salle`, holding label/value items. */
  private extractVenueFromInformationGroups(chunks: string[]): string | null {
    for (const chunk of chunks) {
      const needle = '"salle"';
      let from = 0;
      let scans = 0;
      for (;;) {
        const at = chunk.indexOf(needle, from);
        if (at === -1) break;
        from = at + needle.length;
        if (scans >= MAX_VENUE_MARKER_SCANS) break;
        scans += 1;
        // `"salle"` appears both as the group's `type` value and as a key in
        // the page's i18n dictionary, so the enclosing object has to prove
        // it is the group before anything is read out of it.
        const enclosing = this.parseObjectCovering(chunk, at);
        if (!enclosing) continue;
        const venue = this.formatInformationGroup(enclosing);
        if (venue) return venue;
      }
    }
    return null;
  }

  private formatInformationGroup(group: Record<string, unknown>): string | null {
    const type = group.type;
    if (typeof type !== 'string' || !VENUE_GROUP_TYPE_PATTERN.test(type.trim())) return null;

    const items = this.collectInfoItems(group.informations, [], 0);
    const name = this.readInfoItem(
      items,
      (item) =>
        typeof item.label === 'string' && VENUE_ITEM_NAME_LABEL_PATTERN.test(item.label.trim()),
    );
    const address = this.readInfoItem(
      items,
      (item) =>
        (typeof item.type === 'string' && VENUE_ITEM_ADDRESS_TYPE_PATTERN.test(item.type.trim())) ||
        (typeof item.label === 'string' && VENUE_ITEM_ADDRESS_TYPE_PATTERN.test(item.label.trim())),
    );

    const parts = [name, address].filter(
      (part): part is string => part !== null && part.length > 0,
    );
    // The address item sometimes repeats the venue name; don't print it twice.
    const unique = parts.filter((part, index) => parts.indexOf(part) === index);
    return unique.length > 0 ? unique.join(', ') : null;
  }

  private collectInfoItems(value: unknown, out: InfoItem[], depth: number): InfoItem[] {
    if (depth > MAX_INFO_ITEM_DEPTH || value === null || typeof value !== 'object') return out;
    if (Array.isArray(value)) {
      for (const item of value) this.collectInfoItems(item, out, depth + 1);
      return out;
    }
    const object = value as Record<string, unknown>;
    if ('value' in object) out.push(object as InfoItem);
    for (const child of Object.values(object)) this.collectInfoItems(child, out, depth + 1);
    return out;
  }

  /** An item's `value` is a plain string on this page, but is read as a venue-shaped object too rather than betting on that. */
  private readInfoItem(items: InfoItem[], matches: (item: InfoItem) => boolean): string | null {
    for (const item of items) {
      if (!matches(item)) continue;
      const { value } = item;
      if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value).replace(/\s+/g, ' ').trim();
        if (text.length > 0 && !this.isGenericLabel(text)) return text;
        continue;
      }
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const formatted = this.formatVenue({
          object: value as Record<string, unknown>,
          parentKey: 'salle',
        });
        if (formatted) return formatted;
      }
    }
    return null;
  }

  /** Nearest parseable object enclosing `index`, array element or not — the group is one. */
  private parseObjectCovering(text: string, index: number): Record<string, unknown> | null {
    let attempts = 0;
    for (let i = index; i >= 0; i--) {
      if (text[i] !== '{') continue;
      if (attempts >= MAX_ENCLOSING_OBJECT_CANDIDATES) return null;
      attempts += 1;
      const objectText = this.readBalancedObject(text, i);
      if (!objectText || i + objectText.length <= index) continue;
      try {
        const parsed: unknown = JSON.parse(objectText);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  private collectVenueCandidatesFromChunks(chunks: string[]): VenueCandidate[] {
    const candidates: VenueCandidate[] = [];
    for (const chunk of chunks) {
      candidates.push(...this.collectVenueCandidatesFromChunk(chunk));
    }
    return candidates;
  }

  /**
   * An RSC chunk is JSON-shaped text, not a single parseable document, so a
   * venue object is found by scanning for its field names and parsing
   * outward from there to the nearest enclosing object that actually
   * parses.
   */
  private collectVenueCandidatesFromChunk(chunk: string): VenueCandidate[] {
    const candidates: VenueCandidate[] = [];
    const parsedStarts = new Set<number>();
    let scans = 0;
    for (const marker of VENUE_KEY_MARKERS) {
      const needle = `"${marker}"`;
      let from = 0;
      for (;;) {
        const at = chunk.indexOf(needle, from);
        if (at === -1) break;
        from = at + needle.length;
        if (scans >= MAX_VENUE_MARKER_SCANS) return candidates;
        scans += 1;
        const enclosing = this.parseEnclosingObject(chunk, at, parsedStarts);
        if (enclosing) {
          candidates.push(
            ...this.collectVenueCandidates(enclosing.object, enclosing.parentKey, false),
          );
        }
      }
    }
    return candidates;
  }

  /** Nearest `{` before `keyIndex` whose balanced object both parses and still covers that position. */
  private parseEnclosingObject(
    text: string,
    keyIndex: number,
    parsedStarts: Set<number>,
  ): VenueCandidate | null {
    let attempts = 0;
    let fallback: VenueCandidate | null = null;
    for (let i = keyIndex; i >= 0; i--) {
      if (text[i] !== '{') continue;
      // Already walked this object for an earlier marker — its candidates
      // are in the list, no need to re-parse it.
      if (parsedStarts.has(i)) return null;
      if (attempts >= MAX_ENCLOSING_OBJECT_CANDIDATES) return null;
      attempts += 1;
      const objectText = this.readBalancedObject(text, i);
      // A `{` that closes before our key belongs to a sibling, not an
      // ancestor — keep walking outward.
      if (!objectText || i + objectText.length <= keyIndex) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(objectText);
      } catch {
        continue;
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
      const object = parsed as Record<string, unknown>;
      const parentKey = this.readPrecedingKey(text, i);
      // An array element's own key belongs to the array, one level further
      // out (`"organismes":[{…}]`) — accepting it here would hand the walk a
      // keyless root and let a club's mailing address past the exclusions.
      // Keep expanding, and fall back to it only if nothing larger parses.
      if (parentKey === null && this.isArrayElement(text, i)) {
        fallback ??= { object, parentKey: null };
        continue;
      }
      parsedStarts.add(i);
      return { object, parentKey };
    }
    return fallback;
  }

  private isArrayElement(text: string, objectStart: number): boolean {
    for (let i = objectStart - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue;
      return ch === '[' || ch === ',';
    }
    return false;
  }

  /** Reads a brace-balanced `{...}` starting at `start`, respecting strings and escapes. Null if unterminated or implausibly long. */
  private readBalancedObject(text: string, start: number): string | null {
    let depth = 0;
    let inString = false;
    const limit = Math.min(text.length, start + MAX_ENCLOSING_OBJECT_LENGTH);
    for (let i = start; i < limit; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === '\\') i += 1;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }

  private readPrecedingKey(text: string, objectStart: number): string | null {
    const before = text.slice(Math.max(0, objectStart - 80), objectStart);
    const keyMatch = /"([A-Za-z0-9_]+)"\s*:\s*$/.exec(before);
    return keyMatch ? keyMatch[1] : null;
  }

  /** Walks a parsed value collecting every object that looks like a venue, remembering the key each sits under. */
  private collectVenueCandidates(
    value: unknown,
    parentKey: string | null,
    blocked: boolean,
    out: VenueCandidate[] = [],
    depth = 0,
    side?: 'home' | 'away',
  ): VenueCandidate[] {
    if (depth > MAX_VENUE_WALK_DEPTH || value === null || typeof value !== 'object') return out;

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectVenueCandidates(item, parentKey, blocked, out, depth + 1, side);
      }
      return out;
    }

    const venueParent = parentKey !== null && VENUE_PARENT_KEY_PATTERN.test(parentKey);
    // A venue key clears the block rather than inheriting it: `salle` under
    // `equipeRecevante` is still the gym, not the club's own address.
    const isBlocked = venueParent
      ? false
      : blocked || (parentKey !== null && EXCLUDED_PARENT_KEY_PATTERN.test(parentKey));

    const ownSide = this.sideForKey(parentKey) ?? side;

    const object = value as Record<string, unknown>;
    if (!isBlocked && this.looksLikeVenue(object, venueParent)) {
      out.push({ object, parentKey, side: ownSide });
    }
    for (const [key, child] of Object.entries(object)) {
      this.collectVenueCandidates(child, key, isBlocked, out, depth + 1, ownSide);
    }
    return out;
  }

  private sideForKey(key: string | null): 'home' | 'away' | undefined {
    if (key === null) return undefined;
    if (HOME_CONTEXT_KEY_PATTERN.test(key)) return 'home';
    if (AWAY_CONTEXT_KEY_PATTERN.test(key)) return 'away';
    return undefined;
  }

  private looksLikeVenue(object: Record<string, unknown>, venueParent: boolean): boolean {
    const hasName =
      this.readString(object, VENUE_NAME_KEYS) !== null ||
      // `libelle`/`nom` only counts on an object already reached under a
      // salle-ish key — elsewhere it's as likely to name a club.
      (venueParent && this.readString(object, VENUE_GENERIC_NAME_KEYS) !== null);
    const hasStreet = this.readStreet(object) !== null;
    const hasLocality = this.readLocality(object) !== null;
    return hasName || (hasStreet && (hasLocality || venueParent));
  }

  /** Best-scoring candidate that actually formats into something, or null. */
  private pickVenue(candidates: VenueCandidate[]): string | null {
    const ranked = [...candidates].sort((a, b) => this.scoreVenue(b) - this.scoreVenue(a));
    for (const candidate of ranked) {
      const formatted = this.formatVenue(candidate);
      if (formatted) return formatted;
    }
    return null;
  }

  private scoreVenue({ object, parentKey, side }: VenueCandidate): number {
    let score = 0;
    if (side === 'home') score += 3;
    // Strong enough that a home-side or unattributed venue always wins, but
    // not a veto: a page that only names the visiting side's gym is still
    // more likely right than nothing.
    else if (side === 'away') score -= 5;
    if (parentKey !== null && VENUE_PARENT_KEY_PATTERN.test(parentKey)) score += 4;
    if (this.readString(object, VENUE_NAME_KEYS) !== null) score += 2;
    if (this.readStreet(object) !== null) score += 1;
    if (this.readLocality(object) !== null) score += 1;
    return score;
  }

  /** "Salle de la Herdrie, 12 rue des Sports, 44115 Basse-Goulaine" — every part optional, absent ones simply dropped. */
  private formatVenue({ object, parentKey }: VenueCandidate): string | null {
    const venueParent = parentKey !== null && VENUE_PARENT_KEY_PATTERN.test(parentKey);
    const name =
      this.readString(object, VENUE_NAME_KEYS) ??
      // On anything not already known to be a venue, `nom`/`libelle` is as
      // likely to be a club's name as a gym's.
      (venueParent ? this.readString(object, VENUE_GENERIC_NAME_KEYS) : null);
    const parts = [name, this.readStreet(object), this.readLocality(object)].filter(
      (part): part is string => part !== null && part.length > 0,
    );
    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * « 44115 Basse-Goulaine ». The commune is either flat keys beside the
   * street or its own record (`commune: { codePostal, libelle }`, the shape
   * FFBB's own API types give a salle), so both are read.
   */
  private readLocality(object: Record<string, unknown>): string | null {
    let postal = this.readString(object, VENUE_POSTAL_KEYS);
    let city = this.readString(object, VENUE_CITY_KEYS);
    for (const key of VENUE_CITY_KEYS) {
      const nested = object[key];
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) continue;
      const commune = nested as Record<string, unknown>;
      postal ??= this.readString(commune, VENUE_POSTAL_KEYS);
      city ??= this.readString(commune, [...VENUE_GENERIC_NAME_KEYS, ...VENUE_CITY_KEYS]);
      break;
    }
    const locality = [postal, city].filter((part): part is string => part !== null).join(' ');
    return locality || null;
  }

  private readStreet(object: Record<string, unknown>): string | null {
    const street = this.readString(object, VENUE_STREET_KEYS);
    if (street) return street;
    const streetName = this.readString(object, [VENUE_STREET_NAME_KEY]);
    if (!streetName) return null;
    const streetNumber = this.readString(object, [VENUE_STREET_NUMBER_KEY]);
    return streetNumber ? `${streetNumber} ${streetName}` : streetName;
  }

  private readString(object: Record<string, unknown>, keys: readonly string[]): string | null {
    for (const key of keys) {
      const value = object[key];
      if (typeof value !== 'string' && typeof value !== 'number') continue;
      const text = String(value).replace(/\s+/g, ' ').trim();
      if (text.length === 0 || this.isGenericLabel(text)) continue;
      return text;
    }
    return null;
  }

  /** True for a value that is just the field's own category word — a UI label the page renders next to the data, not the data. */
  private isGenericLabel(text: string): boolean {
    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[:.]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return GENERIC_VENUE_WORDS.has(normalized);
  }

  private async runWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        await worker(items[index]);
      }
    });
    await Promise.all(runners);
  }

  private extractCompetitionLabel(rawMatches: RawFfbbMatch[]): string | null {
    for (const raw of rawMatches) {
      for (const key of COMPETITION_LABEL_CANDIDATE_KEYS) {
        const value = raw[key];
        if (typeof value === 'string' && value.trim().length > 0) {
          return value.trim();
        }
      }
    }
    return null;
  }
}
