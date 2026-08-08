import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { server } from './mocks/server';
import { renderWithProviders } from './testUtils';
import App from './App';

function renderApp() {
  return renderWithProviders(<App />);
}

describe('App', () => {
  it('renders the brand tagline', () => {
    renderApp();
    expect(screen.getByText("La gestion d'équipe, simplifiée.")).toBeInTheDocument();
  });

  it('renders the API health status once the fetch resolves', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText(/database: up/)).toBeInTheDocument());
  });

  it('renders an error state when the health check fails', async () => {
    server.use(http.get('/api/health', () => HttpResponse.json(null, { status: 500 })));

    renderApp();
    await waitFor(() => expect(screen.getByText(/unreachable/)).toBeInTheDocument());
  });

  it('shows the login form when logged out, and can switch to the register form and back', async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: /créer un compte/i }));
    expect(screen.getByRole('heading', { name: /créer un compte/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /j'ai déjà un compte/i }));
    expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument();
  });

  it('shows the logged-in view after a successful login, and can log out back to the login form', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'a@b.com', memberships: [] },
        }),
      ),
    );

    const user = userEvent.setup();
    renderApp();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'a@b.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /se connecter/i }));

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /se déconnecter/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /se déconnecter/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /se connecter/i })).toBeInTheDocument(),
    );
  });
});
