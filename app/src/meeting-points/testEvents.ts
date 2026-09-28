import type { TeamEvent } from '@basketeasy/types/events';
import type { EventMeetingPlan } from '@basketeasy/types/meeting-points';

// Local wall-clock values keep the assertions timezone-independent: the page
// formats every time with the viewer's local clock.
const kickOff = new Date(2026, 9, 10, 20, 30);
const at = (hours: number, minutes: number) => new Date(2026, 9, 10, hours, minutes).toISOString();

export const computedPlan: EventMeetingPlan = {
  arrivalAt: at(19, 45),
  arrivalBufferMinutes: 45,
  meetingPoint: { name: 'Parking salle Coubertin', address: '12 rue Coubertin, Nantes' },
  meetingPointSource: 'CLUB',
  defaultMeetingPoint: { name: 'Parking salle Coubertin', address: '12 rue Coubertin, Nantes' },
  defaultMeetingPointSource: 'CLUB',
  travelMinutes: 23,
  travelMinutesSource: 'COMPUTED',
  meetsAt: at(19, 15),
  meetsAtSource: 'COMPUTED',
};

export function matchEvent(overrides: Partial<TeamEvent> = {}): TeamEvent {
  return {
    id: 'event-1',
    teamId: 'team-1',
    type: 'MATCH',
    startsAt: kickOff.toISOString(),
    location: 'Salle des Sports, Rezé',
    notes: null,
    opponentName: 'Rezé BC',
    venue: 'AWAY',
    recurrenceId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    myRsvpStatus: 'GOING',
    myRsvpRespondedBy: null,
    myRsvpRespondedAt: null,
    isImported: false,
    timeConfirmed: true,
    myConvocation: true,
    rsvpSummary: {
      rosterSize: 0,
      convoked: 0,
      answering: 0,
      going: 0,
      maybe: 0,
      notGoing: 0,
      pending: 0,
      isConvocationScoped: false,
    },
    logistics: { jerseys: null, balls: null },
    result: null,
    myMatchStats: null,
    meetingPlan: computedPlan,
    myTravelMode: 'MEETING_POINT',
    ...overrides,
  };
}

export { at };
