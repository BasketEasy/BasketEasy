import type { MeetingPoint } from '@basketeasy/types/meeting-points';

/** e.g. "Parking salle Coubertin · 12 rue de la Salle, Nantes" */
export function formatMeetingPoint(meetingPoint: MeetingPoint): string {
  return `${meetingPoint.name} · ${meetingPoint.address}`;
}

/** e.g. "Arrivée 45 min avant le match" */
export function formatArrivalBuffer(minutes: number): string {
  return `Arrivée ${minutes} min avant le match`;
}
