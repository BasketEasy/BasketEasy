import { z } from 'zod';
import {
  EVENT_LOCATION_MAX_LENGTH,
  UNKNOWN_EVENT_LOCATION,
  isUnknownEventLocation,
} from '@basketeasy/types/events';

const ADDRESS_REQUIRED_ERROR = 'Adresse requise';
const NAME_REQUIRED_ERROR = 'Nom de la salle requis';

/**
 * The gym name / address pair every event form edits (`EventVenueDialog`,
 * `EventEditModal`, `EventCreateForm`). Both capped at the column's length,
 * not the meeting point's.
 */
export const eventVenueFields = {
  locationName: z.string().max(EVENT_LOCATION_MAX_LENGTH, 'Nom trop long'),
  location: z.string().max(EVENT_LOCATION_MAX_LENGTH, 'Adresse trop longue'),
};

/**
 * A name needs an address, always. `nameRequired` is for the venue dialog,
 * whose whole job is to name the gym; a training's free-text « Gymnase X »
 * stays editable without one. `addressOptional` is for `EventEditModal` on a
 * match still on « Lieu non communiqué »: leaving the address empty sends
 * the placeholder back unchanged instead of failing an unrelated edit.
 */
export function refineEventVenue(
  value: { locationName: string; location: string },
  ctx: z.RefinementCtx,
  {
    nameRequired = false,
    addressOptional = false,
  }: { nameRequired?: boolean; addressOptional?: boolean } = {},
): void {
  const hasName = value.locationName.trim() !== '';
  const hasAddress = value.location.trim() !== '';
  if (!hasAddress && (hasName || !addressOptional)) {
    ctx.addIssue({ code: 'custom', path: ['location'], message: ADDRESS_REQUIRED_ERROR });
  }
  if (nameRequired && !hasName) {
    ctx.addIssue({ code: 'custom', path: ['locationName'], message: NAME_REQUIRED_ERROR });
  }
}

/** The address a form shows: never the placeholder, which names no place. */
export function venueFormValues(event: { location: string; locationName: string | null }): {
  locationName: string;
  location: string;
} {
  return {
    locationName: event.locationName ?? '',
    location: isUnknownEventLocation(event.location) ? '' : event.location,
  };
}

/**
 * The trimmed pair as the API takes it. An empty address on an event still on
 * the placeholder sends the placeholder back unchanged.
 */
export function toEventVenue(
  value: { locationName: string; location: string },
  previousLocation: string | null = null,
): { location: string; locationName: string | null } {
  const location = value.location.trim();
  const locationName = value.locationName.trim();
  return {
    location:
      location === '' && previousLocation !== null && isUnknownEventLocation(previousLocation)
        ? UNKNOWN_EVENT_LOCATION
        : location,
    locationName: locationName === '' ? null : locationName,
  };
}
