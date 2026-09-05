import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';
import { AppHeader } from './AppHeader';

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[] = []) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', emailVerified: true, memberships }),
    ),
  );
}

function mockMembersEndpoint(clubId: string, memberEmail: string) {
  server.use(
    http.get(`/api/clubs/${clubId}/members`, () =>
      HttpResponse.json({
        items: [
          {
            userId: `${clubId}-user`,
            email: memberEmail,
            firstName: null,
            lastName: null,
            role: 'MEMBER',
            joinedAt: '2026-01-01',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      }),
    ),
    // MembersPage's "add member" picker fetches the full player list in the
    // background regardless of which tab is active — stub it to keep the
    // suite quiet, mirroring MembersPage.test.tsx's own setup.
    http.get(`/api/clubs/${clubId}/players`, () =>
      HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
    ),
  );
}

// jsdom's default innerWidth (1024) already lands above the desktop
// breakpoint, so most tests exercise the inline-nav path for free; only the
// narrow-screen tests below need to override it. AppHeader only reads
// innerWidth at mount (its resize listener isn't under test here), so
// setting the property is enough — no need to dispatch a resize event.
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

describe('AppHeader', () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it('is not shown on public pages', () => {
    renderWithProviders(<App />, { route: '/' });
    expect(screen.queryByRole('link', { name: /aller au contenu/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mon compte/i })).not.toBeInTheDocument();
  });

  it('shows navigation links inline on a desktop-width screen, and Mes équipes navigates there', async () => {
    mockSession();
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('link', { name: 'Mes équipes' }));
    expect(await screen.findByRole('heading', { name: /mes équipes/i })).toBeInTheDocument();
  });

  it('no longer carries Créer un club in the primary nav — it lives in the account menu', async () => {
    mockSession();
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('link', { name: /créer un club/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /mon compte/i }));
    await user.click(await screen.findByRole('menuitem', { name: /créer un club/i }));
    expect(await screen.findByRole('heading', { name: /créer un club/i })).toBeInTheDocument();
  });

  it('shows the switcher chip for an admin, opens the panel on click, and closes it on a second click without navigating', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([{ id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' }]),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument(),
    );

    const chip = await screen.findByRole('button', { name: /coc basket/i });
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();

    await user.click(chip);
    expect(await screen.findByText('Vos clubs (admin)')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /coc basket/i })).toBeInTheDocument();

    // Radix's DropdownMenuTrigger toggles on `pointerdown`, not `click` —
    // and while the panel is open, Radix sets `pointer-events: none` on the
    // rest of the page (the same mechanism a real browser uses to route a
    // second click at the trigger's screen position through as dismissal),
    // which @testing-library/user-event's realistic-interaction guard
    // correctly refuses to click through. `fireEvent.pointerDown` bypasses
    // that guard to dispatch the same event Radix's own toggle listens for.
    fireEvent.pointerDown(chip, { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument());

    // Still on the dashboard — the chip never navigates.
    expect(screen.queryByRole('heading', { name: /^effectif/i })).not.toBeInTheDocument();
  });

  it('closes the switcher panel on Escape without navigating', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([{ id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' }]),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument(),
    );
    await user.click(await screen.findByRole('button', { name: /coc basket/i }));
    expect(await screen.findByRole('menuitem', { name: /coc basket/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /^effectif/i })).not.toBeInTheDocument();
  });

  it('lists each admin club in the switcher panel with a checkmark on the active one, and clicking a row only switches the active club (no navigation, panel closes)', async () => {
    mockSession([
      { clubId: 'club-1', role: 'ADMIN' },
      { clubId: 'club-2', role: 'ADMIN' },
    ]);
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([
          { id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' },
          { id: 'club-2', name: 'ES Nantes', createdAt: '2026-01-01' },
        ]),
      ),
    );
    mockMembersEndpoint('club-1', 'member-club1@x.com');
    mockMembersEndpoint('club-2', 'member-club2@x.com');

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument(),
    );

    // Defaults to the first admin club.
    const chip = await screen.findByRole('button', { name: /coc basket/i });
    await user.click(chip);

    const activeItem = screen.getByRole('menuitem', { name: /coc basket/i });
    const otherItem = screen.getByRole('menuitem', { name: /es nantes/i });
    expect(activeItem.textContent).toContain('✓');
    expect(otherItem.textContent).not.toContain('✓');

    await user.click(otherItem);

    // Panel closes and doesn't navigate — still on the dashboard.
    await waitFor(() => expect(screen.queryByRole('menuitem')).not.toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /^effectif/i })).not.toBeInTheDocument();

    // Checkmark moved: the chip now shows the newly active club.
    expect(await screen.findByRole('button', { name: /es nantes/i })).toBeInTheDocument();
  });

  it('routes the persistent Effectif nav item to the currently active club', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([{ id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' }]),
      ),
    );
    mockMembersEndpoint('club-1', 'member-club1@x.com');

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument(),
    );
    // The link's target club comes from the resolved active club (GET
    // /clubs, gated on the session), so wait for it rather than the account
    // button alone before clicking.
    await user.click(await screen.findByRole('link', { name: /^effectif$/i }));

    expect(await screen.findByRole('heading', { name: /^effectif/i })).toBeInTheDocument();
    expect(await screen.findByText('member-club1@x.com')).toBeInTheDocument();
  });

  it('a multi-admin-club user switching the active club, then clicking Effectif, lands on the newly-selected club (not the original default)', async () => {
    mockSession([
      { clubId: 'club-1', role: 'ADMIN' },
      { clubId: 'club-2', role: 'ADMIN' },
    ]);
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([
          { id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' },
          { id: 'club-2', name: 'ES Nantes', createdAt: '2026-01-01' },
        ]),
      ),
    );
    mockMembersEndpoint('club-1', 'member-club1@x.com');
    mockMembersEndpoint('club-2', 'member-club2@x.com');

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument(),
    );

    await user.click(await screen.findByRole('button', { name: /coc basket/i }));
    await user.click(screen.getByRole('menuitem', { name: /es nantes/i }));

    await user.click(await screen.findByRole('link', { name: /^effectif$/i }));

    expect(await screen.findByRole('heading', { name: /^effectif/i })).toBeInTheDocument();
    expect(await screen.findByText('member-club2@x.com')).toBeInTheDocument();
    expect(screen.queryByText('member-club1@x.com')).not.toBeInTheDocument();
  });

  it('does not list a club, or show the switcher or Effectif, when the user is only a MEMBER there', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([{ id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' }]),
      ),
    );

    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument(),
    );
    expect(screen.queryByText('COC Basket')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /effectif/i })).not.toBeInTheDocument();
  });

  it('shows a Mes équipes link to a plain MEMBER (who has no Effectif entry) and it navigates to their teams', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/me/teams', () =>
        HttpResponse.json([
          {
            teamId: 'team-1',
            teamName: 'U15',
            category: 'U15',
            gender: 'MEN',
            clubId: 'club-1',
            clubName: 'COC Basket',
            isTeamAdmin: true,
            rosterRole: null,
          },
        ]),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('link', { name: /mes équipes/i }));

    expect(await screen.findByRole('heading', { name: /mes équipes/i })).toBeInTheDocument();
    expect(await screen.findByText('U15')).toBeInTheDocument();
  });

  it('renders a single Effectif nav item regardless of how many clubs the user administers (header stays one control, not one block per club)', async () => {
    mockSession([
      { clubId: 'club-1', role: 'ADMIN' },
      { clubId: 'club-2', role: 'ADMIN' },
      { clubId: 'club-3', role: 'ADMIN' },
    ]);
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([
          { id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' },
          { id: 'club-2', name: 'ES Nantes', createdAt: '2026-01-01' },
          { id: 'club-3', name: 'AS Rezé', createdAt: '2026-01-01' },
        ]),
      ),
    );

    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon compte/i })).toBeInTheDocument(),
    );
    await screen.findByRole('button', { name: /coc basket/i });

    expect(screen.getAllByRole('link', { name: /^effectif$/i })).toHaveLength(1);
  });

  it('renders nothing on a narrow screen — AppBottomNav is the only navigation there', async () => {
    setViewportWidth(375);
    mockSession();
    renderWithProviders(<App />, { route: '/dashboard' });

    expect(
      await screen.findByRole('navigation', { name: 'Navigation principale' }),
    ).toBeInTheDocument();
    // No header at all: no account menu trigger, no brand link, no skip
    // link — the club switcher, "Créer un club" and logout all moved to
    // /account, reachable from the bottom bar's Profil tab.
    expect(screen.queryByRole('button', { name: /mon compte/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tableau de bord' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /aller au contenu/i })).not.toBeInTheDocument();
  });

  it('renders navigation as links, not buttons', () => {
    renderWithProviders(<AppHeader />);
    expect(screen.getByRole('link', { name: 'Tableau de bord' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('marks the current page for assistive tech', () => {
    renderWithProviders(<AppHeader />, { route: '/my-teams' });
    expect(screen.getByRole('link', { name: 'Mes équipes' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('offers logout from any page via the account menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppHeader />, { route: '/account' });
    await user.click(screen.getByRole('button', { name: /Mon compte/ }));
    expect(await screen.findByRole('menuitem', { name: 'Se déconnecter' })).toBeInTheDocument();
  });
});
