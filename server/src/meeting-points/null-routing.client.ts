import { Injectable } from '@nestjs/common';
import type { LatLng, RoutingClient } from './routing-client';

/**
 * Bound when ORS_API_KEY is unset (dev, CI, these sandboxes). Answers "not
 * found" to everything, so a match's meeting time stays « à confirmer »
 * until a manager types the travel minutes — the feature still works, only
 * the automatic computation doesn't.
 */
@Injectable()
export class NullRoutingClient implements RoutingClient {
  geocode(): Promise<LatLng | null> {
    return Promise.resolve(null);
  }

  drivingMinutes(): Promise<number | null> {
    return Promise.resolve(null);
  }
}
