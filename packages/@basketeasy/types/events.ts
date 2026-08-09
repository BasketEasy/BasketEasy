export interface TeamEvent {
  id: string;
  teamId: string;
  startsAt: string;
  location: string;
  notes: string | null;
  createdAt: string;
}

export interface CreateEventRequest {
  startsAt: string;
  location: string;
  notes?: string;
}

export interface UpdateEventRequest {
  startsAt?: string;
  location?: string;
  notes?: string;
}
