import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { EventConvocationRosterEntry } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventConvocationModal } from './EventConvocationModal';

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

describe('EventConvocationModal', () => {
  it('seeds the checkbox state from the fetched convoked flags', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json(roster),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <EventConvocationModal clubId="club-1" teamId="team-1" eventId="event-1" />,
    );

    await user.click(screen.getByRole('button', { name: /gérer la convocation/i }));

    expect(await screen.findByLabelText(/lea bernard/i)).toBeChecked();
    expect(screen.getByLabelText(/nathan hubert/i)).not.toBeChecked();
  });

  it('submits exactly the checked teamPlayerIds after toggling', async () => {
    let capturedBody: unknown;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json(roster),
      ),
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/convocations',
        async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(roster);
        },
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <EventConvocationModal clubId="club-1" teamId="team-1" eventId="event-1" />,
    );

    await user.click(screen.getByRole('button', { name: /gérer la convocation/i }));
    await screen.findByLabelText(/lea bernard/i);

    // Uncheck the pre-convoked player, check the not-yet-convoked one.
    await user.click(screen.getByLabelText(/lea bernard/i));
    await user.click(screen.getByLabelText(/nathan hubert/i));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody).toEqual({ teamPlayerIds: ['tp-2'] });
  });

  it('submits an empty list when every player is unchecked', async () => {
    let capturedBody: unknown;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json(roster),
      ),
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/convocations',
        async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json(roster.map((r) => ({ ...r, convoked: false })));
        },
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <EventConvocationModal clubId="club-1" teamId="team-1" eventId="event-1" />,
    );

    await user.click(screen.getByRole('button', { name: /gérer la convocation/i }));
    await screen.findByLabelText(/lea bernard/i);

    await user.click(screen.getByLabelText(/lea bernard/i));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(capturedBody).toBeDefined());
    expect(capturedBody).toEqual({ teamPlayerIds: [] });
  });
});
