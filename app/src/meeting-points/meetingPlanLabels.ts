import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';
import { formatEventTime } from '../clubs/eventDateFormat';

/** e.g. "RDV 19:15 · Parking salle Coubertin", or "RDV à confirmer · …" while no time is known. */
export function meetingRowLabel(plan: EventMeetingPlan): string {
  const place = plan.meetingPoint?.name ?? '';
  return plan.meetsAt
    ? `RDV ${formatEventTime(plan.meetsAt)} · ${place}`
    : `RDV à confirmer · ${place}`;
}

/** Why the meeting time is what it is — the travel source, or the coach's own time. */
export function meetingRowDetail(plan: EventMeetingPlan): string {
  const address = plan.meetingPoint?.address ?? '';
  if (plan.meetsAtSource === 'OVERRIDE') return `Horaire fixé par le coach · ${address}`;
  if (plan.travelMinutes === null) return `Temps de trajet en cours de calcul · ${address}`;
  if (plan.travelMinutesSource === 'MANUAL') {
    return `Trajet saisi : ${plan.travelMinutes} min · ${address}`;
  }
  return `Trajet estimé ${plan.travelMinutes} min · ${address}`;
}

/** The meeting card's own sub-line in the travel choice, e.g. "19:15 · Parking salle Coubertin". */
export function meetingChoiceDetail(plan: EventMeetingPlan): string {
  const place = plan.meetingPoint?.name ?? '';
  return plan.meetsAt
    ? `${formatEventTime(plan.meetsAt)} · ${place}`
    : `Horaire à confirmer · ${place}`;
}
