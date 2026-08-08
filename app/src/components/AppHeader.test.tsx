import { describe, expect, it } from 'vitest';
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

describe('AppHeader', () => {
  it('is not shown on public pages', () => {
    renderWithProviders(<App />, { route: '/' });
    expect(screen.queryByLabelText(/menu/i)).not.toBeInTheDocument();
  });

  it('opens to reveal navigation links, and Tableau de bord navigates there', async () => {
    mockSession();
    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /créer un club/i })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText(/menu/i));

    await user.click(screen.getByRole('button', { name: /créer un club/i }));
    expect(await screen.findByRole('heading', { name: /créer un club/i })).toBeInTheDocument();
  });

  it('lists each of the user’s clubs with links to their members and players pages', async () => {
    mockSession();
    server.use(
      http.get('/api/clubs', () =>
        HttpResponse.json([{ id: 'club-1', name: 'COC Basket', createdAt: '2026-01-01' }]),
      ),
      http.get('/api/clubs/club-1/players', () => HttpResponse.json([])),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    await user.click(screen.getByLabelText(/menu/i));

    expect(await screen.findByText('COC Basket')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /joueurs/i }));

    expect(await screen.findByRole('heading', { name: /joueurs/i })).toBeInTheDocument();
  });
});
