import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { EventConvocationRosterEntry } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventConvocationBreakdown } from './EventConvocationBreakdown';

const roster: EventConvocationRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    playerId: 'player-1',
    firstName: 'Lea',
    lastName: 'Bernard',
    role: 'PLAYER',
    convoked: true,
    convokedAt: '2026-01-02T00:00:00.000Z',
    isMe: true,
  },
  {
    teamPlayerId: 'tp-2',
    playerId: 'player-2',
    firstName: 'Nathan',
    lastName: 'Hubert',
    role: 'COACH',
    convoked: false,
    convokedAt: null,
    isMe: false,
  },
];

describe('EventConvocationBreakdown', () => {
  it('does not fetch the roster until opened', async () => {
    let callCount = 0;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () => {
        callCount += 1;
        return HttpResponse.json(roster);
      }),
    );

    renderWithProviders(
      <EventConvocationBreakdown clubId="club-1" teamId="team-1" eventId="event-1" />,
    );

    expect(screen.getByRole('button', { name: /voir la convocation/i })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(callCount).toBe(0);
  });

  it('fetches and shows the roster once opened, with per-row status and the caller marked', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json(roster),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <EventConvocationBreakdown clubId="club-1" teamId="team-1" eventId="event-1" />,
    );

    await user.click(screen.getByRole('button', { name: /voir la convocation/i }));

    expect(await screen.findByText(/lea bernard \(vous\)/i)).toBeInTheDocument();
    expect(screen.getByText('Nathan Hubert')).toBeInTheDocument();
    expect(screen.getByText('Convoqué')).toBeInTheDocument();
    expect(screen.getByText('Non convoqué')).toBeInTheDocument();
  });

  it('derives the convoked count from the fetched roster', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json(roster),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <EventConvocationBreakdown clubId="club-1" teamId="team-1" eventId="event-1" />,
    );

    await user.click(screen.getByRole('button', { name: /voir la convocation/i }));

    await waitFor(() => expect(screen.getByText(/1\/2 convoqués/i)).toBeInTheDocument());
  });
});
