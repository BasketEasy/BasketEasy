import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { server } from '../mocks/server';
import { AccountProvider } from '../auth/AccountContext';
import { LandingPage } from './LandingPage';

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
    expect(screen.getByText(/Kluvo centralise calendriers/)).toBeInTheDocument();
  });

  it('presents shipped features without a "Bientôt" badge', () => {
    renderLandingPage();
    const shipped = screen.getByRole('heading', { name: 'Calendrier & convocations' });
    expect(within(shipped.closest('article')!).queryByText('Bientôt')).not.toBeInTheDocument();
  });

  it('still marks unbuilt features as upcoming', () => {
    renderLandingPage();
    const upcoming = screen.getByRole('heading', { name: 'Cotisations en ligne' });
    expect(within(upcoming.closest('article')!).getByText('Bientôt')).toBeInTheDocument();
  });

  it('renders the hero agenda mock with the real agenda cards: a training and a match', () => {
    renderLandingPage();
    expect(screen.getByText('19:00')).toBeInTheDocument();
    expect(screen.getByText('15:00')).toBeInTheDocument();
    expect(screen.getByText('Entraîn.')).toBeInTheDocument();
    expect(screen.getAllByText('Match').length).toBeGreaterThan(0);
    expect(screen.getAllByText('U15 Garçons')).toHaveLength(2);
    expect(screen.getByText(/vs ES Rezé/)).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /Présences : 9 oui/ })).toHaveLength(2);
  });

  it('renders the footer copyright line', () => {
    renderLandingPage();
    expect(screen.getByText(/© Kluvo 2025/)).toBeInTheDocument();
  });

  it('shows login/register CTAs when logged out, and navigates to /register on click', async () => {
    const user = userEvent.setup();
    renderLandingPage();

    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: /créer un compte/i }).length).toBeGreaterThan(0),
    );

    await user.click(screen.getAllByRole('link', { name: /créer un compte/i })[0]);
    expect(screen.getByText('Page de création de compte')).toBeInTheDocument();
  });

  it('navigates to /login when "Se connecter" is clicked', async () => {
    const user = userEvent.setup();
    renderLandingPage();

    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: /se connecter/i }).length).toBeGreaterThan(0),
    );

    await user.click(screen.getAllByRole('link', { name: /se connecter/i })[0]);
    expect(screen.getByText('Page de connexion')).toBeInTheDocument();
  });

  it('redirects a signed-in visitor to the dashboard', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          id: 'user-1',
          email: 'a@b.com',
          firstName: 'Ana',
          emailVerified: true,
          memberships: [],
        }),
      ),
    );

    renderLandingPage();

    expect(await screen.findByText('Tableau de bord')).toBeInTheDocument();
  });
});
