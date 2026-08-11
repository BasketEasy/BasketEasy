import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';
import { MyTeamsPage } from './MyTeamsPage';

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[] = []) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships }),
    ),
  );
}

describe('MyTeamsPage', () => {
  it('shows an empty state when the user is part of no team', async () => {
    renderWithProviders(<MyTeamsPage />);

    expect(await screen.findByText('Aucune équipe pour le moment')).toBeInTheDocument();
    expect(
      screen.getByText("Vous n'êtes membre d'aucune équipe pour le moment."),
    ).toBeInTheDocument();
    // Read-only view — no "add" action of its own, so no CTA button.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lists teams with the club, category, and the role badges that apply', async () => {
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'U15 Garçons',
            category: 'U15',
            gender: 'MEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: true,
            rosterRole: 'COACH',
          },
          {
            teamId: 'team-2',
            teamName: 'U11 Filles',
            category: 'U11',
            gender: 'WOMEN',
            clubId: 'club-2',
            clubName: 'ASC Nantes',
            isTeamAdmin: false,
            rosterRole: 'PLAYER',
          },
        ]),
      ),
    );

    renderWithProviders(<MyTeamsPage />);

    expect(await screen.findByText('U15 Garçons')).toBeInTheDocument();
    expect(screen.getByText('COC Basket')).toBeInTheDocument();
    expect(screen.getByText('Administrateur')).toBeInTheDocument();
    expect(screen.getByText('Entraîneur')).toBeInTheDocument();

    expect(screen.getByText('U11 Filles')).toBeInTheDocument();
    expect(screen.getByText('ASC Nantes')).toBeInTheDocument();
    expect(screen.getByText('Joueur')).toBeInTheDocument();
  });

  it('navigates to the team detail page when Voir is clicked', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'U15 Garçons',
            category: 'U15',
            gender: 'MEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: true,
            rosterRole: null,
          },
        ]),
      ),
      http.get('/api/clubs/club-1/teams/team-1', () =>
        HttpResponse.json({
          id: 'team-1',
          name: 'U15 Garçons',
          category: 'U15',
          gender: 'MEN',
          createdAt: 'x',
        }),
      ),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/my-teams' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /voir/i }));

    expect(await screen.findByRole('heading', { name: /u15 garçons/i })).toBeInTheDocument();
  });
});
