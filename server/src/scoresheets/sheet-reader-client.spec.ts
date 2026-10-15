import { ConfigService } from '@nestjs/config';
import { SheetReaderClient } from './sheet-reader-client';

const sheet = {
  homeScore: 2,
  awayScore: 0,
  quarterScores: [],
  players: [],
  scoringPlays: [],
};

function clientWith(url: string | undefined): SheetReaderClient {
  return new SheetReaderClient({ get: () => url } as unknown as ConfigService);
}

describe('SheetReaderClient', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('does nothing without SCORESHEET_READER_URL', async () => {
    expect(await clientWith(undefined).readEmarqueBasketball(Buffer.from('%PDF'))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the PDF and returns the parsed sheet', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(sheet), { status: 200 }));
    const read = await clientWith('http://sheet-reader:8000').readEmarqueBasketball(
      Buffer.from('%PDF'),
    );
    expect(read).toEqual(sheet);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://sheet-reader:8000/read/emarque-basketball');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'content-type': 'application/pdf' });
  });

  it.each([
    ['a refusal', () => new Response(JSON.stringify({ detail: { reason: 'x' } }), { status: 422 })],
    ['a server error', () => new Response('boom', { status: 500 })],
    ['a body that is not a sheet', () => new Response(JSON.stringify({}), { status: 200 })],
  ])('returns null on %s', async (_label, response) => {
    fetchMock.mockResolvedValue(response());
    expect(await clientWith('http://r').readEmarqueBasketball(Buffer.from('%PDF'))).toBeNull();
  });

  it('returns null when the service is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await clientWith('http://r').readEmarqueBasketball(Buffer.from('%PDF'))).toBeNull();
  });
});
