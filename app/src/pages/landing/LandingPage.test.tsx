import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { server } from '../../mocks/server';
import { AccountProvider } from '../../auth/AccountContext';
import { LandingPage } from './LandingPage';

vi.mock('./HeroCanvas', () => ({
  HeroCanvas: () => <div data-testid="hero-canvas-stub" />,
}));

function renderLandingPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<div>Page de connexion</div>} />
            <Route path="/register" element={<div>Page de création de compte</div>} />
            <Route path="/dashboard" element={<div>Tableau de bord</div>} />
          </Routes>
        </MemoryRouter>
      </AccountProvider>
    </QueryClientProvider>,
  );
}

describe('LandingPage', () => {
  it('renders the brand headline and subhead', () => {
    renderLandingPage();
    expect(
      screen.getByRole('heading', { name: 'Moins de tableurs, plus de terrain.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/BasketEasy centralise calendriers/)).toBeInTheDocument();
  });

  it('renders every section: comparison, bento grid, sandbox, footer', () => {
    renderLandingPage();
    expect(
      screen.getByRole('heading', { name: 'Une équipe, plusieurs clubs ? Enfin un seul outil.' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Pensé pour les bénévoles')).toBeInTheDocument();
    expect(screen.getByText('Feuille de match')).toBeInTheDocument();
    expect(screen.getByText('Données hébergées en France · RGPD')).toBeInTheDocument();
  });

  it('shows login/register CTAs when logged out, and navigates to /register on click', async () => {
    const user = userEvent.setup();
    renderLandingPage();

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

    renderLandingPage();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /mon espace/i })).toBeInTheDocument(),
    );
  });
});
