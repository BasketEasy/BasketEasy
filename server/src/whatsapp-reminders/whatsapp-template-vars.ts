import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import {
  EVENT_TIME_TO_CONFIRM,
  MEETING_TIME_TO_CONFIRM,
  WHATSAPP_TEMPLATE_VARIABLE_LABELS,
  type EventShareChange,
  type WhatsAppTemplateVariable,
  type WhatsAppTemplateVars,
} from '@basketeasy/types/whatsapp-reminder';
import { formatShortDate, formatTime, titleEvent } from '../common/event-copy';

export interface ShareEvent {
  type: 'TRAINING' | 'MATCH';
  startsAt: Date;
  timeConfirmed: boolean;
  location: string;
  opponentName: string | null;
}

/**
 * The values a reminder message is rendered from. `null` marks a value that
 * doesn't exist for this event (a training's RDV), which drops its line.
 * `guestUrl` is null when there is no link to carry (a cancellation with the
 * guest link off), which drops the link's line.
 */
export function buildTemplateVars(
  event: ShareEvent,
  teamName: string,
  plan: EventMeetingPlan | null,
  guestUrl: string | null,
): WhatsAppTemplateVars {
  const place = plan?.meetingPoint ?? null;
  const isMatch = event.type === 'MATCH';
  return {
    event_name: titleEvent(event),
    opponent: isMatch ? event.opponentName || null : null,
    event_date: formatShortDate(event.startsAt),
    meeting_place: place ? place.name || place.address : null,
    meeting_time: place
      ? plan?.meetsAt
        ? formatTime(new Date(plan.meetsAt))
        : MEETING_TIME_TO_CONFIRM
      : null,
    event_time: event.timeConfirmed ? formatTime(event.startsAt) : EVENT_TIME_TO_CONFIRM,
    location: event.location,
    team_name: teamName,
    link: guestUrl === null ? null : `${guestUrl}?src=wa`,
  };
}

/** What a stored snapshot holds: every variable, the link nulled (it is rebuilt at send time). */
export function toSnapshot(vars: WhatsAppTemplateVars): WhatsAppTemplateVars {
  return { ...vars, link: null };
}

/** Variables the group reads and that can change on their own, in the order the diff lists them. */
const DIFFED: WhatsAppTemplateVariable[] = [
  // In `contentKey`, so a rename is a change: it has to be listed, or an
  // unrelated edit after a rename would raise an UPDATE that says nothing moved.
  'team_name',
  'event_name',
  'opponent',
  'event_date',
  'event_time',
  'location',
  'meeting_time',
  'meeting_place',
];

const NONE = 'aucun';

/**
 * « What moved » between the message the group last read and the current one,
 * old value first. Only what the message shows: notes, venue and logistics
 * never reach here.
 */
export function diffVars(
  previous: Partial<WhatsAppTemplateVars>,
  current: WhatsAppTemplateVars,
): EventShareChange[] {
  return DIFFED.flatMap((key) => {
    const from = previous[key] ?? null;
    const to = current[key];
    return from === to
      ? []
      : [
          {
            label: WHATSAPP_TEMPLATE_VARIABLE_LABELS[key],
            from: from ?? NONE,
            to: to ?? NONE,
          },
        ];
  });
}
