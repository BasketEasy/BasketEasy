import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', emailVerified: true, memberships }),
    ),
  );
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

describe('MyTeamsPage', () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it('reports a failed load instead of claiming the user has no teams', async () => {
    server.use(
      http.get('/api/me/teams', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );
    renderWithProviders(<MyTeamsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Chargement impossible');
    expect(screen.queryByText('Aucune équipe pour le moment')).not.toBeInTheDocument();
  });

  it('shows an empty state when the user is part of no team', async () => {
    renderWithProviders(<MyTeamsPage />);

    expect(await screen.findByText('Aucune équipe pour le moment')).toBeInTheDocument();
    expect(
      screen.getByText("Vous n'êtes membre d'aucune équipe pour le moment."),
    ).toBeInTheDocument();
    // Not an admin of any club: no create trigger.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Mes équipes' })).toBeInTheDocument();
  });

  it.each([1024, 375])('offers « Créer une équipe » to a club admin at %ipx', async (width) => {
    setViewportWidth(width);
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([
          { id: 'club-1', name: 'COC Basket', ffbbClubCode: null, createdAt: '2026-01-01' },
        ]),
      ),
    );
    renderWithProviders(<App />, { route: '/my-teams' });
    expect(await screen.findByRole('button', { name: 'Créer une équipe' })).toBeInTheDocument();
  });

  it('groups teams under « Je gère » and « Je joue ou j’entraîne », a dual-role team once', async () => {
    const base = { category: 'U15', gender: 'MEN', clubId: 'club-1', clubName: 'COC Basket' };
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          { ...base, teamId: 't1', teamName: 'Seniors', isTeamAdmin: true, rosterRole: null },
          { ...base, teamId: 't2', teamName: 'U15 Dual', isTeamAdmin: true, rosterRole: 'COACH' },
          {
            ...base,
            teamId: 't3',
            teamName: 'U13 Joueur',
            isTeamAdmin: false,
            rosterRole: 'PLAYER',
          },
        ]),
      ),
    );
    renderWithProviders(<MyTeamsPage />);

    const managed = (await screen.findByRole('heading', { name: 'Je gère (2)' })).closest(
      'section',
    ) as HTMLElement;
    expect(within(managed).getByText('Seniors')).toBeInTheDocument();
    expect(within(managed).getByText('U15 Dual')).toBeInTheDocument();
    expect(within(managed).getByText('Admin · Entraîneur')).toBeInTheDocument();

    const played = screen
      .getByRole('heading', { name: 'Je joue ou j’entraîne (1)' })
      .closest('section') as HTMLElement;
    expect(within(played).getByText('U13 Joueur')).toBeInTheDocument();
    expect(screen.getAllByText('U15 Dual')).toHaveLength(1);
  });

  it('renders no section for a group with no team', async () => {
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          {
            teamId: 't3',
            teamName: 'U13 Joueur',
            category: 'U13',
            gender: 'MEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: false,
            rosterRole: 'PLAYER',
          },
        ]),
      ),
    );
    renderWithProviders(<MyTeamsPage />);
    expect(await screen.findByRole('heading', { name: 'Je joue ou j’entraîne (1)' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: /Je gère/ })).not.toBeInTheDocument();
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
    expect(screen.getByText('Admin · Entraîneur')).toBeInTheDocument();

    expect(screen.getByText('U11 Filles')).toBeInTheDocument();
    expect(screen.getByText('ASC Nantes')).toBeInTheDocument();
    expect(screen.getByText('Joueur')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Je gère (1)' })).toBeInTheDocument();
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
    await user.click(screen.getByRole('link', { name: /voir/i }));

    expect(await screen.findByRole('heading', { name: /u15 garçons/i })).toBeInTheDocument();
  });

  it('renders clickable cards instead of a table below the desktop breakpoint', async () => {
    setViewportWidth(375);
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
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    // The whole card is the link now — no separate "Voir" button.
    await user.click(screen.getByRole('link', { name: /u15 garçons/i }));
    expect(await screen.findByRole('heading', { name: /u15 garçons/i })).toBeInTheDocument();
  });
});
