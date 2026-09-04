import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import App from '../App';
import { renderWithProviders } from '../testUtils';

describe('unknown routes', () => {
  it('renders a 404 in place, keeping the app header, for an authenticated user on an unknown /clubs/* URL', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          id: 'user-1',
          email: 'a@b.com',
          emailVerified: true,
          firstName: 'Alex',
          lastName: 'Dupont',
          avatarUrl: null,
          memberships: [],
        }),
      ),
    );

    renderWithProviders(<App />, { route: '/clubs/does-not-exist/nope' });

    expect(await screen.findByRole('heading', { name: /Page introuvable/ })).toBeInTheDocument();
    expect(screen.getByText('Kluvo')).toBeInTheDocument();
  });

  it('renders a 404 in place rather than redirecting to the landing page for an unauthenticated user on a non-/clubs URL', async () => {
    renderWithProviders(<App />, { route: '/pas-une-page' });

    expect(await screen.findByRole('heading', { name: /Page introuvable/ })).toBeInTheDocument();
    expect(screen.queryByText('Moins de tableurs, plus de terrain.')).not.toBeInTheDocument();
  });
});
