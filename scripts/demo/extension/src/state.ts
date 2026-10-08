// What the person filming changes on screen (an RSVP, a convocation, a
// vote…), kept in the page's localStorage so a reload doesn't undo it.
// `?demo=reset` wipes it.

import type { EventRsvpStatus, EventType, EventVenue } from '@basketeasy/types/events';
import type { EventTravelMode, MeetingPoint } from '@basketeasy/types/meeting-points';
import type { EventSharePlatform } from '@basketeasy/types/whatsapp-reminder';
import type { PersonaKey } from './world';

const KEY = 'kluvo-demo-state-v1';

export interface RsvpOverride {
  status: EventRsvpStatus | null;
  travelMode: EventTravelMode | null;
  respondedAt: number;
}

export interface CreatedEvent {
  id: string;
  teamId: string;
  type: EventType;
  startsAt: number;
  location: string;
  locationName: string | null;
  opponentName: string | null;
  venue: EventVenue | null;
  notes: string | null;
  recurrenceId: string | null;
  createdAt: number;
}

export interface DemoState {
  persona: PersonaKey;
  loggedOut: boolean;
  rsvp: Record<string, Record<string, RsvpOverride>>;
  convocations: Record<string, { ids: string[]; at: number }>;
  votes: Record<string, { best?: string; worst?: string }>;
  jersey: Record<
    string,
    {
      holder: string | null;
      status: 'ASSIGNED' | 'ACCEPTED';
      acceptedBy: string | null;
      declinedBy: string[];
    }
  >;
  readNotifications: string[];
  allReadAt: number | null;
  scoresheets: Record<string, { uploadedAt: number; confirmedAt: number | null }>;
  shares: Record<string, { sentAt: number; platform: EventSharePlatform; by: PersonaKey }>;
  created: CreatedEvent[];
  deleted: string[];
  eventPatches: Record<string, Partial<CreatedEvent>>;
  teamPatches: Record<string, { name?: string; jerseyRotationEnabled?: boolean }>;
  exempt: Record<string, boolean>;
  eventMeeting: Record<
    string,
    { meetingPoint?: MeetingPoint | null; travelMinutes?: number | null; meetsAt?: string | null }
  >;
  guestLinkEnabled: boolean;
  clubMeeting: { meetingPoint: MeetingPoint | null; arrivalBufferMinutes: number } | null;
}

function empty(persona: PersonaKey): DemoState {
  return {
    persona,
    loggedOut: false,
    rsvp: {},
    convocations: {},
    votes: {},
    jersey: {},
    readNotifications: [],
    allReadAt: null,
    scoresheets: {},
    shares: {},
    created: [],
    deleted: [],
    eventPatches: {},
    teamPatches: {},
    exempt: {},
    eventMeeting: {},
    guestLinkEnabled: true,
    clubMeeting: null,
  };
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadState(defaultPersona: PersonaKey): DemoState {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) return { ...empty(defaultPersona), ...(JSON.parse(raw) as Partial<DemoState>) };
  } catch {
    // A corrupt or blocked store starts the demo fresh.
  }
  return empty(defaultPersona);
}

export function saveState(state: DemoState): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private window: changes simply don't survive a reload.
  }
}

export function resetState(persona: PersonaKey): DemoState {
  const fresh = empty(persona);
  saveState(fresh);
  return fresh;
}
