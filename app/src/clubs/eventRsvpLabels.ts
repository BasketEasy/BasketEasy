import type { EventRsvpStatus } from '@basketeasy/types/events';

export const EVENT_RSVP_STATUS_OPTIONS: { value: EventRsvpStatus; label: string }[] = [
  { value: 'GOING', label: 'Présent' },
  { value: 'MAYBE', label: 'Incertain' },
  { value: 'NOT_GOING', label: 'Absent' },
];

const eventRsvpStatusLabels = new Map(EVENT_RSVP_STATUS_OPTIONS.map((o) => [o.value, o.label]));

/** Label for a roster member's RSVP status; a null status reads as "no response yet". */
export function eventRsvpStatusLabel(status: EventRsvpStatus | null): string {
  if (!status) {
    return 'En attente';
  }
  return eventRsvpStatusLabels.get(status) ?? status;
}
