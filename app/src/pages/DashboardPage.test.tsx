import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { DashboardPage } from './DashboardPage';

function renderLoggedIn() {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'a@b.com',
        firstName: 'Chris',
        lastName: 'Rillesen',
        avatarUrl: null,
        memberships: [{ clubId: 'club-1', role: 'ADMIN' }],
      }),
    ),
    http.get('/api/clubs', () => HttpResponse.json([{ id: 'club-1', name: 'COC Basket' }])),
  );
  return renderWithProviders(<DashboardPage />);
}

describe('DashboardPage', () => {
  it('greets the logged-in user by first name and shows their email', async () => {
    renderLoggedIn();

    await waitFor(() => expect(screen.getByText('Bonjour, Chris')).toBeInTheDocument());
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it('shows stat tiles computed from teams, admin clubs, and the dashboard summary', async () => {
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'U15 Filles',
            category: 'U15',
            gender: 'WOMEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: true,
            rosterRole: null,
          },
          {
            teamId: 'team-2',
            teamName: 'U18 Garçons',
            category: 'U18',
            gender: 'MEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: false,
            rosterRole: 'PLAYER',
          },
        ]),
      ),
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({
          totalPlayers: 24,
          upcomingEvents: [
            {
              eventId: 'event-1',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              clubId: 'club-1',
              clubName: 'COC Basket',
              startsAt: '2026-08-12T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
            },
          ],
        }),
      ),
    );
    renderLoggedIn();

    // One managed team (isTeamAdmin: true), one admin club, 24 players, 1 event.
    await waitFor(() => expect(screen.getByText('24')).toBeInTheDocument());
    const statValues = screen.getAllByText(/^\d+$/).map((el) => el.textContent);
    expect(statValues).toEqual(expect.arrayContaining(['1', '24']));
    expect(screen.getByText('Clubs administrés')).toBeInTheDocument();
  });

  it('shows the agenda strip with upcoming events, linking into the team', async () => {
    server.use(
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({
          totalPlayers: 0,
          upcomingEvents: [
            {
              eventId: 'event-1',
              teamId: 'team-1',
              teamName: 'U15 Filles',
              clubId: 'club-1',
              clubName: 'COC Basket',
              startsAt: '2026-08-12T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
            },
          ],
        }),
      ),
    );
    renderLoggedIn();

    await waitFor(() => expect(screen.getByText('U15 Filles')).toBeInTheDocument());
    expect(screen.getByText(/Gymnase A/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no events in the next 7 days', async () => {
    renderLoggedIn();

    await waitFor(() =>
      expect(screen.getByText('Rien de prévu cette semaine')).toBeInTheDocument(),
    );
  });

  it('shows team cards for teams the user is part of', async () => {
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'U15 Filles',
            category: 'U15',
            gender: 'WOMEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: true,
            rosterRole: null,
          },
        ]),
      ),
    );
    renderLoggedIn();

    await waitFor(() => expect(screen.getByText('U15 Filles')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /voir l.équipe/i })).toBeInTheDocument();
  });

  it('shows an empty state when the user has no teams', async () => {
    renderLoggedIn();

    await waitFor(() =>
      expect(screen.getByText('Aucune équipe pour le moment')).toBeInTheDocument(),
    );
  });
});
