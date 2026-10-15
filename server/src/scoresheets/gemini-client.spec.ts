import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiClient } from './gemini-client';

jest.mock('@google/generative-ai', () => {
  const actual = jest.requireActual('@google/generative-ai');
  return { ...actual, GoogleGenerativeAI: jest.fn() };
});

describe('GeminiClient', () => {
  let generateContent: jest.Mock;
  let getGenerativeModel: jest.Mock;
  let client: GeminiClient;

  beforeEach(() => {
    generateContent = jest.fn();
    getGenerativeModel = jest.fn().mockReturnValue({ generateContent });
    (GoogleGenerativeAI as unknown as jest.Mock).mockImplementation(() => ({
      getGenerativeModel,
    }));

    const config = { get: () => 'test-api-key' } as unknown as ConfigService;
    client = new GeminiClient(config);
  });

  it('constructs the SDK client with the configured API key', () => {
    expect(GoogleGenerativeAI).toHaveBeenCalledWith('test-api-key');
  });

  it('sends the image as inline base64 data alongside the prompt, requesting structured JSON output', async () => {
    const parsedData = {
      homeScore: 60,
      awayScore: 55,
      quarterScores: [],
      players: [],
      scoringPlays: [],
    };
    generateContent.mockResolvedValue({ response: { text: () => JSON.stringify(parsedData) } });

    const result = await client.extractScoresheet(Buffer.from('fake-image'), 'image/jpeg');

    expect(getGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.6-flash',
        generationConfig: expect.objectContaining({ responseMimeType: 'application/json' }),
      }),
    );
    expect(generateContent).toHaveBeenCalledWith([
      expect.any(String),
      {
        inlineData: { data: Buffer.from('fake-image').toString('base64'), mimeType: 'image/jpeg' },
      },
    ]);
    expect(result).toEqual({ parsedData, rawResponse: parsedData });
  });

  it('asks for the running-score column, where the points notation lives', async () => {
    generateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ scoringPlays: [] }) },
    });

    await client.extractScoresheet(Buffer.from('fake-image'), 'image/jpeg');

    const [prompt] = generateContent.mock.calls[0][0] as [string];
    expect(prompt).toContain('MARQUE COURANTE');
    expect(prompt).toMatch(/circle -> 3 points/);
    expect(prompt).toMatch(/no circle -> 2 points/);
    expect(prompt).toMatch(/dot\/point -> 1 point/);

    const schema = getGenerativeModel.mock.calls[0][0].generationConfig.responseSchema;
    expect(schema.required).toContain('scoringPlays');
    expect(Object.keys(schema.properties.scoringPlays.items.properties)).toEqual([
      'team',
      'jerseyNumber',
      'points',
      'runningScore',
    ]);
  });
});
