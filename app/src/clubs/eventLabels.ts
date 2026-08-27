import type { EventType, EventUpdateScope, EventVenue } from '@basketeasy/types/events';

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'TRAINING', label: 'Entraînement' },
  { value: 'MATCH', label: 'Match' },
];

const eventTypeLabels = new Map(EVENT_TYPE_OPTIONS.map((o) => [o.value, o.label]));

export function eventTypeLabel(type: EventType): string {
  return eventTypeLabels.get(type) ?? type;
}

export const EVENT_VENUE_OPTIONS: { value: EventVenue; label: string }[] = [
  { value: 'HOME', label: 'Domicile' },
  { value: 'AWAY', label: 'Extérieur' },
];

const eventVenueLabels = new Map(EVENT_VENUE_OPTIONS.map((o) => [o.value, o.label]));

export function eventVenueLabel(venue: EventVenue): string {
  return eventVenueLabels.get(venue) ?? venue;
}

// Abbreviated form for the agenda card's narrow (80-96px) time-block column
// — the full "Entraînement" doesn't fit uppercase with tracking-wide-caps at
// that width. Only used there; every other surface (dropdowns, table rows)
// keeps the full word via eventTypeLabel above.
const EVENT_TYPE_SHORT_LABELS: Record<EventType, string> = {
  TRAINING: 'Entraîn.',
  MATCH: 'Match',
};

export function eventTypeShortLabel(type: EventType): string {
  return EVENT_TYPE_SHORT_LABELS[type] ?? type;
}

export const EVENT_UPDATE_SCOPE_OPTIONS: { value: EventUpdateScope; label: string }[] = [
  { value: 'THIS', label: 'Cet événement uniquement' },
  { value: 'THIS_AND_FUTURE', label: 'Cet événement et les suivants' },
  { value: 'ALL', label: 'Tous les événements de la série' },
];

const eventUpdateScopeLabels = new Map(EVENT_UPDATE_SCOPE_OPTIONS.map((o) => [o.value, o.label]));

export function eventUpdateScopeLabel(scope: EventUpdateScope): string {
  return eventUpdateScopeLabels.get(scope) ?? scope;
}
