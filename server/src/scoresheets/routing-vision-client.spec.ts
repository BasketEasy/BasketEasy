import type { ParsedScoresheetData } from '@basketeasy/types/scoresheet-extraction';
import { RoutingVisionClient } from './routing-vision-client';
import type { GeminiClient } from './gemini-client';
import type { SheetReaderClient } from './sheet-reader-client';

const consistent: ParsedScoresheetData = {
  homeScore: 2,
  awayScore: 0,
  quarterScores: [],
  players: [{ team: 'home', number: 7, name: 'A', points: null, fouls: 0 }],
  scoringPlays: [{ team: 'home', jerseyNumber: 7, points: 2, runningScore: 2 }],
};
// The last marked total isn't the final score.
const inconsistent: ParsedScoresheetData = { ...consistent, homeScore: 4 };

describe('RoutingVisionClient', () => {
  let readEmarqueBasketball: jest.Mock;
  let extractScoresheet: jest.Mock;
  let client: RoutingVisionClient;

  beforeEach(() => {
    readEmarqueBasketball = jest.fn();
    extractScoresheet = jest.fn();
    client = new RoutingVisionClient(
      { readEmarqueBasketball } as unknown as SheetReaderClient,
      { extractScoresheet } as unknown as GeminiClient,
    );
  });

  const fromVision = (parsedData: ParsedScoresheetData) => ({ parsedData, rawResponse: {} });

  it('sends a photo straight to the vision model', async () => {
    extractScoresheet.mockResolvedValue(fromVision(consistent));
    await client.extractScoresheet(Buffer.from('x'), 'image/jpeg');
    expect(readEmarqueBasketball).not.toHaveBeenCalled();
    expect(extractScoresheet).toHaveBeenCalled();
  });

  it('uses a consistent deterministic read of a PDF without calling the vision model', async () => {
    readEmarqueBasketball.mockResolvedValue(consistent);
    const result = await client.extractScoresheet(Buffer.from('%PDF'), 'application/pdf');
    expect(result.parsedData).toBe(consistent);
    expect(result.rawResponse).toEqual({
      reader: 'sheet-reader/emarque-basketball',
      parsedData: consistent,
    });
    expect(extractScoresheet).not.toHaveBeenCalled();
  });

  it('falls back to the vision model when the reader declines', async () => {
    readEmarqueBasketball.mockResolvedValue(null);
    extractScoresheet.mockResolvedValue(fromVision(consistent));
    const result = await client.extractScoresheet(Buffer.from('%PDF'), 'application/pdf');
    expect(result.rawResponse).toEqual({});
  });

  it('prefers a consistent vision read over an inconsistent deterministic one', async () => {
    readEmarqueBasketball.mockResolvedValue(inconsistent);
    extractScoresheet.mockResolvedValue(fromVision(consistent));
    const result = await client.extractScoresheet(Buffer.from('%PDF'), 'application/pdf');
    expect(result.parsedData).toBe(consistent);
  });

  it('keeps the deterministic read when the vision model does no better or fails', async () => {
    readEmarqueBasketball.mockResolvedValue(inconsistent);
    extractScoresheet.mockResolvedValue(fromVision(inconsistent));
    expect(
      (await client.extractScoresheet(Buffer.from('%PDF'), 'application/pdf')).rawResponse,
    ).toMatchObject({ reader: 'sheet-reader/emarque-basketball' });

    extractScoresheet.mockRejectedValue(new Error('503 high demand'));
    expect(
      (await client.extractScoresheet(Buffer.from('%PDF'), 'application/pdf')).parsedData,
    ).toBe(inconsistent);
  });

  it('lets a vision failure through when there is nothing else', async () => {
    readEmarqueBasketball.mockResolvedValue(null);
    extractScoresheet.mockRejectedValue(new Error('503 high demand'));
    await expect(client.extractScoresheet(Buffer.from('%PDF'), 'application/pdf')).rejects.toThrow(
      '503',
    );
  });
});
