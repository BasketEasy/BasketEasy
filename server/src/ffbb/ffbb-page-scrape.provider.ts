import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FfbbEngagementFetchResult,
  FfbbMatch,
  FfbbPageFormatError,
  FfbbProvider,
} from './ffbb-provider';

const DEFAULT_FFBB_BASE_URL = 'https://competitions.ffbb.com';

// `ligues/<x>/comites/<y>/clubs/<z>/equipes/<id>` is the only path shape
// FFBB's site resolves — a bare id 404s (confirmed during this design's
// research), so the full path is what gets stored and re-fetched.
const ENGAGEMENT_PATH_PATTERN =
  /^https:\/\/competitions\.ffbb\.com\/(ligues\/[A-Za-z0-9-]+\/comites\/[A-Za-z0-9-]+\/clubs\/[A-Za-z0-9-]+\/equipes\/(\d+))\/?(?:[?#].*)?$/;

const TRAILING_ENGAGEMENT_ID_PATTERN = /\/equipes\/(\d+)\/?$/;

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
  idEngagementEquipe1?: { id?: unknown; nom?: unknown } | null;
  idEngagementEquipe2?: { id?: unknown; nom?: unknown } | null;
  [key: string]: unknown;
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
 * Extraction here is verified against a fixture built from the design
 * spec's documented sample payload, not a live fetch: this sandbox's
 * network policy blocks egress to competitions.ffbb.com, so the exact
 * real-world chunk boundaries and field set are unconfirmed pending a real
 * fetch at deploy time. Any shape it doesn't recognize throws
 * FfbbPageFormatError rather than guessing — this is deliberately the one
 * file expected to need updates when FFBB's frontend changes.
 */
@Injectable()
export class FfbbPageScrapeProvider implements FfbbProvider {
  constructor(private readonly config: ConfigService) {}

  parseEngagementRef(url: string): string | null {
    const match = ENGAGEMENT_PATH_PATTERN.exec(url.trim());
    return match ? match[1] : null;
  }

  async getMatchesForEngagement(engagementRef: string): Promise<FfbbEngagementFetchResult> {
    const engagementIdMatch = TRAILING_ENGAGEMENT_ID_PATTERN.exec(engagementRef);
    if (!engagementIdMatch) {
      throw new FfbbPageFormatError(`Not a valid FFBB engagement ref: "${engagementRef}"`);
    }
    const engagementId = engagementIdMatch[1];

    const html = await this.fetchPage(engagementRef);
    const rawMatches = this.extractRawMatches(html);

    const matches: FfbbMatch[] = rawMatches.map((raw) => this.toFfbbMatch(raw, engagementId));
    const competitionLabel = this.extractCompetitionLabel(rawMatches);

    return { competitionLabel, matches };
  }

  private get baseUrl(): string {
    return this.config.get<string>('FFBB_BASE_URL') ?? DEFAULT_FFBB_BASE_URL;
  }

  private async fetchPage(engagementRef: string): Promise<string> {
    const url = `${this.baseUrl}/${engagementRef}`;
    let response: Response;
    try {
      response = await fetch(url, {
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
      throw new FfbbPageFormatError(`Could not reach FFBB for "${engagementRef}": ${reason}`);
    }
    if (!response.ok) {
      throw new FfbbPageFormatError(`FFBB returned ${response.status} for "${engagementRef}"`);
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
  private extractRawMatches(html: string): RawFfbbMatch[] {
    const chunks = this.extractNextFPushChunks(html);
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

  /** Finds `"data":[...]` in a decoded RSC chunk and parses the array, respecting nested brackets/strings. Returns null if this chunk doesn't contain one. */
  private extractDataArray(chunk: string): RawFfbbMatch[] | null {
    const marker = '"data":[';
    const markerIndex = chunk.indexOf(marker);
    if (markerIndex === -1) return null;
    const arrayStart = markerIndex + marker.length - 1; // position of the opening '['

    let depth = 0;
    let inString = false;
    let i = arrayStart;
    for (; i < chunk.length; i++) {
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
            if (
              !Array.isArray(parsed) ||
              parsed.some((entry) => typeof entry !== 'object' || entry === null)
            ) {
              return null;
            }
            // A false positive on "data":[...] with no match-shaped
            // entries (e.g. an unrelated array) — only trust arrays whose
            // entries actually look like matches.
            if (
              !parsed.every(
                (entry) => 'id' in (entry as object) && 'date_rencontre' in (entry as object),
              )
            ) {
              return null;
            }
            return parsed as RawFfbbMatch[];
          } catch {
            return null;
          }
        }
      }
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
