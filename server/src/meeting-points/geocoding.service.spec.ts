import { GeocodingService, NEGATIVE_GEOCODE_TTL_MS } from './geocoding.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RoutingClient } from './routing-client';

describe('GeocodingService', () => {
  let prisma: { geocodedAddress: { findUnique: jest.Mock; upsert: jest.Mock } };
  let routing: { geocode: jest.Mock; drivingMinutes: jest.Mock };
  let service: GeocodingService;

  beforeEach(() => {
    prisma = {
      geocodedAddress: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    };
    routing = { geocode: jest.fn(), drivingMinutes: jest.fn() };
    service = new GeocodingService(
      prisma as unknown as PrismaService,
      routing as unknown as RoutingClient,
    );
  });

  it('reuses a cached hit without asking the provider', async () => {
    prisma.geocodedAddress.findUnique.mockResolvedValue({
      latitude: 47.2,
      longitude: -1.5,
      resolvedAt: new Date('2020-01-01'),
    });

    await expect(service.geocode('Salle A')).resolves.toEqual({ latitude: 47.2, longitude: -1.5 });
    expect(routing.geocode).not.toHaveBeenCalled();
    expect(prisma.geocodedAddress.findUnique).toHaveBeenCalledWith({ where: { query: 'salle a' } });
  });

  it('trusts a recent "not found" and skips the provider', async () => {
    prisma.geocodedAddress.findUnique.mockResolvedValue({
      latitude: null,
      longitude: null,
      resolvedAt: new Date(),
    });

    await expect(service.geocode('Nowhere')).resolves.toBeNull();
    expect(routing.geocode).not.toHaveBeenCalled();
  });

  it('asks again once a "not found" is older than the TTL, and caches the answer', async () => {
    prisma.geocodedAddress.findUnique.mockResolvedValue({
      latitude: null,
      longitude: null,
      resolvedAt: new Date(Date.now() - NEGATIVE_GEOCODE_TTL_MS - 1000),
    });
    routing.geocode.mockResolvedValue({ latitude: 1, longitude: 2 });

    await expect(service.geocode('Nowhere')).resolves.toEqual({ latitude: 1, longitude: 2 });
    expect(prisma.geocodedAddress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { query: 'nowhere' },
        update: expect.objectContaining({ latitude: 1, longitude: 2 }),
      }),
    );
  });

  it('bypasses a fresh "not found" on request (« Recalculer »)', async () => {
    prisma.geocodedAddress.findUnique.mockResolvedValue({
      latitude: null,
      longitude: null,
      resolvedAt: new Date(),
    });
    routing.geocode.mockResolvedValue(null);

    await service.geocode('Nowhere', { bypassNegativeCache: true });
    expect(routing.geocode).toHaveBeenCalledWith('Nowhere');
  });

  it('never caches a provider failure', async () => {
    routing.geocode.mockRejectedValue(new Error('ORS 503'));

    await expect(service.geocode('Salle A')).rejects.toThrow('ORS 503');
    expect(prisma.geocodedAddress.upsert).not.toHaveBeenCalled();
  });
});
