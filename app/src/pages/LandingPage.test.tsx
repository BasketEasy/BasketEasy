import { describe, expect, it, vi } from 'vitest';
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
            <Route path="/account" element={<div>Mon compte</div>} />
          </Routes>
        </MemoryRouter>
      </AccountProvider>
    </QueryClientProvider>,
  );
}

const REGISTER = /créer mon équipe gratuitement/i;

describe('LandingPage', () => {
  it('opens on the brand headline as the only h1', () => {
    renderLandingPage();

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Moins de tableurs, plus de terrain.');
    expect(
      screen.getByText(/toute la semaine de votre équipe dans une seule app/),
    ).toBeInTheDocument();
  });

  it('points every « Créer mon équipe » call to action at /register', async () => {
    renderLandingPage();

    const ctas = await screen.findAllByRole('link', { name: REGISTER });
    // Hero, after the week, after the steps, the final band, the phone bar.
    expect(ctas).toHaveLength(5);
    for (const cta of ctas) expect(cta).toHaveAttribute('href', '/register');
    expect(await screen.findByRole('link', { name: 'Créer mon équipe' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('navigates to /register from the hero call to action', async () => {
    const user = userEvent.setup();
    renderLandingPage();

    await user.click((await screen.findAllByRole('link', { name: REGISTER }))[0]);
    expect(screen.getByText('Page de création de compte')).toBeInTheDocument();
  });

  it('navigates to /login from « Se connecter »', async () => {
    const user = userEvent.setup();
    renderLandingPage();

    await user.click(await screen.findByRole('link', { name: 'Se connecter' }));
    expect(screen.getByText('Page de connexion')).toBeInTheDocument();
  });

  it('links the header to the sections it names', () => {
    renderLandingPage();

    const nav = screen.getByRole('navigation', { name: 'Sur cette page' });
    expect(within(nav).getByRole('link', { name: 'Fonctionnalités' })).toHaveAttribute(
      'href',
      '#semaine',
    );
    expect(within(nav).getByRole('link', { name: 'Comment ça marche' })).toHaveAttribute(
      'href',
      '#etapes',
    );
    expect(within(nav).getByRole('link', { name: 'Questions' })).toHaveAttribute('href', '#faq');
    for (const id of ['semaine', 'etapes', 'faq']) {
      expect(document.getElementById(id)).toBeInTheDocument();
    }
  });

  it('tells the week day by day, each day proven by a real screenshot', () => {
    renderLandingPage();

    for (const title of [
      'Le groupe du samedi, fait en deux clics.',
      'Vos joueurs répondent sans créer de compte.',
      'RDV, trajet et maillots : réglés avant de partir.',
      'Une photo de la feuille de marque, les stats de la saison.',
    ]) {
      const day = screen.getByRole('heading', { level: 3, name: title }).closest('article')!;
      expect(within(day).getAllByRole('img').length).toBeGreaterThan(0);
    }
  });

  it('loads the hero screenshots eagerly and every other one lazily, all with alt text and size', () => {
    renderLandingPage();

    const images = screen.getAllByRole('img').filter((img) => img.getAttribute('alt'));
    const eager = images.filter((img) => img.getAttribute('loading') === 'eager');
    expect(eager).toHaveLength(2);
    for (const img of eager) expect(img).toHaveAttribute('fetchpriority', 'high');
    for (const img of images) {
      expect(img).toHaveAttribute('width');
      expect(img).toHaveAttribute('height');
    }
    expect(images.filter((img) => img.getAttribute('loading') === 'lazy').length).toBeGreaterThan(
      0,
    );
  });

  it('answers the objections in the FAQ, the first one open', () => {
    renderLandingPage();

    const first = screen.getByText('C’est vraiment gratuit ?').closest('details')!;
    expect(first).toHaveAttribute('open');
    expect(within(first).getByText(/sans carte bancaire\.$/)).toBeInTheDocument();
    expect(screen.queryByText(/À CONFIRMER/)).not.toBeInTheDocument();
    expect(screen.getByText('Mes joueurs doivent-ils tous créer un compte ?')).toBeInTheDocument();
  });

  it('no longer pitches the market or unbuilt features', () => {
    renderLandingPage();

    expect(screen.queryByText('Le marché visé')).not.toBeInTheDocument();
    expect(screen.queryByText('La suite')).not.toBeInTheDocument();
    expect(screen.queryByText('Bientôt')).not.toBeInTheDocument();
  });

  it('keeps the legal links in the footer', () => {
    renderLandingPage();

    const legal = screen.getByRole('navigation', { name: 'Documents légaux' });
    expect(within(legal).getAllByRole('link')).toHaveLength(4);
    expect(screen.getByText('© Kluvo · Données hébergées en France · RGPD')).toBeInTheDocument();
  });

  it('shows the pitch to a signed-in visitor, its calls to action leading back into the app', async () => {
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

    expect(await screen.findAllByRole('link', { name: 'Aller à mon espace' })).not.toHaveLength(0);
    for (const link of screen.getAllByRole('link', { name: 'Aller à mon espace' })) {
      expect(link).toHaveAttribute('href', '/dashboard');
    }
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Créer mon équipe gratuitement' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Tableau de bord')).not.toBeInTheDocument();
  });

  it('sends an installed app opened without a session to the sign-in form', async () => {
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation(
        (query: string) =>
          ({ matches: query === '(display-mode: standalone)', media: query }) as MediaQueryList,
      );

    renderLandingPage();

    expect(await screen.findByText('Page de connexion')).toBeInTheDocument();
    matchMedia.mockRestore();
  });

  it('shows « Se connecter » once the session is known', async () => {
    renderLandingPage();

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/login'),
    );
  });
});
