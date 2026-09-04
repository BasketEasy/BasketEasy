import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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

    expect(await screen.findByText('Résultats')).toBeInTheDocument();
    expect(await screen.findByText('Victoire')).toBeInTheDocument();
    expect(screen.getByText('62–58')).toBeInTheDocument();
  });

  it('shows an empty state when there is nothing in the last 30 days', async () => {
    server.use(
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({ totalPlayers: 0, upcomingEvents: [] }),
      ),
    );
    renderLoggedIn();

    expect(await screen.findByText('Aucun résultat récent')).toBeInTheDocument();
  });
});
