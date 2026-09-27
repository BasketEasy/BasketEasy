import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LatLng, RoutingClient } from './routing-client';

const ORS_BASE_URL = 'https://api.openrouteservice.org';
const REQUEST_TIMEOUT_MS = 10_000;

interface OrsFeatureCollection {
  features?: {
    geometry?: { coordinates?: number[] };
    properties?: { summary?: { duration?: number } };
  }[];
}

/**
 * OpenRouteService (HeiGIT, Heidelberg) — geocoding and car routing from one
 * EU-hosted provider and one key. Every address it sees is a gym or a car
 * park, never personal data. ORS speaks [longitude, latitude], the reverse
 * of everything else in this module; the conversion stays in this file.
 */
@Injectable()
export class OrsRoutingClient implements RoutingClient {
  constructor(private readonly config: ConfigService) {}

  async geocode(text: string): Promise<LatLng | null> {
    const params = new URLSearchParams({ text, 'boundary.country': 'FR', size: '1' });
    const body = await this.get(`/geocode/search?${params.toString()}`);
    const coordinates = body.features?.[0]?.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) return null;
    return { longitude: coordinates[0], latitude: coordinates[1] };
  }

  async drivingMinutes(from: LatLng, to: LatLng): Promise<number | null> {
    const params = new URLSearchParams({
      start: `${from.longitude},${from.latitude}`,
      end: `${to.longitude},${to.latitude}`,
    });
    const body = await this.get(`/v2/directions/driving-car?${params.toString()}`);
    const feature = body.features?.[0];
    if (!feature) return null;
    // ORS omits `duration` from the summary of a zero-length route — the
    // meeting point *is* the gym, which is the home-match case.
    const seconds = feature.properties?.summary?.duration ?? 0;
    return Math.ceil(seconds / 60);
  }

  private async get(path: string): Promise<OrsFeatureCollection> {
    const response = await fetch(`${ORS_BASE_URL}${path}`, {
      headers: {
        Authorization: this.config.get<string>('ORS_API_KEY') ?? '',
        Accept: 'application/json, application/geo+json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // ORS answers 404 for a route it can't build between two points
    // (e.g. an island with no road link) — an answer, not a failure.
    if (response.status === 404) return {};
    if (!response.ok) {
      throw new Error(`OpenRouteService ${response.status} on ${path.split('?')[0]}`);
    }
    return (await response.json()) as OrsFeatureCollection;
  }
}
