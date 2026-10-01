import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { ResultsPage } from './ResultsPage';

function renderLoggedIn() {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'a@b.com',
        emailVerified: true,
        firstName: 'Chris',
        lastName: 'Rillesen',
        avatarUrl: null,
        memberships: [{ clubId: 'club-1', role: 'MEMBER' }],
      }),
    ),
    http.get('/api/clubs', () => HttpResponse.json([])),
  );
  return renderWithProviders(<ResultsPage />);
}

describe('ResultsPage', () => {
  it('renders a confirmed match with its score and outcome', async () => {
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
              type: 'MATCH',
              startsAt: '2026-08-01T18:00:00.000Z',
              location: 'Gymnase A',
              notes: null,
              opponentName: 'ES Rezé',
              venue: 'HOME',
              recurrenceId: null,
              myRsvpStatus: 'GOING',
              myConvocation: true,
              rsvpSummary: {
                rosterSize: 10,
                convoked: 10,
                answering: 10,
                going: 10,
                maybe: 0,
                notGoing: 0,
                pending: 0,
                isConvocationScoped: true,
              },
              isImported: false,
              timeConfirmed: true,
              logistics: { jerseys: null, balls: null },
              result: { ourScore: 62, theirScore: 58, outcome: 'WIN' },
              myMatchStats: { points: 14, fouls: 2 },
            },
          ],
        }),
      ),
    );
    renderLoggedIn();

    expect(await screen.findByText('Victoire')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Résultats' })).toBeInTheDocument();
    expect(screen.getByText('30 derniers jours')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Derniers résultats' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Après le match' })).not.toBeInTheDocument();
    const row = screen.getByRole('link', { name: /vs ES Rezé/ });
    expect(row).toHaveAttribute('href', '/clubs/club-1/teams/team-1/events/event-1');
    expect(within(row).getByText('62–58')).toBeInTheDocument();
  });

  it('shows an empty state when there is nothing in the last 30 days', async () => {
    server.use(
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({ totalPlayers: 0, upcomingEvents: [] }),
      ),
    );
    renderLoggedIn();

    expect(await screen.findByText('Aucun résultat récent')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Résultats' })).toBeInTheDocument();
  });

  it('shows an error instead of the empty state when the request fails', async () => {
    server.use(
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({ message: 'Erreur serveur' }, { status: 500 }),
      ),
    );
    renderLoggedIn();

    expect(await screen.findByText('Chargement impossible')).toBeInTheDocument();
    expect(screen.queryByText('Aucun résultat récent')).not.toBeInTheDocument();
  });
});
