import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { EventRsvpRosterEntry } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventRsvpBreakdown } from './EventRsvpBreakdown';

const roster: EventRsvpRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    playerId: 'player-1',
    firstName: 'Lea',
    lastName: 'Bernard',
    role: 'PLAYER',
    status: 'GOING',
    respondedAt: '2026-01-02T00:00:00.000Z',
    travelMode: null,
    isMe: true,
  },
  {
    teamPlayerId: 'tp-2',
    playerId: 'player-2',
    firstName: 'Nathan',
    lastName: 'Hubert',
    role: 'COACH',
    status: null,
    respondedAt: null,
    travelMode: null,
    isMe: false,
  },
];

describe('EventRsvpBreakdown', () => {
  it('does not fetch the roster until opened', async () => {
    let callCount = 0;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/rsvps', () => {
        callCount += 1;
        return HttpResponse.json(roster);
      }),
    );

    renderWithProviders(<EventRsvpBreakdown clubId="club-1" teamId="team-1" eventId="event-1" />);

    expect(screen.getByRole('button', { name: /voir les réponses/i })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callCount).toBe(0);
  });

  it('fetches and shows the roster once opened, with per-row status and the caller marked', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/rsvps', () =>
        HttpResponse.json(roster),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<EventRsvpBreakdown clubId="club-1" teamId="team-1" eventId="event-1" />);

    await user.click(screen.getByRole('button', { name: /voir les réponses/i }));

    expect(await screen.findByText(/lea bernard \(vous\)/i)).toBeInTheDocument();
    expect(screen.getByText('Nathan Hubert')).toBeInTheDocument();
    expect(screen.getByText('Présent')).toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();
  });

  it('derives the confirmed count from the fetched roster', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/rsvps', () =>
        HttpResponse.json(roster),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<EventRsvpBreakdown clubId="club-1" teamId="team-1" eventId="event-1" />);

    await user.click(screen.getByRole('button', { name: /voir les réponses/i }));

    await waitFor(() => expect(screen.getByText(/1\/2 confirmés/i)).toBeInTheDocument());
  });
});
