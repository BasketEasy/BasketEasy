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
