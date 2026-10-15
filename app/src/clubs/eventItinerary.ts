/**
 * A directions link for an event's venue.
 *
 * `Event.location` is free text (`events.ts:24`) and stays that way: a
 * geocoded address, a distance or an embedded map are all ruled out for
 * this link (`docs/personas.md`). A search query is enough — that is
 * the whole point of the free-text field.
 *
 * The URL is the universal Google Maps search form rather than the `maps:`
 * scheme the audit sketches: `maps:` is Apple-only and `geo:` Android-only,
 * while this one is handed to the installed maps app by both mobile OSes and
 * still opens in a browser on a desktop, where a coach may well be planning
 * the trip.
 */
export function eventItineraryHref(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
