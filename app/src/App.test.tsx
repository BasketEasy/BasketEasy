import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { server } from './mocks/server';
import { renderWithProviders } from './testUtils';
import App from './App';

describe('App routing', () => {
  it('renders the landing page at /', () => {
    renderWithProviders(<App />, { route: '/' });
    expect(
      screen.getByRole('heading', { name: 'Moins de tableurs, plus de terrain.' }),
    ).toBeInTheDocument();
  });

  it('redirects /dashboard to /login when logged out', async () => {
    renderWithProviders(<App />, { route: '/dashboard' });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument(),
    );
  });

  it('redirects /login to /dashboard when already logged in', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships: [] }),
      ),
    );

    renderWithProviders(<App />, { route: '/login' });

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
  });

  it('unknown routes redirect back to the landing page', () => {
    renderWithProviders(<App />, { route: '/nope' });
    expect(
      screen.getByRole('heading', { name: 'Moins de tableurs, plus de terrain.' }),
    ).toBeInTheDocument();
  });

  it('logging in from /login lands on the dashboard, and logging out returns to /login', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'a@b.com', memberships: [] },
        }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<App />, { route: '/login' });

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'a@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /tableau de bord/i })).toBeInTheDocument(),
    );
    expect(screen.getByText('a@b.com')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /se déconnecter/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument(),
    );
  });
});
