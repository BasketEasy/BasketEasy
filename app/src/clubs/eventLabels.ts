import type { EventType, EventUpdateScope } from '@basketeasy/types/events';

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: 'TRAINING', label: 'Entraînement' },
  { value: 'MATCH', label: 'Match' },
];

const eventTypeLabels = new Map(EVENT_TYPE_OPTIONS.map((o) => [o.value, o.label]));

export function eventTypeLabel(type: EventType): string {
  return eventTypeLabels.get(type) ?? type;
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
