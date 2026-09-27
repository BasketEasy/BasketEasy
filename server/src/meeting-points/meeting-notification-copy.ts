import type { EventType } from '@prisma/client';
import { describeEvent, formatEventMoment, formatTime } from '../common/event-copy';

/** A resolved meeting point with a known time — what the RDV sentences need. */
export interface KnownMeeting {
  meetsAt: Date;
  placeName: string;
}

type MeetingEvent = { type: EventType; startsAt: Date; opponentName: string | null };

/** e.g. "19:15 — Parking salle Coubertin", the time in Europe/Paris. */
export function describeMeeting(meeting: KnownMeeting): string {
  return `${formatTime(meeting.meetsAt)} — ${meeting.placeName}`;
}

// Both sent only to players coming to the meeting point — someone going
// straight to the gym isn't affected by where or when the group meets.

/** The hour becoming known at all: a player told « à confirmer » is owed it. */
export function meetingFixedNotification(
  teamName: string,
  event: MeetingEvent,
  meeting: KnownMeeting,
): { title: string; body: string } {
  return {
    title: `RDV fixé — ${teamName}`,
    body: `Rendez-vous pour ${describeEvent(event)} du ${formatEventMoment(event.startsAt)} : ${describeMeeting(meeting)}.`,
  };
}

/** A known meeting moving, in place or in time. */
export function meetingChangedNotification(
  teamName: string,
  event: MeetingEvent,
  meeting: KnownMeeting,
): { title: string; body: string } {
  return {
    title: `RDV modifié — ${teamName}`,
    body: `Nouveau rendez-vous pour ${describeEvent(event)} du ${formatEventMoment(event.startsAt)} : ${describeMeeting(meeting)}.`,
  };
}
