import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';

function mockSession() {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships: [] }),
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

  it('lists each of the user’s clubs with a link to its roster page on a desktop-width screen', async () => {
    mockSession();
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([{ id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' }]),
      ),
      http.get('/api/clubs/club-1/members', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    expect(await screen.findByText('COC Basket')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /effectif/i }));

    expect(await screen.findByRole('heading', { name: /effectif du club/i })).toBeInTheDocument();
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
});
