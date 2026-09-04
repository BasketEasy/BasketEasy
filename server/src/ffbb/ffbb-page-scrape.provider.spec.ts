import { ConfigService } from '@nestjs/config';
import { FfbbPageFormatError } from './ffbb-provider';
import { FfbbPageScrapeProvider } from './ffbb-page-scrape.provider';

const OUR_ENGAGEMENT_ID = '200000005346381';
const ENGAGEMENT_URL = `https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/${OUR_ENGAGEMENT_ID}`;
const ENGAGEMENT_REF = `ligues/pdl/comites/0044/clubs/pdl0044190/equipes/${OUR_ENGAGEMENT_ID}`;

function pushChunkHtml(payload: unknown, extraRscText = ''): string {
  const rscText = `2:${JSON.stringify(payload)}${extraRscText}\n`;
  return `<html><body><script>self.__next_f.push([1,${JSON.stringify(rscText)}])</script></body></html>`;
}

const DETAIL_PREFIX = 'ligues/pdl/comites/0044/competitions/dm3/match/';

function rawMatch(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    date_rencontre: '2026-09-20T14:00:00',
    joue: false,
    idEngagementEquipe1: { id: OUR_ENGAGEMENT_ID, nom: 'BASKET CLUB BASSE GOULAINE' },
    idEngagementEquipe2: { id: '200000005346379', nom: 'NANTES SULLY BASKET' },
    ...overrides,
  };
}

/** A detail page whose venue sits under a `salle` key, the shape the fixture-list page never carries. */
function detailPageHtml(venue: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return pushChunkHtml({ rencontre: { id: 'whatever', salle: venue, ...extra } });
}

/** Routes the fixture-list URL to one page and every other URL to a detail page. */
function routeFetch(
  fetchSpy: jest.SpyInstance,
  listHtml: string,
  detailHtml: (url: string) => string | Response,
) {
  fetchSpy.mockImplementation(async (input: unknown) => {
    const url = String(input);
    if (url.endsWith(ENGAGEMENT_REF)) return fakeResponse({ text: async () => listHtml });
    const detail = detailHtml(url);
    return typeof detail === 'string' ? fakeResponse({ text: async () => detail }) : detail;
  });
}

function fakeResponse(
  overrides: Partial<{ ok: boolean; status: number; text: () => Promise<string> }>,
): Response {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    ...overrides,
  } as unknown as Response;
}

describe('FfbbPageScrapeProvider', () => {
  let provider: FfbbPageScrapeProvider;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    provider = new FfbbPageScrapeProvider(config);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parseEngagementRef', () => {
    it('accepts the real URL shape and returns the path without origin', () => {
      expect(provider.parseEngagementRef(ENGAGEMENT_URL)).toBe(ENGAGEMENT_REF);
    });

    it('rejects a bare id', () => {
      expect(provider.parseEngagementRef(OUR_ENGAGEMENT_ID)).toBeNull();
    });

    it('rejects a malformed URL', () => {
      expect(provider.parseEngagementRef('https://competitions.ffbb.com/equipes/123')).toBeNull();
    });
  });

  describe('getMatchesForEngagement', () => {
    it('extracts fields including nested nom and the 00:00:00-is-TBD case', async () => {
      const html = pushChunkHtml({
        data: [
          {
            id: '200000014580569',
            date_rencontre: '2026-09-20T00:00:00',
            joue: false,
            numero: '3121',
            numeroJournee: '1',
            resultatEquipe1: null,
            resultatEquipe2: null,
            idEngagementEquipe1: { id: OUR_ENGAGEMENT_ID, nom: 'BASKET CLUB BASSE GOULAINE' },
            idEngagementEquipe2: { id: '200000005346379', nom: 'NANTES SULLY BASKET' },
          },
          {
            id: '200000014580570',
            date_rencontre: '2026-09-27T14:00:00',
            joue: true,
            idEngagementEquipe1: { id: '200000005346999', nom: 'ES VERTOU BASKET' },
            idEngagementEquipe2: { id: OUR_ENGAGEMENT_ID, nom: 'BASKET CLUB BASSE GOULAINE' },
          },
        ],
      });
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF);

      expect(result.matches).toEqual([
        {
          id: '200000014580569',
          startsAt: '2026-09-20T00:00:00',
          timeConfirmed: false,
          opponentLabel: 'NANTES SULLY BASKET',
          isHome: true,
          location: null,
          played: false,
        },
        {
          id: '200000014580570',
          startsAt: '2026-09-27T14:00:00',
          timeConfirmed: true,
          opponentLabel: 'ES VERTOU BASKET',
          isHome: false,
          location: null,
          played: true,
        },
      ]);
    });

    it('reads a competition label from a recognized candidate field when present', async () => {
      const html = pushChunkHtml({
        data: [
          {
            id: '1',
            date_rencontre: '2026-09-20T14:00:00',
            joue: false,
            libelleCompetition: 'Championnat — Seniors M D3',
            idEngagementEquipe1: { id: OUR_ENGAGEMENT_ID, nom: 'US' },
            idEngagementEquipe2: { id: '2', nom: 'THEM' },
          },
        ],
      });
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF);

      expect(result.competitionLabel).toBe('Championnat — Seniors M D3');
    });

    it('returns a null competition label when no candidate field is present', async () => {
      const html = pushChunkHtml({
        data: [
          {
            id: '1',
            date_rencontre: '2026-09-20T14:00:00',
            joue: false,
            idEngagementEquipe1: { id: OUR_ENGAGEMENT_ID, nom: 'US' },
            idEngagementEquipe2: { id: '2', nom: 'THEM' },
          },
        ],
      });
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF);

      expect(result.competitionLabel).toBeNull();
    });

    it('throws FfbbPageFormatError when the page has no recognizable match-data array', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ text: async () => '<html><body>nothing here</body></html>' }),
      );

      await expect(provider.getMatchesForEngagement(ENGAGEMENT_REF)).rejects.toThrow(
        FfbbPageFormatError,
      );
    });

    it('skips an earlier mismatched "data":[...] array (e.g. the club\'s other teams) and finds the real match list', async () => {
      // Confirmed shape (2026-09-04 capture of a real team engagement page,
      // see PR description): a "data":[...] array listing the club's other
      // teams (competition switcher, no date_rencontre field) sits earlier
      // in the very same chunk as the real match list — the original bug
      // this repros: extractDataArray only checked the first occurrence and
      // gave up rather than continuing to scan.
      const otherTeamsArray = JSON.stringify([
        { id: 'x', numeroEquipe: '1', categorie: 'SE', competition: 'PNF' },
      ]);
      const matchesArray = JSON.stringify([
        {
          id: '1',
          date_rencontre: '2026-09-20T14:00:00',
          joue: false,
          idEngagementEquipe1: { id: OUR_ENGAGEMENT_ID, nom: 'US' },
          idEngagementEquipe2: { id: '2', nom: 'THEM' },
        },
      ]);
      const rscText = `2:{"data":${otherTeamsArray}}\n3:{"data":${matchesArray}}\n`;
      const html = `<html><body><script>self.__next_f.push([1,${JSON.stringify(rscText)}])</script></body></html>`;
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF);

      expect(result.matches).toHaveLength(1);
    });

    it('throws FfbbPageFormatError when a match references neither side of the engagement', async () => {
      const html = pushChunkHtml({
        data: [
          {
            id: '1',
            date_rencontre: '2026-09-20T14:00:00',
            joue: false,
            idEngagementEquipe1: { id: 'someone-else', nom: 'US' },
            idEngagementEquipe2: { id: 'someone-else-2', nom: 'THEM' },
          },
        ],
      });
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      await expect(provider.getMatchesForEngagement(ENGAGEMENT_REF)).rejects.toThrow(
        FfbbPageFormatError,
      );
    });

    it('throws FfbbPageFormatError on a non-ok HTTP status', async () => {
      fetchSpy.mockResolvedValue(fakeResponse({ ok: false, status: 404 }));

      await expect(provider.getMatchesForEngagement(ENGAGEMENT_REF)).rejects.toThrow(
        FfbbPageFormatError,
      );
    });

    it('throws FfbbPageFormatError when the network request itself fails', async () => {
      fetchSpy.mockRejectedValue(new Error('network down'));

      await expect(provider.getMatchesForEngagement(ENGAGEMENT_REF)).rejects.toThrow(
        FfbbPageFormatError,
      );
    });
  });

  describe('pouleRef', () => {
    // Confirmed shape (2026-09-04 capture of a real team engagement page,
    // see PR description): rencontre rows in the page's own `data` array
    // never carry `idPoule` — only a sibling `dataEngagement.idPoule` object
    // does. `competitionId` (the phase id) IS still on the match row. See
    // docs/superpowers/specs/2026-09-03-poule-weekend-results-design.md.
    it('derives it from a match detail link, a raw match competitionId, and dataEngagement.idPoule', async () => {
      const html = pushChunkHtml({
        data: [
          {
            id: '200000014580569',
            date_rencontre: '2026-09-20T14:00:00',
            joue: false,
            idEngagementEquipe1: { id: OUR_ENGAGEMENT_ID, nom: 'US' },
            idEngagementEquipe2: { id: '200000005346379', nom: 'THEM' },
            competitionId: { id: '200000002897998' },
          },
        ],
        dataEngagement: { idPoule: { id: '200000003056186', nom: 'Poule A' } },
        // A detail link anywhere in the page's chunks supplies the competition
        // prefix — same field the venue-resolution code path already reads.
        detailLink: `${DETAIL_PREFIX}200000014580569`,
      });
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF);

      expect(result.pouleRef).toBe(
        'ligues/pdl/comites/0044/competitions/dm3?phase=200000002897998&poule=200000003056186',
      );
    });

    it('is null when dataEngagement carries no idPoule', async () => {
      const html = pushChunkHtml({
        data: [
          {
            id: '1',
            date_rencontre: '2026-09-20T14:00:00',
            joue: false,
            idEngagementEquipe1: { id: OUR_ENGAGEMENT_ID, nom: 'US' },
            idEngagementEquipe2: { id: '2', nom: 'THEM' },
            competitionId: { id: '200000002897998' },
          },
        ],
        detailLink: `${DETAIL_PREFIX}1`,
      });
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF);

      expect(result.pouleRef).toBeNull();
    });

    it('is null when no fetched match carries a resolvable competitionId', async () => {
      const html = pushChunkHtml({
        data: [
          {
            id: '1',
            date_rencontre: '2026-09-20T14:00:00',
            joue: false,
            idEngagementEquipe1: { id: OUR_ENGAGEMENT_ID, nom: 'US' },
            idEngagementEquipe2: { id: '2', nom: 'THEM' },
          },
        ],
        dataEngagement: { idPoule: { id: '200000003056186', nom: 'Poule A' } },
        detailLink: `${DETAIL_PREFIX}1`,
      });
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF);

      expect(result.pouleRef).toBeNull();
    });

    it('is null when the page carries no match detail link at all', async () => {
      const html = pushChunkHtml({
        data: [
          {
            id: '1',
            date_rencontre: '2026-09-20T14:00:00',
            joue: false,
            idEngagementEquipe1: { id: OUR_ENGAGEMENT_ID, nom: 'US' },
            idEngagementEquipe2: { id: '2', nom: 'THEM' },
            competitionId: { id: '200000002897998' },
          },
        ],
        dataEngagement: { idPoule: { id: '200000003056186', nom: 'Poule A' } },
      });
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF);

      expect(result.pouleRef).toBeNull();
    });

    it('is null when the fetch returned zero matches', async () => {
      const html = pushChunkHtml({ data: [] });
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF);

      expect(result.pouleRef).toBeNull();
    });
  });

  describe('getPouleStandings', () => {
    const POULE_REF =
      'ligues/pdl/comites/0044/competitions/dm3?phase=200000002897998&poule=200000003056186';
    const OUR_ID = OUR_ENGAGEMENT_ID;

    function poulePageHtml(poules: unknown[]): string {
      return pushChunkHtml({ poules });
    }

    function classementRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'c1',
        idEngagement: { id: OUR_ID, nom: 'BASKET CLUB BASSE GOULAINE' },
        matchJoues: '3',
        points: '5',
        position: '2',
        gagnes: '2',
        perdus: '1',
        ...overrides,
      };
    }

    it('rejects a pouleRef that is not the confirmed shape', async () => {
      await expect(provider.getPouleStandings('not-a-poule-ref', OUR_ID)).rejects.toThrow(
        FfbbPageFormatError,
      );
    });

    it('throws when no poule in the fetched payload matches the ref', async () => {
      const html = poulePageHtml([
        { id: 'some-other-poule', nom: 'Poule Z', rencontres: [], classements: [] },
      ]);
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      await expect(provider.getPouleStandings(POULE_REF, OUR_ID)).rejects.toThrow(
        FfbbPageFormatError,
      );
    });

    it('rejects the lightweight bare-id poules index and keeps scanning later chunks for the real one', async () => {
      // A different self.__next_f.push chunk than the fully hydrated one,
      // mirroring how getMatchesForEngagement's own multi-chunk fallback
      // already works for "data":[...].
      const indexChunk = `1:${JSON.stringify({ poules: ['200000003056186', '200000003056187'] })}\n`;
      const detailChunk = `2:${JSON.stringify({
        poules: [
          { id: '200000003056186', nom: 'Poule A', rencontres: [], classements: [classementRow()] },
        ],
      })}\n`;
      const html =
        `<html><body>` +
        `<script>self.__next_f.push([1,${JSON.stringify(indexChunk)}])</script>` +
        `<script>self.__next_f.push([1,${JSON.stringify(detailChunk)}])</script>` +
        `</body></html>`;
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getPouleStandings(POULE_REF, OUR_ID);

      expect(result.standings).toHaveLength(1);
    });

    it('keeps scanning past multiple mismatched "poules" arrays within the SAME chunk', async () => {
      // Confirmed shape (2026-09-04 capture of a real poule standings page,
      // see PR description): all three "poules":[...] occurrences — a
      // bare-id index, an id/nom-only summary, and the fully hydrated array
      // — live in one single self.__next_f.push chunk, not separate ones.
      const chunk =
        `1:${JSON.stringify({ poules: ['200000003056186', '200000003056187'] })}\n` +
        `2:${JSON.stringify({
          poules: [{ id: '200000003056186', nom: 'Poule A' }],
        })}\n` +
        `3:${JSON.stringify({
          poules: [
            {
              id: '200000003056186',
              nom: 'Poule A',
              rencontres: [],
              classements: [classementRow()],
            },
          ],
        })}\n`;
      const html = `<html><body><script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script></body></html>`;
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getPouleStandings(POULE_REF, OUR_ID);

      expect(result.standings).toHaveLength(1);
    });

    it('maps and sorts standings by position, flagging our own team', async () => {
      const html = poulePageHtml([
        {
          id: '200000003056186',
          nom: 'Poule A',
          rencontres: [],
          classements: [
            classementRow({
              id: 'c1',
              idEngagement: { id: 'someone-else', nom: 'Vertou Basket Club' },
              position: '1',
              points: '6',
            }),
            classementRow({ id: 'c2', position: '2', points: '5' }),
          ],
        },
      ]);
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getPouleStandings(POULE_REF, OUR_ID);

      expect(result.standings).toEqual([
        {
          teamLabel: 'Vertou Basket Club',
          played: 3,
          won: 2,
          lost: 1,
          points: 6,
          isOurTeam: false,
        },
        {
          teamLabel: 'BASKET CLUB BASSE GOULAINE',
          played: 3,
          won: 2,
          lost: 1,
          points: 5,
          isOurTeam: true,
        },
      ]);
    });

    it('skips a malformed classement row rather than failing the whole listing', async () => {
      const html = poulePageHtml([
        {
          id: '200000003056186',
          nom: 'Poule A',
          rencontres: [],
          classements: [classementRow({ id: 'bad', matchJoues: 'not-a-number' }), classementRow()],
        },
      ]);
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getPouleStandings(POULE_REF, OUR_ID);

      expect(result.standings).toHaveLength(1);
    });

    it('returns empty standings/results for a poule whose season has not started', async () => {
      const html = poulePageHtml([
        { id: '200000003056186', nom: 'Poule A', rencontres: [], classements: [] },
      ]);
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getPouleStandings(POULE_REF, OUR_ID);

      expect(result).toEqual({ standings: [], latestResults: [] });
    });

    it('derives latestResults from the highest journée with a played match, excluding a postponed match sharing that journée', async () => {
      const html = poulePageHtml([
        {
          id: '200000003056186',
          nom: 'Poule A',
          classements: [],
          rencontres: [
            {
              id: 'm1',
              numeroJournee: '2',
              joue: true,
              resultatEquipe1: 68,
              resultatEquipe2: 61,
              idEngagementEquipe1: { id: OUR_ID, nom: 'BASKET CLUB BASSE GOULAINE' },
              idEngagementEquipe2: { id: 'x', nom: 'NANTES SULLY BASKET' },
            },
            {
              id: 'm2',
              numeroJournee: '2',
              joue: false,
              resultatEquipe1: null,
              resultatEquipe2: null,
              idEngagementEquipe1: { id: 'y', nom: 'AS Rezé Basket' },
              idEngagementEquipe2: { id: 'z', nom: 'Vertou Basket Club' },
            },
            {
              id: 'm0',
              numeroJournee: '1',
              joue: true,
              resultatEquipe1: 40,
              resultatEquipe2: 30,
              idEngagementEquipe1: { id: 'y', nom: 'AS Rezé Basket' },
              idEngagementEquipe2: { id: 'z', nom: 'Vertou Basket Club' },
            },
          ],
        },
      ]);
      fetchSpy.mockResolvedValue(fakeResponse({ text: async () => html }));

      const result = await provider.getPouleStandings(POULE_REF, OUR_ID);

      expect(result.latestResults).toEqual([
        {
          matchdayLabel: 'Journée 2',
          homeLabel: 'BASKET CLUB BASSE GOULAINE',
          awayLabel: 'NANTES SULLY BASKET',
          homeScore: 68,
          awayScore: 61,
          involvesOurTeam: true,
        },
      ]);
    });
  });

  describe('venue resolution', () => {
    it('leaves location null and fetches nothing extra when resolveVenues is off', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ text: async () => pushChunkHtml({ data: [rawMatch('m-1')] }) }),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF);

      expect(result.matches[0].location).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('follows the detail link carried on the match row and formats the venue', async () => {
      const listHtml = pushChunkHtml({
        data: [
          rawMatch('200000014580569', {
            lien: `https://competitions.ffbb.com/${DETAIL_PREFIX}200000014580569`,
          }),
        ],
      });
      routeFetch(fetchSpy, listHtml, () =>
        detailPageHtml({
          libelleSalle: 'Salle de la Herdrie',
          adresse: '12 rue des Sports',
          codePostal: '44115',
          ville: 'Basse-Goulaine',
        }),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBe(
        'Salle de la Herdrie, 12 rue des Sports, 44115 Basse-Goulaine',
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        `https://competitions.ffbb.com/${DETAIL_PREFIX}200000014580569`,
        expect.anything(),
      );
    });

    it('finds the detail link in the page payload when the match row has none', async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () => detailPageHtml({ libelle: 'Gymnase du Loquidy' }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBe('Gymnase du Loquidy');
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        `https://competitions.ffbb.com/${DETAIL_PREFIX}m-1`,
        expect.anything(),
      );
    });

    it("reuses another row's detail path prefix for a match whose own link is missing", async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1'), rawMatch('m-2')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      const fetched: string[] = [];
      routeFetch(fetchSpy, listHtml, (url) => {
        fetched.push(url);
        return detailPageHtml({ libelle: 'Salle Mangin' });
      });

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches.map((m) => m.location)).toEqual(['Salle Mangin', 'Salle Mangin']);
      expect(fetched.sort()).toEqual([
        `https://competitions.ffbb.com/${DETAIL_PREFIX}m-1`,
        `https://competitions.ffbb.com/${DETAIL_PREFIX}m-2`,
      ]);
    });

    it('fetches nothing when the page carries no detail link at all', async () => {
      fetchSpy.mockResolvedValue(
        fakeResponse({ text: async () => pushChunkHtml({ data: [rawMatch('m-1')] }) }),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('never fetches a detail page for an already-played match', async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1', { joue: true }), rawMatch('m-2')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      const fetched: string[] = [];
      routeFetch(fetchSpy, listHtml, (url) => {
        fetched.push(url);
        return detailPageHtml({ libelle: 'Salle Mangin' });
      });

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBeNull();
      expect(fetched).toEqual([`https://competitions.ffbb.com/${DETAIL_PREFIX}m-2`]);
    });

    it('uses a venue carried on the fixture row itself instead of fetching the detail page', async () => {
      const listHtml = pushChunkHtml(
        {
          data: [
            rawMatch('m-1', {
              salle: { libelle: 'Salle Jean Guimier', ville: 'Nantes' },
            }),
          ],
        },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () => detailPageHtml({ libelle: 'Autre salle' }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBe('Salle Jean Guimier, Nantes');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('leaves one match without a venue when its detail page fails, keeping the others', async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1'), rawMatch('m-2'), rawMatch('m-3')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, (url) => {
        if (url.endsWith('m-1')) throw new Error('network down');
        if (url.endsWith('m-2')) return fakeResponse({ ok: false, status: 404 });
        return '<html><body>a page with no payload</body></html>';
      });

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches.map((m) => m.location)).toEqual([null, null, null]);
    });

    it('prefers the gym over a club postal address published on the same page', async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () =>
        pushChunkHtml({
          rencontre: {
            club: { nom: 'BASKET CLUB BASSE GOULAINE', adresse: '1 rue du Club', ville: 'Nantes' },
            salle: {
              libelle: 'Salle de la Herdrie',
              adresse: '12 rue des Sports',
              ville: 'Basse-Goulaine',
            },
          },
        }),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBe(
        'Salle de la Herdrie, 12 rue des Sports, Basse-Goulaine',
      );
    });

    it.each([
      [{ nomSalle: 'Complexe sportif' }, 'Complexe sportif'],
      [{ adresse1: '3 allée des Tilleuls', commune: 'Vertou' }, '3 allée des Tilleuls, Vertou'],
      [
        {
          libelle: 'Salle Pierre de Coubertin',
          numeroVoie: '5',
          libelleVoie: 'rue du Stade',
          cp: '44120',
        },
        'Salle Pierre de Coubertin, 5 rue du Stade, 44120',
      ],
      [
        { rue: '8 boulevard des Sports', codePostal: 44300, ville: 'Nantes' },
        '8 boulevard des Sports, 44300 Nantes',
      ],
      [{ horaire: '20:30' }, null],
    ])('formats the venue shape %j as %s', async (venue, expected) => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () => detailPageHtml(venue));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBe(expected);
    });

    it("ignores a club's mailing address published as an array element", async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () =>
        pushChunkHtml({
          rencontre: {
            organismes: [
              {
                nom: 'BC BASSE GOULAINE',
                adresse: '1 rue du Club',
                codePostal: '44115',
                ville: 'Nantes',
              },
            ],
          },
        }),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBeNull();
    });

    it("picks the home team's gym when the page carries both teams' venues", async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () =>
        pushChunkHtml({
          rencontre: {
            // Visiting side first: without side-awareness the tie would be
            // broken by serialization order and send the team to the wrong gym.
            equipeVisiteuse: { salle: { libelle: 'Salle des visiteurs', ville: 'Vertou' } },
            equipeRecevante: { salle: { libelle: 'Salle de la Herdrie', ville: 'Basse-Goulaine' } },
          },
        }),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBe('Salle de la Herdrie, Basse-Goulaine');
    });

    it('still reads a row-carried venue for matches past the detail-fetch cap', async () => {
      const matches = Array.from({ length: 62 }, (_, i) =>
        rawMatch(`m-${i}`, i === 61 ? { salle: { libelle: 'Salle Mangin' } } : {}),
      );
      const listHtml = pushChunkHtml({ data: matches }, `,{"href":"/${DETAIL_PREFIX}m-0"}`);
      routeFetch(fetchSpy, listHtml, () => detailPageHtml({ libelle: 'Salle du détail' }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[61].location).toBe('Salle Mangin');
      expect(fetchSpy).toHaveBeenCalledTimes(61);
    });

    it('never imports a UI label map as the venue', async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () =>
        // The page ships its column headers in the same payload as its data.
        pushChunkHtml({
          rencontre: { labels: { salle: 'Salle', adresse: 'Adresse', ville: 'Ville' } },
        }),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBeNull();
    });

    it('reads the real venue even when labels sit beside it in the payload', async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () =>
        pushChunkHtml({
          rencontre: {
            labels: { salle: 'Salle' },
            salle: {
              libelle: 'Salle de la Herdrie',
              adresse: '12 rue des Sports',
              ville: 'Basse-Goulaine',
            },
          },
        }),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBe(
        'Salle de la Herdrie, 12 rue des Sports, Basse-Goulaine',
      );
    });

    // Built from a live competitions.ffbb.com match detail page (2026-09-01):
    // the venue is published as a typed label/value group, and the page's own
    // i18n dictionary ("salle":"Salle") sits in the same payload.
    const realDetailPayload = (addressValue: unknown) => ({
      data: {
        informations: [
          {
            type: 'salle',
            informations: [
              { type: 'text', label: 'Nom', value: 'GYMNASE DE LA CHESNAIE' },
              { type: 'address', label: 'Adresse', value: addressValue },
            ],
          },
          {
            type: 'officiels',
            informations: [{ type: 'text', label: 'Arbitre', value: 'MARTIN Paul' }],
          },
        ],
      },
      i18nTranslations: { address: 'Adresse', room: 'Salle', salle: 'Salle' },
    });

    it('reads the venue out of the detail page shape FFBB actually publishes', async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () =>
        pushChunkHtml(realDetailPayload('12 RUE DES SPORTS, 44115 BASSE-GOULAINE')),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBe(
        'GYMNASE DE LA CHESNAIE, 12 RUE DES SPORTS, 44115 BASSE-GOULAINE',
      );
    });

    it('reads the same group when the address item holds an object instead of a string', async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () =>
        pushChunkHtml(
          realDetailPayload({
            address: '12 RUE DES SPORTS',
            zipCode: '44115',
            city: 'BASSE-GOULAINE',
          }),
        ),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBe(
        'GYMNASE DE LA CHESNAIE, 12 RUE DES SPORTS, 44115 BASSE-GOULAINE',
      );
    });

    it('falls back to the name alone when the group publishes no address yet', async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () =>
        pushChunkHtml({
          data: {
            informations: [
              {
                type: 'salle',
                informations: [{ type: 'text', label: 'Nom', value: 'GYMNASE DE LA CHESNAIE' }],
              },
            ],
          },
          i18nTranslations: { room: 'Salle', salle: 'Salle' },
        }),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBe('GYMNASE DE LA CHESNAIE');
    });

    it('takes the salle group, not another informations group on the same page', async () => {
      const listHtml = pushChunkHtml(
        { data: [rawMatch('m-1')] },
        `,{"href":"/${DETAIL_PREFIX}m-1"}`,
      );
      routeFetch(fetchSpy, listHtml, () =>
        pushChunkHtml({
          data: {
            informations: [
              {
                type: 'correspondant',
                informations: [
                  { type: 'text', label: 'Nom', value: 'DUPONT Jean' },
                  { type: 'address', label: 'Adresse', value: '1 RUE DU CLUB, 44000 NANTES' },
                ],
              },
              {
                type: 'salle',
                informations: [
                  { type: 'text', label: 'Nom', value: 'GYMNASE DE LA CHESNAIE' },
                  { type: 'address', label: 'Adresse', value: '12 RUE DES SPORTS' },
                ],
              },
            ],
          },
        }),
      );

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      expect(result.matches[0].location).toBe('GYMNASE DE LA CHESNAIE, 12 RUE DES SPORTS');
    });

    it('caps how many detail pages one engagement may fetch', async () => {
      const matches = Array.from({ length: 65 }, (_, i) => rawMatch(`m-${i}`));
      const listHtml = pushChunkHtml({ data: matches }, `,{"href":"/${DETAIL_PREFIX}m-0"}`);
      routeFetch(fetchSpy, listHtml, () => detailPageHtml({ libelle: 'Salle Mangin' }));

      const result = await provider.getMatchesForEngagement(ENGAGEMENT_REF, {
        resolveVenues: true,
      });

      // 60 detail pages plus the fixture list itself.
      expect(fetchSpy).toHaveBeenCalledTimes(61);
      expect(result.matches.filter((m) => m.location !== null)).toHaveLength(60);
    });
  });
});
