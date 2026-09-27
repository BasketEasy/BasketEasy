export interface LatLng {
  latitude: number;
  longitude: number;
}

// Swappable seam, mirroring SCORESHEET_VISION_CLIENT and MAIL_CLIENT:
// MeetingPointsService depends on this interface/token, so changing the
// routing provider is a DI binding change in MeetingPointsModule and nothing
// else. `null` means the provider answered and found nothing (unknown
// address, no route); a throw means the provider itself failed — callers
// cache the former and retry the latter.
export interface RoutingClient {
  geocode(text: string): Promise<LatLng | null>;
  drivingMinutes(from: LatLng, to: LatLng): Promise<number | null>;
}

export const ROUTING_CLIENT = Symbol('ROUTING_CLIENT');
