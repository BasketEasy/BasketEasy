import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[] = []) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships }),
    ),
  );
}

// jsdom's default innerWidth (1024) already lands above the desktop
// breakpoint, so most tests exercise the inline-nav path for free; only the
// burger-menu test below needs to override it. AppHeader only reads
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
    expect(screen.queryByLabelText(/menu/i)).not.toBeInTheDocument();
  });

  it('shows navigation links inline on a desktop-width screen, and Tableau de bord navigates there', async () => {
    mockSession();
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());

    expect(screen.queryByLabelText(/menu/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /créer un club/i }));
    expect(await screen.findByRole('heading', { name: /créer un club/i })).toBeInTheDocument();
  });

  it('lists each of the user’s clubs with a link to its members page on a desktop-width screen', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([{ id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' }]),
      ),
      http.get('/api/clubs/club-1/members', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
      ),
      http.get('/api/clubs/club-1/players', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    expect(await screen.findByText('COC Basket')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /effectif/i }));

    expect(await screen.findByRole('heading', { name: /effectif du club/i })).toBeInTheDocument();
  });

  it('does not list a club, or its Effectif entry, when the user is only a MEMBER there', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([{ id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' }]),
      ),
    );

    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    expect(screen.queryByText('COC Basket')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /effectif/i })).not.toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /mes équipes/i }));

    expect(await screen.findByRole('heading', { name: /mes équipes/i })).toBeInTheDocument();
    expect(await screen.findByText('U15')).toBeInTheDocument();
  });

  it('falls back to a burger menu on a narrow (mobile-width) screen', async () => {
    setViewportWidth(375);
    mockSession();
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /créer un club/i })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/menu/i));

    await user.click(screen.getByRole('button', { name: /créer un club/i }));
    expect(await screen.findByRole('heading', { name: /créer un club/i })).toBeInTheDocument();
  });

  it('closes the mobile menu when the backdrop behind it is clicked', async () => {
    setViewportWidth(375);
    mockSession();
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());

    await user.click(screen.getByLabelText(/menu/i));
    expect(screen.getByRole('button', { name: /créer un club/i })).toBeInTheDocument();

    await user.click(screen.getByTestId('mobile-menu-backdrop'));

    expect(screen.queryByRole('button', { name: /créer un club/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-menu-backdrop')).not.toBeInTheDocument();
  });

  it('closes the mobile menu when Escape is pressed', async () => {
    setViewportWidth(375);
    mockSession();
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());

    await user.click(screen.getByLabelText(/menu/i));
    expect(screen.getByRole('button', { name: /créer un club/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('button', { name: /créer un club/i })).not.toBeInTheDocument();
  });
});
