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

function paginated<T>(
  items: T[],
  overrides: Partial<{ total: number; page: number; pageSize: number }> = {},
) {
  return {
    items,
    total: overrides.total ?? items.length,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 25,
  };
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
        HttpResponse.json(
          paginated([{ clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' }]),
        ),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () =>
        HttpResponse.json(
          paginated([
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
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      // Non-empty, so this section renders its table rather than the empty
      // state (which would add a second "Ajouter un administrateur" button).
      http.get('/api/clubs/club-1/teams/team-1/admins', () =>
        HttpResponse.json([
          { userId: 'user-1', email: 'a@b.com', teamId: 'team-1', createdAt: 'x' },
        ]),
      ),
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
        HttpResponse.json(
          paginated([{ clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' }]),
        ),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
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
        HttpResponse.json(
          paginated([{ clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' }]),
        ),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
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
        HttpResponse.json(
          paginated([{ clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' }]),
        ),
      ),
      // Non-empty roster, so this section renders its table rather than the
      // empty state (which would add a second "Ajouter un joueur" button
      // sharing the same accessible name as the section header's own).
      // Events/admins stay empty/non-empty via the defaults below — their
      // row components add their own "Modifier"/"Supprimer" buttons once
      // populated, which would collide with the team-edit/-delete buttons
      // asserted below, so leave events on the default empty handler.
      http.get('/api/clubs/club-1/teams/team-1/players', () =>
        HttpResponse.json(
          paginated([
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
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/admins', () =>
        HttpResponse.json([
          { userId: 'user-1', email: 'a@b.com', teamId: 'team-1', createdAt: 'x' },
        ]),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    // Team-day management is available to this TeamAdmin...
    expect(await screen.findByRole('button', { name: /ajouter un joueur/i })).toBeInTheDocument();
    // Événements is empty, so the header button and the empty state's CTA
    // both render — either opens the same "Créer un événement" dialog.
    expect(screen.getAllByRole('button', { name: /créer un événement/i }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByRole('button', { name: /^modifier$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ajouter un administrateur/i })).toBeInTheDocument();
    // ...but CTC governance and team deletion stay owner-club-ADMIN-only.
    expect(screen.queryByRole('button', { name: /associer un club/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument();
  });

  it('shows an empty state on all four sections when the team has nothing yet', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/events', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/admins', () => HttpResponse.json([])),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    expect(await screen.findByText('Aucun club partenaire')).toBeInTheDocument();
    expect(screen.getByText('Effectif vide')).toBeInTheDocument();
    expect(screen.getByText('Aucun événement')).toBeInTheDocument();
    expect(screen.getByText("Aucun administrateur d'équipe")).toBeInTheDocument();

    // Clubs partenaires: with no linked clubs at all, this club can't be
    // confirmed as the CTC owner, so isOwner is false and neither the
    // header button nor the empty state's CTA render.
    expect(screen.queryByRole('button', { name: /associer un club/i })).not.toBeInTheDocument();

    // Effectif / Événements / Administrateurs: this club ADMIN can manage
    // the team, so each section shows both its header button and the empty
    // state's own CTA — two buttons sharing the same accessible name, both
    // wired to the same dialog-open state.
    expect(screen.getAllByRole('button', { name: /ajouter un joueur/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /créer un événement/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /ajouter un administrateur/i })).toHaveLength(2);
  });

  it('does not let a non-owning (partner) club admin manage partner clubs or delete the team', async () => {
    mockSession([{ clubId: 'club-2', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-2/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-2/teams/team-1/clubs', () =>
        HttpResponse.json(
          paginated([
            { clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' },
            { clubId: 'club-2', clubName: 'Club B', isOwner: false, linkedAt: 'y' },
          ]),
        ),
      ),
      // Non-empty, so the roster renders its table rather than the empty
      // state (which would add a second "Ajouter un joueur" button).
      http.get('/api/clubs/club-2/teams/team-1/players', () =>
        HttpResponse.json(
          paginated([
            {
              id: 'tp-1',
              teamId: 'team-1',
              playerId: 'p1',
              firstName: 'Alex',
              lastName: 'Dupont',
              clubId: 'club-2',
              role: 'PLAYER',
              createdAt: 'x',
            },
          ]),
        ),
      ),
      http.get('/api/clubs/club-2/players', () => HttpResponse.json(paginated([]))),
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
    let teamClubs = [{ clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' }];
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json(paginated(teamClubs)),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.post('/api/clubs/club-1/teams/team-1/clubs', async ({ request }) => {
        const body = (await request.json()) as { clubId: string };
        const created = {
          clubId: body.clubId,
          clubName: 'Club B',
          isOwner: false,
          linkedAt: '2026-01-02',
        };
        teamClubs = [...teamClubs, created];
        return HttpResponse.json(created);
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
    let teamPlayers: unknown[] = [];
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json(
          paginated([{ clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' }]),
        ),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () =>
        HttpResponse.json(paginated(teamPlayers)),
      ),
      http.get('/api/clubs/club-1/players', () =>
        HttpResponse.json(
          paginated([
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
      ),
      http.post('/api/clubs/club-1/teams/team-1/players', async ({ request }) => {
        const body = (await request.json()) as { playerId: string; role: string };
        const created = {
          id: 'tp-1',
          teamId: 'team-1',
          playerId: body.playerId,
          firstName: 'Alex',
          lastName: 'Dupont',
          clubId: 'club-1',
          role: body.role,
          createdAt: '2026-01-01',
        };
        teamPlayers = [...teamPlayers, created];
        return HttpResponse.json(created);
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    // The roster starts empty, so the header button and the empty state's
    // CTA both render — either opens the same "Ajouter un joueur" dialog.
    await user.click(screen.getAllByRole('button', { name: /ajouter un joueur/i })[0]);

    await user.click(screen.getByRole('combobox', { name: /joueur/i }));
    await user.click(await screen.findByRole('option', { name: 'Alex Dupont' }));
    await user.click(screen.getByRole('button', { name: /ajouter à l'effectif/i }));

    await waitFor(() => expect(screen.getByText('Alex')).toBeInTheDocument());
  });

  it('shows the team events and lets an admin create one', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let events = [
      {
        id: 'event-1',
        teamId: 'team-1',
        startsAt: '2026-01-05T18:00:00.000Z',
        location: 'Gymnase A',
        notes: null,
        createdAt: 'x',
      },
    ];
    let createCalled = false;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json(
          paginated([{ clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' }]),
        ),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/events', () => HttpResponse.json(paginated(events))),
      http.post('/api/clubs/club-1/teams/team-1/events', async ({ request }) => {
        createCalled = true;
        const body = (await request.json()) as { startsAt: string; location: string };
        const created = {
          id: 'event-2',
          teamId: 'team-1',
          startsAt: body.startsAt,
          location: body.location,
          notes: null,
          createdAt: 'x',
        };
        events = [...events, created];
        return HttpResponse.json([created]);
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

  it('filters the roster by search text, debounced', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const requestedSearches: string[] = [];
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', ({ request }) => {
        const url = new URL(request.url);
        requestedSearches.push(url.searchParams.get('search') ?? '');
        return HttpResponse.json(
          paginated([
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
        );
      }),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('Alex')).toBeInTheDocument());
    await user.type(screen.getByLabelText("Rechercher un joueur de l'effectif"), 'dup');

    await waitFor(() => expect(requestedSearches).toContain('dup'), { timeout: 2000 });
  });

  it('shows a filtered empty state (no add CTA) when the roster search matches no one', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', ({ request }) => {
        const url = new URL(request.url);
        const search = url.searchParams.get('search');
        return HttpResponse.json(
          paginated(
            search
              ? []
              : [
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
                ],
          ),
        );
      }),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('Alex')).toBeInTheDocument());
    await user.type(screen.getByLabelText("Rechercher un joueur de l'effectif"), 'zzz');

    expect(await screen.findByText('Aucun résultat')).toBeInTheDocument();
    // Only the section header's own button remains — the empty state's CTA
    // is suppressed while a search filter is active.
    expect(screen.getAllByRole('button', { name: /ajouter un joueur/i })).toHaveLength(1);
  });

  it('paginates the roster', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const requestedPages: (string | null)[] = [];
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', ({ request }) => {
        const url = new URL(request.url);
        requestedPages.push(url.searchParams.get('page'));
        return HttpResponse.json(
          paginated(
            [
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
            ],
            { total: 60 },
          ),
        );
      }),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('Alex')).toBeInTheDocument());
    expect(screen.getByText('Page 1 / 3')).toBeInTheDocument();

    // The Clubs partenaires section is empty (total 0), so its Pagination is
    // suppressed entirely — only the roster's "Suivant" button renders.
    const nextButtons = screen.getAllByRole('button', { name: 'Suivant' });
    expect(nextButtons).toHaveLength(1);
    await user.click(nextButtons[0]);

    await waitFor(() => expect(requestedPages).toContain('2'));
  });

  it('deletes the team and navigates back to the roster page', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let deleteCalled = false;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json(
          paginated([{ clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' }]),
        ),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/members', () => HttpResponse.json(paginated([]))),
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
