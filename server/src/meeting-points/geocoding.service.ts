import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normaliseAddress } from './meeting-plan';
import {
  ROUTING_CLIENT,
  type LatLng,
  type RoutingClient,
  type RoutingRequestOptions,
} from './routing-client';

// How long a "not found" answer is trusted before the provider is asked
// again — long enough that a list page full of an unknown gym doesn't hit
// ORS on every view, short enough that a fixed-upstream address resolves.
export const NEGATIVE_GEOCODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// `lastUsedAt` only feeds the retention sweep's 12-month cutoff, so a cache
// hit refreshes it at most once a day rather than writing on every read.
export const LAST_USED_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Address → coordinates through the shared GeocodedAddress cache. The same
 * away gym comes back for a dozen teams across a season, and ORS's free tier
 * allows 1,000 geocodes a day.
 */
@Injectable()
export class GeocodingService {
  /**
   * One provider call per address at a time: a club default moving fans out
   * one recompute per inheriting match, all sharing the same origin, and
   * without this each would miss the cache and geocode it again.
   */
  private readonly inFlight = new Map<string, Promise<LatLng | null>>();

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
    {
      bypassNegativeCache = false,
      ...requestOptions
    }: { bypassNegativeCache?: boolean } & RoutingRequestOptions = {},
  ): Promise<LatLng | null> {
    const query = normaliseAddress(text);
    if (!query) return null;

    const pending = this.inFlight.get(query);
    if (pending) return pending;
    const lookup = this.lookup(query, text, bypassNegativeCache, requestOptions).finally(() =>
      this.inFlight.delete(query),
    );
    this.inFlight.set(query, lookup);
    return lookup;
  }

  private async lookup(
    query: string,
    text: string,
    bypassNegativeCache: boolean,
    requestOptions: RoutingRequestOptions,
  ): Promise<LatLng | null> {
    const cached = await this.prisma.geocodedAddress.findUnique({ where: { query } });
    if (cached && cached.latitude !== null && cached.longitude !== null) {
      if (Date.now() - cached.lastUsedAt.getTime() >= LAST_USED_TOUCH_INTERVAL_MS) {
        await this.prisma.geocodedAddress.update({
          where: { query },
          data: { lastUsedAt: new Date() },
        });
      }
      return { latitude: cached.latitude, longitude: cached.longitude };
    }
    const negativeIsFresh =
      cached !== null && Date.now() - cached.resolvedAt.getTime() < NEGATIVE_GEOCODE_TTL_MS;
    if (negativeIsFresh && !bypassNegativeCache) return null;

    const result = await this.routing.geocode(text, requestOptions);
    const now = new Date();
    const data = {
      latitude: result?.latitude ?? null,
      longitude: result?.longitude ?? null,
      resolvedAt: now,
      lastUsedAt: now,
    };
    await this.prisma.geocodedAddress.upsert({
      where: { query },
      create: { query, ...data },
      update: data,
    });
    return result;
  }
}
