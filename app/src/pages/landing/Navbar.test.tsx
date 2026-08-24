import { describe, expect, it } from 'vitest';
import { screen, waitFor, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../mocks/server';
import { AccountProvider } from '../../auth/AccountContext';
import { Navbar } from './Navbar';

function renderNavbar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<Navbar />} />
            <Route path="/login" element={<div>Page de connexion</div>} />
            <Route path="/register" element={<div>Page de création de compte</div>} />
            <Route path="/dashboard" element={<div>Tableau de bord</div>} />
          </Routes>
        </MemoryRouter>
      </AccountProvider>
    </QueryClientProvider>,
  );
}

describe('Navbar', () => {
  it('shows the BasketEasy wordmark and CTC badge', () => {
    renderNavbar();
    expect(screen.getByText('BasketEasy')).toBeInTheDocument();
    expect(screen.getByText('Pensé pour les CTC & Ententes')).toBeInTheDocument();
  });

  it('shows login/register CTAs when logged out, and navigates to /register on click', async () => {
    const user = userEvent.setup();
    renderNavbar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /créer un compte/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /créer un compte/i }));
    expect(screen.getByText('Page de création de compte')).toBeInTheDocument();
  });

  it('shows "Mon espace" when logged in', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships: [] }),
      ),
    );

    renderNavbar();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon espace/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /se connecter/i })).not.toBeInTheDocument();
  });
});
