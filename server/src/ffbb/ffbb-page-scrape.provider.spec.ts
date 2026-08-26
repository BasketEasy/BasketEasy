import { ConfigService } from '@nestjs/config';
import { FfbbPageFormatError } from './ffbb-provider';
import { FfbbPageScrapeProvider } from './ffbb-page-scrape.provider';

const OUR_ENGAGEMENT_ID = '200000005346381';
const ENGAGEMENT_URL = `https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/${OUR_ENGAGEMENT_ID}`;
const ENGAGEMENT_REF = `ligues/pdl/comites/0044/clubs/pdl0044190/equipes/${OUR_ENGAGEMENT_ID}`;

function pushChunkHtml(payload: unknown): string {
  const rscText = `2:${JSON.stringify(payload)}\n`;
  return `<html><body><script>self.__next_f.push([1,${JSON.stringify(rscText)}])</script></body></html>`;
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
});
