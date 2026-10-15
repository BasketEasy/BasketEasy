import type { ConfigService } from '@nestjs/config';
import { OrsRoutingClient } from './ors-routing.client';

describe('OrsRoutingClient', () => {
  const config = { get: jest.fn().mockReturnValue('ors-key') } as unknown as ConfigService;
  let fetchMock: jest.Mock;
  let client: OrsRoutingClient;

  function respond(status: number, body: unknown): void {
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  }

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new OrsRoutingClient(config);
  });

  it('geocodes within France and flips ORS [lng, lat] into latitude/longitude', async () => {
    respond(200, { features: [{ geometry: { coordinates: [-1.55, 47.21] } }] });

    await expect(client.geocode('Salle Coubertin')).resolves.toEqual({
      latitude: 47.21,
      longitude: -1.55,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/geocode/search?');
    expect(url).toContain('boundary.country=FR');
    expect(init.headers).toMatchObject({ Authorization: 'ors-key' });
  });

  it('answers null for an address with no match', async () => {
    respond(200, { features: [] });
    await expect(client.geocode('zzz')).resolves.toBeNull();
  });

  it('sends start/end as lng,lat and rounds the duration up to whole minutes', async () => {
    respond(200, { features: [{ properties: { summary: { duration: 1381 } } }] });

    await expect(
      client.drivingMinutes(
        { latitude: 47.2, longitude: -1.5 },
        { latitude: 47.1, longitude: -1.6 },
      ),
    ).resolves.toBe(24);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('start=-1.5%2C47.2');
    expect(url).toContain('end=-1.6%2C47.1');
  });

  it('reads a route without a duration as zero minutes (meeting point is the gym)', async () => {
    respond(200, { features: [{ properties: { summary: {} } }] });
    await expect(
      client.drivingMinutes({ latitude: 1, longitude: 1 }, { latitude: 1, longitude: 1 }),
    ).resolves.toBe(0);
  });

  it('answers null when ORS cannot build a route (404)', async () => {
    respond(404, {});
    await expect(
      client.drivingMinutes({ latitude: 1, longitude: 1 }, { latitude: 2, longitude: 2 }),
    ).resolves.toBeNull();
  });

  it('throws on a provider failure so the caller can retry', async () => {
    respond(503, {});
    await expect(client.geocode('Salle A')).rejects.toThrow('OpenRouteService 503');
  });
});
