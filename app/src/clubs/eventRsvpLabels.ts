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
  { value: 'MAYBE', label: 'Incertain', shortLabel: 'Peut-être' },
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

const eventRsvpAnswerLabels = new Map<EventRsvpStatus, string>([
  ['GOING', 'Oui'],
  ['MAYBE', 'Peut-être'],
  ['NOT_GOING', 'Non'],
]);

/**
 * The same answer read back as an answer rather than as a state — « Oui » /
 * « Peut-être » / « Non » / « Sans réponse », the wording of the mockups and,
 * more importantly, of `ResponseMeter`'s own `aria-label`.
 *
 * The event page prints the counts as a sentence right above that meter, so
 * the two must use one vocabulary: a line reading "2 présents · 1 incertain"
 * over a bar announcing "2 oui, 1 peut-être" is the same page saying the same
 * thing twice in two languages. `eventRsvpStatusLabel` stays as it is — it
 * names the *state* a member is in ("En attente"), which is what the RSVP
 * control's own labels and the breakdown panels want.
 */
export function eventRsvpAnswerLabel(status: EventRsvpStatus | null): string {
  if (!status) {
    return 'Sans réponse';
  }
  return eventRsvpAnswerLabels.get(status) ?? status;
}
