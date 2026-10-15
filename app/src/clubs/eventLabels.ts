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

// The agenda card's "Voir →" link text (both event types link to
// EventDetailPage now, not just MATCH) — a plain eventTypeLabel() reads
// awkwardly there ("Voir Match →"), so this phrases it the way a person
// would ("Voir le match →" / "Voir l'entraînement →").
const EVENT_DETAIL_LINK_LABELS: Record<EventType, string> = {
  TRAINING: "Voir l'entraînement",
  MATCH: 'Voir le match',
};

export function eventDetailLinkLabel(type: EventType): string {
  return EVENT_DETAIL_LINK_LABELS[type] ?? type;
}

export const EVENT_UPDATE_SCOPE_OPTIONS: { value: EventUpdateScope; label: string }[] = [
  { value: 'THIS', label: 'Cet événement uniquement' },
  { value: 'THIS_AND_FUTURE', label: 'Cet événement et les suivants' },
  { value: 'ALL', label: 'Tous les événements de la série' },
];
