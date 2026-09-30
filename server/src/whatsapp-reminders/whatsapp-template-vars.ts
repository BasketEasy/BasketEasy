import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import {
  EVENT_TIME_TO_CONFIRM,
  MEETING_TIME_TO_CONFIRM,
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
 */
export function buildTemplateVars(
  event: ShareEvent,
  teamName: string,
  plan: EventMeetingPlan | null,
  guestUrl: string,
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
    link: `${guestUrl}?src=wa`,
  };
}
