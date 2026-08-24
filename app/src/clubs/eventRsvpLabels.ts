import type { EventRsvpStatus } from '@basketeasy/types/events';

/**
 * `shortLabel` is what actually renders below the desktop breakpoint in
 * EventRsvpControl — kept visible (not hidden behind an icon-only button)
 * because a hover tooltip alone doesn't reliably reach touch users, who are
 * exactly the audience checking this from a phone at the gym.
 */
export const EVENT_RSVP_STATUS_OPTIONS: {
  value: EventRsvpStatus;
  label: string;
  shortLabel: string;
}[] = [
  { value: 'GOING', label: 'Présent', shortLabel: 'Oui' },
  { value: 'MAYBE', label: 'Incertain', shortLabel: '?' },
  { value: 'NOT_GOING', label: 'Absent', shortLabel: 'Non' },
];

const eventRsvpStatusLabels = new Map(EVENT_RSVP_STATUS_OPTIONS.map((o) => [o.value, o.label]));

/** Label for a roster member's RSVP status; a null status reads as "no response yet". */
export function eventRsvpStatusLabel(status: EventRsvpStatus | null): string {
  if (!status) {
    return 'En attente';
  }
  return eventRsvpStatusLabels.get(status) ?? status;
}
