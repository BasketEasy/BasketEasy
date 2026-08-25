import { afterEach, describe, expect, it } from 'vitest';
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

// jsdom's default innerWidth (1024) lands above the desktop breakpoint, so
// every other test in this file exercises the table path for free; only the
// mobile-card tests below need to override it.
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

describe('MembersPage', () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it('shows the Membres tab by default, with the add-member form and remove buttons for an ADMIN', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json(
          paginated([
            { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
            { userId: 'user-2', email: 'b@example.com', role: 'MEMBER', joinedAt: '2026-01-02' },
          ]),
        ),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('b@example.com')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /ajouter un membre/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /retirer/i })).toHaveLength(2);
  });

  it('shows a 403 page for a non-admin (MEMBER role, or no membership at all) without calling the members/players/teams endpoints', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    let membersRequested = false;
    let playersRequested = false;
    let teamsRequested = false;
    server.use(
      http.get('/api/clubs/club-1/members', () => {
        membersRequested = true;
        return HttpResponse.json(paginated([]));
      }),
      http.get('/api/clubs/club-1/players', () => {
        playersRequested = true;
        return HttpResponse.json(paginated([]));
      }),
      http.get('/api/clubs/club-1/teams', () => {
        teamsRequested = true;
        return HttpResponse.json(paginated([]));
      }),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    expect(await screen.findByRole('heading', { name: /accès non autorisé/i })).toBeInTheDocument();
    expect(membersRequested).toBe(false);
    expect(playersRequested).toBe(false);
    expect(teamsRequested).toBe(false);
  });

  it('shows an error instead of silently doing nothing when removing the last admin fails', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json(
          paginated([
            { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
          ]),
        ),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.delete('/api/clubs/club-1/members/user-1', () =>
        HttpResponse.json({ message: 'Cannot remove the last admin of a club' }, { status: 400 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /retirer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /informations saisies sont invalides/i,
    );
    expect(screen.getByText('a@b.com')).toBeInTheDocument();
  });

  it('shows a note and requires confirmation before removing a member linked to a player', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let removeCalled = false;
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json(
          paginated([
            { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
            { userId: 'user-2', email: 'b@example.com', role: 'MEMBER', joinedAt: '2026-01-02' },
          ]),
        ),
      ),
      http.get('/api/clubs/club-1/players', () =>
        HttpResponse.json(
          paginated([
            {
              id: 'p1',
              clubId: 'club-1',
              firstName: 'Alex',
              lastName: 'Dupont',
              userId: 'user-2',
              createdAt: 'x',
            },
          ]),
        ),
      ),
      http.delete('/api/clubs/club-1/members/user-2', () => {
        removeCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('b@example.com')).toBeInTheDocument());
    expect(screen.getByText('Alex Dupont')).toBeInTheDocument();

    const retirerButtons = screen.getAllByRole('button', { name: /retirer/i });
    await user.click(retirerButtons[1]); // b@example.com's row

    expect(screen.getByText(/fiche joueur liée : alex dupont/i)).toBeInTheDocument();
    expect(removeCalled).toBe(false);

    await user.click(screen.getByRole('button', { name: /confirmer/i }));

    await waitFor(() => expect(removeCalled).toBe(true));
  });

  it('removes a member with no linked player immediately, without a confirmation step', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let removeCalled = false;
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json(
          paginated([
            { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
            { userId: 'user-2', email: 'b@example.com', role: 'MEMBER', joinedAt: '2026-01-02' },
          ]),
        ),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.delete('/api/clubs/club-1/members/user-2', () => {
        removeCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('b@example.com')).toBeInTheDocument());
    const retirerButtons = screen.getAllByRole('button', { name: /retirer/i });
    await user.click(retirerButtons[1]);

    expect(screen.queryByRole('button', { name: /confirmer/i })).not.toBeInTheDocument();
    await waitFor(() => expect(removeCalled).toBe(true));
  });

  it('opens the add-member form in a modal, and closes it after a successful submit', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.post('/api/clubs/club-1/members', async ({ request }) => {
        const body = (await request.json()) as { email: string };
        return HttpResponse.json({
          userId: 'user-2',
          email: body.email,
          role: 'MEMBER',
          joinedAt: '2026-01-02',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    // The list is empty, so both the header's "+ Ajouter" button and the
    // empty state's CTA render — they open the same controlled Dialog.
    expect(await screen.findByText('Aucun membre pour le moment')).toBeInTheDocument();
    const addButtons = screen.getAllByRole('button', { name: /ajouter un membre/i });
    expect(addButtons).toHaveLength(2);
    expect(screen.queryByLabelText(/adresse e-mail du membre/i)).not.toBeInTheDocument();

    // Click the empty state's own CTA (the second button) to confirm it
    // wires up to the same dialog-open state as the page's main button.
    await user.click(addButtons[1]);
    expect(screen.getByRole('heading', { name: /ajouter un membre/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/adresse e-mail du membre/i), 'b@example.com');
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    await waitFor(() =>
      expect(screen.queryByLabelText(/adresse e-mail du membre/i)).not.toBeInTheDocument(),
    );
  });

  it('filters the members table by search text, debounced', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const requestedSearches: string[] = [];
    server.use(
      http.get('/api/clubs/club-1/members', ({ request }) => {
        const url = new URL(request.url);
        requestedSearches.push(url.searchParams.get('search') ?? '');
        return HttpResponse.json(
          paginated([
            { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
          ]),
        );
      }),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Rechercher un membre'), 'dup');

    await waitFor(() => expect(requestedSearches).toContain('dup'), { timeout: 2000 });
  });

  it('shows a filtered empty state (no add CTA) when a search matches no member', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', ({ request }) => {
        const url = new URL(request.url);
        const search = url.searchParams.get('search');
        return HttpResponse.json(
          paginated(
            search
              ? []
              : [{ userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' }],
          ),
        );
      }),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Rechercher un membre'), 'zzz');

    expect(await screen.findByText('Aucun résultat')).toBeInTheDocument();
    // Only the header's own button remains — the empty state's CTA is
    // suppressed while a search filter is active (a bad query, not a
    // genuinely empty club, so "+ Ajouter" wouldn't fix it).
    expect(screen.getAllByRole('button', { name: /ajouter un membre/i })).toHaveLength(1);
  });

  it('filters the members table by role', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const requestedRoles: (string | null)[] = [];
    server.use(
      http.get('/api/clubs/club-1/members', ({ request }) => {
        const url = new URL(request.url);
        requestedRoles.push(url.searchParams.get('role'));
        return HttpResponse.json(
          paginated([
            { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
          ]),
        );
      }),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    await user.click(screen.getByRole('combobox', { name: /^rôle$/i }));
    await user.click(await screen.findByRole('option', { name: 'Administrateur' }));

    await waitFor(() => expect(requestedRoles).toContain('ADMIN'));
  });

  it('paginates the members table', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const requestedPages: (string | null)[] = [];
    server.use(
      http.get('/api/clubs/club-1/members', ({ request }) => {
        const url = new URL(request.url);
        requestedPages.push(url.searchParams.get('page'));
        return HttpResponse.json(
          paginated(
            [{ userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' }],
            {
              total: 60,
            },
          ),
        );
      }),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    expect(screen.getByText('Page 1 / 3')).toBeInTheDocument();

    const nextButtons = screen.getAllByRole('button', { name: 'Suivant' });
    await user.click(nextButtons[0]);

    await waitFor(() => expect(requestedPages).toContain('2'));
  });

  it('switches to the Joueurs tab and shows the create-player form and row controls for an ADMIN', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () => HttpResponse.json(paginated([]))),
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
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    // Membres tab is empty, so its header button and empty-state CTA both
    // render with the same accessible name — just wait for either.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /ajouter un membre/i }).length).toBeGreaterThan(
        0,
      ),
    );
    await user.click(screen.getByRole('tab', { name: /joueurs/i }));

    await waitFor(() => expect(screen.getByText('Alex')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /ajouter un joueur/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /modifier/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /supprimer/i })).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('switches to the Équipes tab and shows the create-team form and a Gérer link for an ADMIN', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams', () =>
        HttpResponse.json(
          paginated([
            { id: 'team-1', name: 'U15 Garçons', category: 'U15', gender: 'MEN', createdAt: 'x' },
          ]),
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    // Membres tab is empty, so its header button and empty-state CTA both
    // render with the same accessible name — just wait for either.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /ajouter un membre/i }).length).toBeGreaterThan(
        0,
      ),
    );
    await user.click(screen.getByRole('tab', { name: /équipes/i }));

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /créer une équipe/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gérer/i })).toBeInTheDocument();
  });

  it('opens the create-team form in a modal, and closes it after a successful submit', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams', () => HttpResponse.json(paginated([]))),
      http.post('/api/clubs/club-1/teams', async ({ request }) => {
        const body = (await request.json()) as { name: string; category: string; gender: string };
        return HttpResponse.json({
          id: 'team-1',
          name: body.name,
          category: body.category,
          gender: body.gender,
          createdAt: '2026-01-01',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByRole('tab', { name: /équipes/i })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /équipes/i }));
    // The list is (and stays, until submit) empty, so the header button and
    // the empty state's CTA both render — either opens the same dialog.
    await user.click(screen.getAllByRole('button', { name: /créer une équipe/i })[0]);

    await user.type(screen.getByLabelText(/nom de l'équipe/i), 'Équipe U15');
    await user.click(screen.getByRole('combobox', { name: /^catégorie$/i }));
    await user.click(await screen.findByRole('option', { name: 'U15' }));
    await user.click(screen.getByRole('combobox', { name: /^genre$/i }));
    await user.click(await screen.findByRole('option', { name: 'Masculin' }));
    await user.click(screen.getByRole('button', { name: /créer l'équipe/i }));

    await waitFor(() =>
      expect(screen.queryByLabelText(/nom de l'équipe/i)).not.toBeInTheDocument(),
    );
  });

  it('shows an empty state with an add CTA on all three tabs when genuinely empty', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    expect(await screen.findByText('Aucun membre pour le moment')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /joueurs/i }));
    expect(await screen.findByText('Aucun joueur pour le moment')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /ajouter un joueur/i })).toHaveLength(2);

    await user.click(screen.getByRole('tab', { name: /équipes/i }));
    expect(await screen.findByText('Aucune équipe pour le moment')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /créer une équipe/i })).toHaveLength(2);
  });

  it('opens the add-player form in a modal, offering unlinked members, and shows the linked email once added', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json(
          paginated([
            { userId: 'user-2', email: 'b@example.com', role: 'MEMBER', joinedAt: '2026-01-02' },
          ]),
        ),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.post('/api/clubs/club-1/players', async ({ request }) => {
        const body = (await request.json()) as {
          firstName: string;
          lastName: string;
          userId?: string;
        };
        return HttpResponse.json({
          id: 'p1',
          clubId: 'club-1',
          firstName: body.firstName,
          lastName: body.lastName,
          userId: body.userId ?? null,
          createdAt: '2026-01-01',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByRole('tab', { name: /joueurs/i })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /joueurs/i }));
    // The roster is empty, so the header button and the empty state's CTA
    // both render — either opens the same "Ajouter un joueur" dialog.
    const addPlayerButtons = await screen.findAllByRole('button', { name: /ajouter un joueur/i });
    await user.click(addPlayerButtons[0]);

    await user.type(screen.getByLabelText(/prénom/i), 'Alex');
    await user.type(screen.getByLabelText(/^nom$/i), 'Dupont');
    await user.click(screen.getByRole('combobox', { name: /compte lié/i }));
    await user.click(await screen.findByRole('option', { name: 'b@example.com' }));
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    await waitFor(() => expect(screen.queryByLabelText(/prénom/i)).not.toBeInTheDocument());
  });

  it('renders the Membres tab as cards (not a table) below the desktop breakpoint, with remove still working', async () => {
    setViewportWidth(375);
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let removeCalled = false;
    server.use(
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json(
          paginated([
            { userId: 'user-1', email: 'a@b.com', role: 'ADMIN', joinedAt: '2026-01-01' },
          ]),
        ),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.delete('/api/clubs/club-1/members/user-1', () => {
        removeCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retirer/i }));
    await waitFor(() => expect(removeCalled).toBe(true));
  });

  it('renders the Joueurs tab as cards below the desktop breakpoint, with inline edit still working', async () => {
    setViewportWidth(375);
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let capturedBody: unknown;
    server.use(
      http.get('/api/clubs/club-1/members', () => HttpResponse.json(paginated([]))),
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
      http.patch('/api/clubs/club-1/players/p1', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 'p1',
          clubId: 'club-1',
          firstName: 'Alexandre',
          lastName: 'Dupont',
          userId: null,
          createdAt: 'x',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByRole('tab', { name: /joueurs/i })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /joueurs/i }));

    await waitFor(() => expect(screen.getByText('Alex Dupont')).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /modifier/i }));
    const firstNameInput = screen.getByLabelText('Prénom');
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Alexandre');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    // The card leaves edit mode on a successful save — same "assert the
    // request, not the refreshed display" scope as PlayerRow.test.tsx, since
    // the display value comes from the page's query cache.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /enregistrer/i })).not.toBeInTheDocument(),
    );
    expect(capturedBody).toEqual({ firstName: 'Alexandre', lastName: 'Dupont', userId: null });
  });

  it('renders the Équipes tab as cards below the desktop breakpoint, with Gérer still navigating', async () => {
    setViewportWidth(375);
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/members', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams', () =>
        HttpResponse.json(
          paginated([
            { id: 'team-1', name: 'U15 Garçons', category: 'U15', gender: 'MEN', createdAt: 'x' },
          ]),
        ),
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
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/members' });

    await waitFor(() => expect(screen.getByRole('tab', { name: /équipes/i })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /équipes/i }));

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /gérer/i }));
    expect(await screen.findByRole('heading', { name: /u15 garçons/i })).toBeInTheDocument();
  });
});
