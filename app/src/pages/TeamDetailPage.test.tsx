import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[]) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships }),
    ),
  );
}

const baseTeam = {
  id: 'team-1',
  name: 'U15 Garçons',
  category: 'U15',
  gender: 'MEN',
  createdAt: 'x',
};

describe('TeamDetailPage', () => {
  it('shows the team, its owning club, and its roster, with admin controls for the owning club', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json([
          { clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' },
        ]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () =>
        HttpResponse.json([
          {
            id: 'tp-1',
            teamId: 'team-1',
            playerId: 'p1',
            firstName: 'Alex',
            lastName: 'Dupont',
            clubId: 'club-1',
            role: 'PLAYER',
            createdAt: 'x',
          },
        ]),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    expect(screen.getByText('U15 · Masculin')).toBeInTheDocument();
    expect(screen.getByText('COC Basket')).toBeInTheDocument();
    expect(screen.getByText('Propriétaire')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /associer un club/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^supprimer$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ajouter un administrateur/i })).toBeInTheDocument();
    // Roster row shows an editable role select for a manager, not a badge.
    expect(screen.getByRole('combobox', { name: /^rôle$/i })).toBeInTheDocument();
  });

  it('lets an admin change the category and gender', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json([
          { clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' },
        ]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
      http.patch('/api/clubs/club-1/teams/team-1', async ({ request }) => {
        const body = (await request.json()) as { name: string; category: string; gender: string };
        return HttpResponse.json({ ...baseTeam, ...body });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 · Masculin')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /modifier/i }));

    await user.click(screen.getByRole('combobox', { name: /^genre$/i }));
    await user.click(await screen.findByRole('option', { name: 'Féminin' }));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(screen.getByText('U15 · Féminin')).toBeInTheDocument());
  });

  it('hides all admin controls for a MEMBER', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json([
          { clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' },
        ]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /associer un club/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ajouter un joueur/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /ajouter un administrateur/i }),
    ).not.toBeInTheDocument();
  });

  it('lets a TeamAdmin who is not a club admin manage the roster and events', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json([
          { clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' },
        ]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/teams/team-1/admins', () =>
        HttpResponse.json([
          { userId: 'user-1', email: 'a@b.com', teamId: 'team-1', createdAt: 'x' },
        ]),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    // Team-day management is available to this TeamAdmin...
    expect(await screen.findByRole('button', { name: /ajouter un joueur/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /créer un événement/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /modifier/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ajouter un administrateur/i })).toBeInTheDocument();
    // ...but CTC governance and team deletion stay owner-club-ADMIN-only.
    expect(screen.queryByRole('button', { name: /associer un club/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument();
  });

  it('does not let a non-owning (partner) club admin manage partner clubs or delete the team', async () => {
    mockSession([{ clubId: 'club-2', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-2/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-2/teams/team-1/clubs', () =>
        HttpResponse.json([
          { clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' },
          { clubId: 'club-2', clubName: 'Club B', isOwner: false, linkedAt: 'y' },
        ]),
      ),
      http.get('/api/clubs/club-2/teams/team-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-2/players', () => HttpResponse.json([])),
    );

    renderWithProviders(<App />, { route: '/clubs/club-2/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /associer un club/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument();
    // Roster management stays available to any linked club's admin.
    expect(screen.getByRole('button', { name: /ajouter un joueur/i })).toBeInTheDocument();
  });

  it('lets the owning club link a partner club (CTC)', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json([
          { clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' },
        ]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
      http.post('/api/clubs/club-1/teams/team-1/clubs', async ({ request }) => {
        const body = (await request.json()) as { clubId: string };
        return HttpResponse.json({
          clubId: body.clubId,
          clubName: 'Club B',
          isOwner: false,
          linkedAt: '2026-01-02',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /associer un club/i }));

    await user.type(screen.getByLabelText(/identifiant du club partenaire/i), 'club-2');
    await user.click(screen.getByRole('button', { name: /^associer$/i }));

    await waitFor(() => expect(screen.getByText('Club B')).toBeInTheDocument());
  });

  it('adds a player from the current club to the roster', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json([
          { clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' },
        ]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () =>
        HttpResponse.json([
          {
            id: 'p1',
            clubId: 'club-1',
            firstName: 'Alex',
            lastName: 'Dupont',
            userId: null,
            createdAt: 'x',
          },
        ]),
      ),
      http.post('/api/clubs/club-1/teams/team-1/players', async ({ request }) => {
        const body = (await request.json()) as { playerId: string; role: string };
        return HttpResponse.json({
          id: 'tp-1',
          teamId: 'team-1',
          playerId: body.playerId,
          firstName: 'Alex',
          lastName: 'Dupont',
          clubId: 'club-1',
          role: body.role,
          createdAt: '2026-01-01',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /ajouter un joueur/i }));

    await user.click(screen.getByRole('combobox', { name: /joueur/i }));
    await user.click(await screen.findByRole('option', { name: 'Alex Dupont' }));
    await user.click(screen.getByRole('button', { name: /ajouter à l'effectif/i }));

    await waitFor(() => expect(screen.getByText('Alex')).toBeInTheDocument());
  });

  it('shows the team events and lets an admin create one', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let createCalled = false;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json([
          { clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' },
        ]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/teams/team-1/events', () =>
        HttpResponse.json([
          {
            id: 'event-1',
            teamId: 'team-1',
            startsAt: '2026-01-05T18:00:00.000Z',
            location: 'Gymnase A',
            notes: null,
            createdAt: 'x',
          },
        ]),
      ),
      http.post('/api/clubs/club-1/teams/team-1/events', async ({ request }) => {
        createCalled = true;
        const body = (await request.json()) as { startsAt: string; location: string };
        return HttpResponse.json([
          {
            id: 'event-2',
            teamId: 'team-1',
            startsAt: body.startsAt,
            location: body.location,
            notes: null,
            createdAt: 'x',
          },
        ]);
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    expect(await screen.findByText('Gymnase A')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /créer un événement/i }));
    await user.type(screen.getByLabelText(/date et heure/i), '2026-01-06T18:00');
    await user.type(screen.getByLabelText(/^lieu$/i), 'Gymnase B');
    await user.click(screen.getByRole('button', { name: /créer l'événement/i }));

    await waitFor(() => expect(createCalled).toBe(true));
    expect(await screen.findByText('Gymnase B')).toBeInTheDocument();
  });

  it('deletes the team and navigates back to the roster page', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let deleteCalled = false;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json([
          { clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' },
        ]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/members', () => HttpResponse.json([])),
      http.delete('/api/clubs/club-1/teams/team-1', () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^supprimer$/i }));

    await waitFor(() => expect(deleteCalled).toBe(true));
    expect(await screen.findByRole('heading', { name: /effectif du club/i })).toBeInTheDocument();
  });
});
