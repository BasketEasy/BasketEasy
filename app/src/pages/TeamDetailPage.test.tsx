import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';

// jsdom's default innerWidth (1024) lands above the desktop breakpoint, so
// every other test in this file exercises the table path for free; only the
// mobile-card test below needs to override it.
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[]) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', emailVerified: true, memberships }),
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

const alexRoster = [
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
];

async function goToTab(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole('tab', { name }));
}

// The Événements tab's agenda view (item 5a) filters to startsAt >= today,
// so event fixtures for it must float relative to the actual clock instead
// of a fixed calendar date — otherwise this suite would start failing the
// moment "today" catches up to a hardcoded date.
function futureIso(daysFromNow: number, hour = 18): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

function futureDateTimeLocal(daysFromNow: number, hour = 18): string {
  return futureIso(daysFromNow, hour).slice(0, 16);
}

describe('TeamDetailPage', () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it('collapses the Clubs partenaires table to cards below the desktop breakpoint', async () => {
    setViewportWidth(375);
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
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1?tab=clubs' });

    expect(await screen.findByText('COC Basket')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the team header above the tabs, defaults to the Événements tab, and shows the Effectif tab as a card view once selected', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () =>
        HttpResponse.json(
          paginated([{ clubId: 'club-1', clubName: 'COC Basket', isOwner: true, linkedAt: 'x' }]),
        ),
      ),
      http.get('/api/clubs/club-1/teams/team-1/players', () =>
        HttpResponse.json(paginated(alexRoster)),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    expect(screen.getByText('U15 · Masculin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^supprimer$/i })).toBeInTheDocument();

    // Événements is the default tab.
    expect(screen.getByRole('tab', { name: 'Événements', selected: true })).toBeInTheDocument();

    // Effectif: card view — grouped by role, initials + name, no sortable
    // table/rôle <select> visible yet.
    await goToTab(user, /^effectif$/i);
    expect(screen.getByText('Joueurs (1)')).toBeInTheDocument();
    expect(screen.getByText('AD')).toBeInTheDocument();
    expect(screen.getByText('Alex Dupont')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /^rôle$/i })).not.toBeInTheDocument();
  });

  it('switches tabs via their trigger, reflected in the ?tab= URL param', async () => {
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
      http.get('/api/clubs/club-1/teams/team-1/admins', () =>
        HttpResponse.json([
          { userId: 'user-1', email: 'a@b.com', teamId: 'team-1', createdAt: 'x' },
        ]),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());

    // Reaching Administrateurs is a single click, no scrolling past the
    // other three sections — they aren't even in the DOM at the same time.
    await goToTab(user, /^administrateurs$/i);
    expect(await screen.findByText('a@b.com')).toBeInTheDocument();
    expect(screen.queryByText('COC Basket')).not.toBeInTheDocument();

    await goToTab(user, /clubs partenaires/i);
    expect(await screen.findByText('COC Basket')).toBeInTheDocument();
    expect(screen.queryByText('a@b.com')).not.toBeInTheDocument();
  });

  it('opens the Statistiques tab from the URL and renders the season', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/stats', () =>
        HttpResponse.json({
          seasonYear: 2026,
          seasonStart: '2026-09-01T00:00:00.000Z',
          seasonEnd: '2027-08-31T23:59:59.999Z',
          matchesPlayed: 3,
          availableSeasons: [2026],
          players: [
            {
              teamPlayerId: 'tp-1',
              firstName: 'Camille',
              lastName: 'Roy',
              role: 'PLAYER',
              gamesPlayed: 3,
              pointsPerGame: 9.5,
              foulsPerGame: 1,
              seasonHighPoints: 14,
              seasonHighFouls: 2,
              freeThrowPoints: 3,
              twoPointPoints: 20,
              threePointPoints: 6,
              totalPoints: 29,
              mvpAwards: 1,
              worstPlayerAwards: 0,
            },
          ],
        }),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1?tab=stats' });

    expect(await screen.findByText('Camille Roy')).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /^statistiques$/i, selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByText('Calculé sur 3 matchs analysés.')).toBeInTheDocument();
  });

  it('lands on the tab named by the ?tab= URL param on initial load', async () => {
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
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1?tab=clubs' });

    expect(await screen.findByText('COC Basket')).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /clubs partenaires/i, selected: true }),
    ).toBeInTheDocument();
  });

  it('lets an admin change the category and gender from the header, above the tabs', async () => {
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

  it('hides all admin controls for a MEMBER, and hides the Clubs partenaires/Administrateurs tabs entirely', async () => {
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

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument();

    // A plain roster MEMBER (no club-admin rights, no TeamAdmin grant) never
    // sees the management-only tabs at all.
    expect(screen.queryByRole('tab', { name: /clubs partenaires/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^administrateurs$/i })).not.toBeInTheDocument();

    await goToTab(user, /^effectif$/i);
    expect(screen.queryByRole('button', { name: /ajouter un joueur/i })).not.toBeInTheDocument();
  });

  it('falls back to Agenda when a MEMBER requests the Clubs/Administrateurs tab directly via the URL', async () => {
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

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1?tab=clubs' });

    // The "clubs" tab isn't in this MEMBER's (player's) tab list at all, so
    // the underlying "events" tab is selected — labelled "Agenda", not
    // "Événements", for a player (§4.4 of the player-journey doc).
    expect(await screen.findByRole('tab', { name: 'Agenda', selected: true })).toBeInTheDocument();
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
      http.get('/api/clubs/club-1/teams/team-1/players', () =>
        HttpResponse.json(paginated(alexRoster)),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/admins', () =>
        HttpResponse.json([
          { userId: 'user-1', email: 'a@b.com', teamId: 'team-1', createdAt: 'x' },
        ]),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    // Événements is the default tab, empty by default (no explicit mock
    // above), so the header button and the empty state's own CTA both
    // render — either opens the same "Créer un événement" dialog.
    expect(
      (await screen.findAllByRole('button', { name: /créer un événement/i })).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^modifier$/i })).toBeInTheDocument();

    // Team-day management is available to this TeamAdmin...
    await goToTab(user, /^effectif$/i);
    expect(await screen.findByRole('button', { name: /ajouter un joueur/i })).toBeInTheDocument();

    await goToTab(user, /^administrateurs$/i);
    expect(
      await screen.findByRole('button', { name: /ajouter un administrateur/i }),
    ).toBeInTheDocument();

    // ...but CTC governance and team deletion stay owner-club-ADMIN-only.
    await goToTab(user, /clubs partenaires/i);
    expect(screen.queryByRole('button', { name: /associer un club/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument();
  });

  it('shows an empty state on each tab when the team has nothing yet', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/events', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/admins', () => HttpResponse.json([])),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    // Événements (default tab): empty state, with the header button and the
    // empty state's own CTA sharing the "Créer un événement" name.
    expect(await screen.findByText('Aucun événement')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /créer un événement/i })).toHaveLength(2);

    // Effectif: card view's empty branch is the same EmptyState the table
    // view would show, with the header button and the empty state's own
    // CTA sharing the "Ajouter un joueur" name.
    await goToTab(user, /^effectif$/i);
    expect(await screen.findByText('Effectif vide')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /ajouter un joueur/i })).toHaveLength(2);

    await goToTab(user, /clubs partenaires/i);
    expect(await screen.findByText('Aucun club partenaire')).toBeInTheDocument();
    // With no linked clubs at all, this club can't be confirmed as the CTC
    // owner, so isOwner is false and neither CTA renders.
    expect(screen.queryByRole('button', { name: /associer un club/i })).not.toBeInTheDocument();

    await goToTab(user, /^administrateurs$/i);
    expect(await screen.findByText("Aucun administrateur d'équipe")).toBeInTheDocument();
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
      http.get('/api/clubs/club-2/teams/team-1/players', () =>
        HttpResponse.json(paginated([{ ...alexRoster[0], clubId: 'club-2' }])),
      ),
      http.get('/api/clubs/club-2/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-2/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument();

    // Roster management stays available to any linked club's admin.
    await goToTab(user, /^effectif$/i);
    expect(screen.getByRole('button', { name: /ajouter un joueur/i })).toBeInTheDocument();

    await goToTab(user, /clubs partenaires/i);
    expect(screen.queryByRole('button', { name: /associer un club/i })).not.toBeInTheDocument();
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
    await goToTab(user, /clubs partenaires/i);
    await user.click(await screen.findByRole('button', { name: /associer un club/i }));

    await user.type(screen.getByLabelText(/identifiant du club partenaire/i), 'club-2');
    await user.click(screen.getByRole('button', { name: /^associer$/i }));

    await waitFor(() => expect(screen.getByText('Club B')).toBeInTheDocument());
  });

  it('adds a player from the current club to the roster, and shows it in card view', async () => {
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
    await goToTab(user, /^effectif$/i);
    // The roster starts empty, so the header button and the empty state's
    // CTA both render — either opens the same "Ajouter un joueur" dialog.
    await user.click(screen.getAllByRole('button', { name: /ajouter un joueur/i })[0]);

    await user.click(screen.getByRole('combobox', { name: /joueur/i }));
    await user.click(await screen.findByRole('option', { name: 'Alex Dupont' }));
    await user.click(screen.getByRole('button', { name: /ajouter à l'effectif/i }));

    await waitFor(() => expect(screen.getByText('Alex Dupont')).toBeInTheDocument());
    expect(screen.getByText('Joueurs (1)')).toBeInTheDocument();
  });

  it('shows the team events and lets an admin create one', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let events = [
      {
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: futureIso(1),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        venue: null,
        recurrenceId: null,
        createdAt: 'x',
        myRsvpStatus: null,
        isImported: false,
        timeConfirmed: true,
        myConvocation: false,
        rsvpSummary: {
          rosterSize: 0,
          convoked: 0,
          answering: 0,
          going: 0,
          maybe: 0,
          notGoing: 0,
          pending: 0,
          isConvocationScoped: false,
        },
        logistics: { jerseys: null, balls: null },
        result: null,
        myMatchStats: null,
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
          type: 'TRAINING',
          startsAt: body.startsAt,
          location: body.location,
          notes: null,
          opponentName: null,
          venue: null,
          recurrenceId: null,
          createdAt: 'x',
          myRsvpStatus: null,
          isImported: false,
          timeConfirmed: true,
          myConvocation: false,
          rsvpSummary: {
            rosterSize: 0,
            convoked: 0,
            answering: 0,
            going: 0,
            maybe: 0,
            notGoing: 0,
            pending: 0,
            isConvocationScoped: false,
          },
          logistics: { jerseys: null, balls: null },
          result: null,
          myMatchStats: null,
        };
        events = [...events, created];
        return HttpResponse.json([created]);
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    await goToTab(user, /événements/i);

    expect(await screen.findByText('Gymnase A')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /créer un événement/i }));
    await user.type(screen.getByLabelText(/date et heure/i), futureDateTimeLocal(2));
    await user.type(screen.getByLabelText(/^lieu$/i), 'Gymnase B');
    await user.click(screen.getByRole('button', { name: /créer l'événement/i }));

    await waitFor(() => expect(createCalled).toBe(true));
    expect(await screen.findByText('Gymnase B')).toBeInTheDocument();
  });

  it('shows the à traiter band on the manager Événements tab, scoped to this team’s own items', async () => {
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
      http.get('/api/clubs/club-1/teams/team-1/events', () => HttpResponse.json(paginated([]))),
      http.get('/api/me/dashboard', () =>
        HttpResponse.json({
          totalPlayers: 0,
          upcomingEvents: [],
          actionItems: [
            {
              kind: 'MATCH_WITHOUT_CONVOCATIONS',
              clubId: 'club-1',
              clubName: 'COC Basket',
              teamId: 'team-1',
              teamName: 'U15 Garçons',
              eventId: 'event-1',
              message: "Match contre l'ES Rezé samedi — personne n'a encore été convoqué.",
            },
            // A different team's item must never leak onto this team's page.
            {
              kind: 'PLAYERS_WITHOUT_ACCOUNT',
              clubId: 'club-1',
              clubName: 'COC Basket',
              teamId: 'team-2',
              teamName: 'Autre équipe',
              eventId: null,
              message: "Jeanne Martin n'a pas encore de compte Kluvo.",
            },
          ],
        }),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    expect(await screen.findByText(/personne n'a encore été convoqué/)).toBeInTheDocument();
    expect(screen.queryByText(/jeanne martin/i)).not.toBeInTheDocument();
  });

  it('toggles the Événements tab between agenda view and table view, resetting the table filters on each switch', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const requestedSearches: string[] = [];
    const events = [
      {
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: futureIso(1),
        location: 'Gymnase A',
        notes: null,
        opponentName: null,
        venue: null,
        recurrenceId: null,
        createdAt: 'x',
        myRsvpStatus: null,
        isImported: false,
        timeConfirmed: true,
        myConvocation: false,
        rsvpSummary: {
          rosterSize: 0,
          convoked: 0,
          answering: 0,
          going: 0,
          maybe: 0,
          notGoing: 0,
          pending: 0,
          isConvocationScoped: false,
        },
        logistics: { jerseys: null, balls: null },
        result: null,
        myMatchStats: null,
      },
    ];
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/events', ({ request }) => {
        const url = new URL(request.url);
        requestedSearches.push(url.searchParams.get('search') ?? '');
        return HttpResponse.json(paginated(events));
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });
    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    await goToTab(user, /événements/i);

    // Defaults to agenda view — no search input, no sortable table, but a
    // day heading and the event's details render as a card.
    expect(await screen.findByText('Gymnase A')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rechercher un événement')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Date' })).not.toBeInTheDocument();

    const agendaOption = screen.getByRole('button', { name: 'Agenda' });
    const listOption = screen.getByRole('button', { name: 'Liste' });
    expect(agendaOption).toHaveAttribute('aria-pressed', 'true');
    expect(listOption).toHaveAttribute('aria-pressed', 'false');

    await user.click(listOption);

    // Table view: the existing sortable/searchable/paginated table.
    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
    expect(screen.getByText('Gymnase A')).toBeInTheDocument();
    expect(listOption).toHaveAttribute('aria-pressed', 'true');
    expect(agendaOption).toHaveAttribute('aria-pressed', 'false');
    const searchInput = screen.getByLabelText('Rechercher un événement');
    expect(searchInput).toHaveValue('');

    await user.type(searchInput, 'gym');
    await waitFor(() => expect(requestedSearches).toContain('gym'), { timeout: 2000 });

    // Toggling back to agenda resets the search that was active in table view.
    await user.click(agendaOption);
    expect(screen.queryByLabelText('Rechercher un événement')).not.toBeInTheDocument();
    await waitFor(() => expect(requestedSearches[requestedSearches.length - 1]).toBe(''));
    expect(screen.getByText('Gymnase A')).toBeInTheDocument();
  });

  it('toggles the agenda between upcoming and past events, and resets to upcoming when leaving agenda view', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const upcomingEvent = {
      id: 'event-future',
      teamId: 'team-1',
      type: 'TRAINING',
      startsAt: futureIso(1),
      location: 'Gymnase Futur',
      notes: null,
      opponentName: null,
      venue: null,
      recurrenceId: null,
      createdAt: 'x',
      myRsvpStatus: null,
      isImported: false,
      timeConfirmed: true,
      myConvocation: false,
      rsvpSummary: {
        rosterSize: 0,
        convoked: 0,
        answering: 0,
        going: 0,
        maybe: 0,
        notGoing: 0,
        pending: 0,
        isConvocationScoped: false,
      },
      logistics: { jerseys: null, balls: null },
      result: null,
      myMatchStats: null,
    };
    const pastEvent = {
      ...upcomingEvent,
      id: 'event-past',
      startsAt: futureIso(-7),
      location: 'Gymnase Passé',
    };
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/events', ({ request }) => {
        const url = new URL(request.url);
        const items = url.searchParams.has('to') ? [pastEvent] : [upcomingEvent];
        return HttpResponse.json(paginated(items));
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });
    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    await goToTab(user, /événements/i);

    // Defaults to "À venir" and shows the upcoming event only.
    expect(await screen.findByText('Gymnase Futur')).toBeInTheDocument();
    const upcomingOption = screen.getByRole('button', { name: 'À venir' });
    const pastOption = screen.getByRole('button', { name: 'Passés' });
    expect(upcomingOption).toHaveAttribute('aria-pressed', 'true');
    expect(pastOption).toHaveAttribute('aria-pressed', 'false');

    await user.click(pastOption);
    expect(await screen.findByText('Gymnase Passé')).toBeInTheDocument();
    expect(screen.queryByText('Gymnase Futur')).not.toBeInTheDocument();
    expect(pastOption).toHaveAttribute('aria-pressed', 'true');
    expect(upcomingOption).toHaveAttribute('aria-pressed', 'false');

    // Switching to table view and back to agenda resets the period to upcoming.
    await user.click(screen.getByRole('button', { name: 'Liste' }));
    await user.click(screen.getByRole('button', { name: 'Agenda' }));
    expect(screen.getByRole('button', { name: 'À venir' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles the Effectif tab between card view and table view, resetting search/sort/page on each switch', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const requestedSearches: string[] = [];
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', ({ request }) => {
        const url = new URL(request.url);
        requestedSearches.push(url.searchParams.get('search') ?? '');
        return HttpResponse.json(paginated(alexRoster));
      }),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });
    await goToTab(user, /^effectif$/i);

    // Defaults to card view — no search input, no sortable table.
    expect(await screen.findByText('Alex Dupont')).toBeInTheDocument();
    expect(screen.queryByLabelText("Rechercher un joueur de l'effectif")).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Prénom' })).not.toBeInTheDocument();

    const cardsOption = screen.getByRole('button', { name: 'Cartes' });
    const tableOption = screen.getByRole('button', { name: 'Tableau' });
    expect(cardsOption).toHaveAttribute('aria-pressed', 'true');
    expect(tableOption).toHaveAttribute('aria-pressed', 'false');

    await user.click(tableOption);

    // Table view: the existing sortable/searchable table is revealed.
    expect(screen.getByRole('columnheader', { name: 'Prénom' })).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(tableOption).toHaveAttribute('aria-pressed', 'true');
    expect(cardsOption).toHaveAttribute('aria-pressed', 'false');
    const searchInput = screen.getByLabelText("Rechercher un joueur de l'effectif");
    expect(searchInput).toHaveValue('');

    await user.type(searchInput, 'dup');
    await waitFor(() => expect(requestedSearches).toContain('dup'), { timeout: 2000 });

    // Toggling back to cards resets the search that was active in table view.
    await user.click(cardsOption);
    expect(screen.queryByLabelText("Rechercher un joueur de l'effectif")).not.toBeInTheDocument();
    await waitFor(() => expect(requestedSearches[requestedSearches.length - 1]).toBe(''));
    expect(screen.getByText('Alex Dupont')).toBeInTheDocument();
  });

  it('groups the card view by role, with a Joueuses heading for a WOMEN team', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () =>
        HttpResponse.json({ ...baseTeam, gender: 'WOMEN' }),
      ),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', () =>
        HttpResponse.json(
          paginated([
            alexRoster[0],
            {
              id: 'tp-2',
              teamId: 'team-1',
              playerId: 'p2',
              firstName: 'Sam',
              lastName: 'Martin',
              clubId: 'club-1',
              role: 'COACH',
              createdAt: 'x',
            },
          ]),
        ),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });
    await goToTab(user, /^effectif$/i);

    expect(await screen.findByText('Joueuses (1)')).toBeInTheDocument();
    expect(screen.getByText('Staff (1)')).toBeInTheDocument();
    expect(screen.getByText('Alex Dupont')).toBeInTheDocument();
    expect(screen.getByText('AD')).toBeInTheDocument();
    expect(screen.getByText('Sam Martin')).toBeInTheDocument();
    expect(screen.getByText('SM')).toBeInTheDocument();
  });

  it('filters the roster by search text, debounced, in table view', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const requestedSearches: string[] = [];
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', ({ request }) => {
        const url = new URL(request.url);
        requestedSearches.push(url.searchParams.get('search') ?? '');
        return HttpResponse.json(paginated(alexRoster));
      }),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });
    await goToTab(user, /^effectif$/i);

    await waitFor(() => expect(screen.getByText('Alex Dupont')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Tableau' }));
    await user.type(screen.getByLabelText("Rechercher un joueur de l'effectif"), 'dup');

    await waitFor(() => expect(requestedSearches).toContain('dup'), { timeout: 2000 });
  });

  it('shows a filtered empty state (no add CTA) when the table-view roster search matches no one', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', ({ request }) => {
        const url = new URL(request.url);
        const search = url.searchParams.get('search');
        return HttpResponse.json(paginated(search ? [] : alexRoster));
      }),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });
    await goToTab(user, /^effectif$/i);

    await waitFor(() => expect(screen.getByText('Alex Dupont')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Tableau' }));
    await user.type(screen.getByLabelText("Rechercher un joueur de l'effectif"), 'zzz');

    expect(await screen.findByText('Aucun résultat')).toBeInTheDocument();
    // Only the header's own button remains — the empty state's CTA is
    // suppressed while a search filter is active.
    expect(screen.getAllByRole('button', { name: /ajouter un joueur/i })).toHaveLength(1);
  });

  it('paginates the roster in table view', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    const requestedPages: (string | null)[] = [];
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', ({ request }) => {
        const url = new URL(request.url);
        requestedPages.push(url.searchParams.get('page'));
        return HttpResponse.json(paginated(alexRoster, { total: 60 }));
      }),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });
    await goToTab(user, /^effectif$/i);

    await waitFor(() => expect(screen.getByText('Alex Dupont')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Tableau' }));

    expect(screen.getByText('Page 1 / 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Suivant' }));

    await waitFor(() => expect(requestedPages).toContain('2'));
  });

  it('deletes the team and navigates back to the club roster page', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    let deleteCalled = false;
    server.use(
      http.get('/api/clubs/club-1', () =>
        HttpResponse.json({ id: 'club-1', name: 'COC Basket', createdAt: 'x' }),
      ),
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
    // Deletion is now gated behind typing the team name to confirm — a
    // single click no longer suffices (see Task 9 of the Parquet revamp).
    await user.type(await screen.findByLabelText(/Saisissez/), 'U15 Garçons');
    await user.click(screen.getByRole('button', { name: /supprimer définitivement/i }));

    await waitFor(() => expect(deleteCalled).toBe(true));
    expect(
      await screen.findByRole('heading', { name: /effectif · coc basket/i }),
    ).toBeInTheDocument();
  });

  it('shows a "← Mes équipes" back link that navigates to /my-teams', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams', () => HttpResponse.json(paginated([]))),
      http.get('/api/me/teams', () => HttpResponse.json([])),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /retour à l'effectif/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /^← mes équipes$/i }));

    expect(await screen.findByRole('heading', { name: /mes équipes/i })).toBeInTheDocument();
  });

  it('hides the back link on a narrow screen — the bottom bar is the way back there', async () => {
    setViewportWidth(375);
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      http.get('/api/clubs/club-1/teams', () => HttpResponse.json(paginated([]))),
      http.get('/api/me/teams', () => HttpResponse.json([])),
    );

    renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

    await waitFor(() => expect(screen.getByText('U15 Garçons')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /^← mes équipes$/i })).not.toBeInTheDocument();
  });

  describe('player role (no manage rights)', () => {
    function mockRostered() {
      server.use(
        http.get('/api/me/teams', () =>
          HttpResponse.json([
            {
              teamId: 'team-1',
              teamName: baseTeam.name,
              category: baseTeam.category,
              gender: baseTeam.gender,
              clubId: 'club-1',
              clubName: 'COC Basket',
              isTeamAdmin: false,
              rosterRole: 'PLAYER',
            },
          ]),
        ),
      );
    }

    it('shows three tabs — Agenda (default), Effectif, Mes stats — with no Agenda/Liste toggle', async () => {
      mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
      mockRostered();
      server.use(
        http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
        http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/teams/team-1/events', () => HttpResponse.json(paginated([]))),
      );

      renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

      // Agenda is the default, selected tab — same route as the manager's
      // Événements default, just relabelled and reordered first.
      expect(
        await screen.findByRole('tab', { name: 'Agenda', selected: true }),
      ).toBeInTheDocument();
      // Trailing digit is the (aria-hidden) roster-count badge's text —
      // stripped so this compares labels, not label+badge.
      const tabs = (await screen.findAllByRole('tab')).map((tab) =>
        tab.textContent?.replace(/\d+$/, ''),
      );
      expect(tabs).toEqual(['Agenda', 'Effectif', 'Mes stats']);
      expect(screen.queryByRole('tab', { name: /clubs partenaires/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: /^administrateurs$/i })).not.toBeInTheDocument();

      // No Agenda/Liste power-view toggle — a player never gets the manager's
      // paginated table.
      expect(screen.queryByRole('button', { name: 'Liste' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Agenda' })).not.toBeInTheDocument();
      // À venir/Passés stays — real content-scoping, not a power-user escape
      // hatch.
      expect(screen.getByRole('button', { name: 'À venir' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Passés' })).toBeInTheDocument();
    });

    it('carries an inline RSVP control on each agenda card for a rostered player', async () => {
      mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
      mockRostered();
      const upcomingEvent = {
        id: 'event-1',
        teamId: 'team-1',
        type: 'TRAINING',
        startsAt: futureIso(1),
        location: 'Gymnase du Vigneau',
        notes: null,
        opponentName: null,
        venue: null,
        recurrenceId: null,
        createdAt: 'x',
        myRsvpStatus: null,
        isImported: false,
        timeConfirmed: true,
        myConvocation: false,
        rsvpSummary: {
          rosterSize: 0,
          convoked: 0,
          answering: 0,
          going: 0,
          maybe: 0,
          notGoing: 0,
          pending: 0,
          isConvocationScoped: false,
        },
        logistics: { jerseys: null, balls: null },
        result: null,
        myMatchStats: null,
      };
      server.use(
        http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
        http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/teams/team-1/events', () =>
          HttpResponse.json(paginated([upcomingEvent])),
        ),
      );

      renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

      expect(await screen.findByText('Gymnase du Vigneau')).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Ma réponse' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Présent' })).toBeInTheDocument();
    });

    it('shows an error state (not an empty state) when the player Agenda tab fails to load', async () => {
      mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
      mockRostered();
      server.use(
        http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
        http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/teams/team-1/events', () =>
          HttpResponse.json({ message: 'boom' }, { status: 500 }),
        ),
      );

      renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

      expect(await screen.findByText('Chargement impossible')).toBeInTheDocument();
      expect(screen.queryByText('Aucun événement')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument();
    });

    it('labels the Statistiques tab "Mes stats" for a player and still renders the season table', async () => {
      mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
      mockRostered();
      server.use(
        http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
        http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/teams/team-1/players', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/teams/team-1/stats', () =>
          HttpResponse.json({
            seasonYear: 2026,
            seasonStart: '2026-09-01T00:00:00.000Z',
            seasonEnd: '2027-08-31T23:59:59.999Z',
            matchesPlayed: 1,
            availableSeasons: [2026],
            players: [
              {
                teamPlayerId: 'tp-1',
                firstName: 'Léa',
                lastName: 'Moreau',
                role: 'PLAYER',
                gamesPlayed: 1,
                pointsPerGame: 11,
                foulsPerGame: 2,
                seasonHighPoints: 11,
                seasonHighFouls: 2,
                freeThrowPoints: 2,
                twoPointPoints: 6,
                threePointPoints: 3,
                totalPoints: 11,
                mvpAwards: 1,
                worstPlayerAwards: 0,
              },
            ],
          }),
        ),
      );

      renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1?tab=stats' });

      expect(
        await screen.findByRole('tab', { name: 'Mes stats', selected: true }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: /^statistiques$/i })).not.toBeInTheDocument();
      // The squad-ranking table renders regardless of role. This fixture's
      // row carries no isMe (the field a real server always sends, per
      // phase 6) so there is nothing to mark as "vous" and no personal card
      // above it — the graceful case of a response with no caller-owned row.
      expect(await screen.findByText('Léa Moreau')).toBeInTheDocument();
      expect(screen.queryByText('vous')).not.toBeInTheDocument();
    });

    it('still shows the Effectif tab for a player, with no roster-management controls', async () => {
      mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
      mockRostered();
      server.use(
        http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
        http.get('/api/clubs/club-1/teams/team-1/clubs', () => HttpResponse.json(paginated([]))),
        http.get('/api/clubs/club-1/teams/team-1/players', () =>
          HttpResponse.json(paginated(alexRoster)),
        ),
        http.get('/api/clubs/club-1/players', () => HttpResponse.json(paginated([]))),
      );

      const user = userEvent.setup();
      renderWithProviders(<App />, { route: '/clubs/club-1/teams/team-1' });

      await goToTab(user, /^effectif$/i);
      expect(await screen.findByText('Alex Dupont')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /ajouter un joueur/i })).not.toBeInTheDocument();
    });
  });
});
