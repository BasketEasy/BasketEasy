import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normaliseAddress } from './meeting-plan';
import { ROUTING_CLIENT, type LatLng, type RoutingClient } from './routing-client';

// How long a "not found" answer is trusted before the provider is asked
// again — long enough that a list page full of an unknown gym doesn't hit
// ORS on every view, short enough that a fixed-upstream address resolves.
export const NEGATIVE_GEOCODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Address → coordinates through the shared GeocodedAddress cache. The same
 * away gym comes back for a dozen teams across a season, and ORS's free tier
 * allows 1,000 geocodes a day.
 */
@Injectable()
export class GeocodingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ROUTING_CLIENT) private readonly routing: RoutingClient,
  ) {}

  /**
   * `bypassNegativeCache` is the manager's « Recalculer »: a cached "not
   * found" is asked again. A provider failure propagates and is never
   * cached — it says nothing about the address.
   */
  async geocode(
    text: string,
    { bypassNegativeCache = false }: { bypassNegativeCache?: boolean } = {},
  ): Promise<LatLng | null> {
    const query = normaliseAddress(text);
    if (!query) return null;

    const cached = await this.prisma.geocodedAddress.findUnique({ where: { query } });
    if (cached && cached.latitude !== null && cached.longitude !== null) {
      return { latitude: cached.latitude, longitude: cached.longitude };
    }
    const negativeIsFresh =
      cached !== null && Date.now() - cached.resolvedAt.getTime() < NEGATIVE_GEOCODE_TTL_MS;
    if (negativeIsFresh && !bypassNegativeCache) return null;

    const result = await this.routing.geocode(text);
    const data = {
      latitude: result?.latitude ?? null,
      longitude: result?.longitude ?? null,
      resolvedAt: new Date(),
    };
    await this.prisma.geocodedAddress.upsert({
      where: { query },
      create: { query, ...data },
      update: data,
    });
    return result;
  }
}
