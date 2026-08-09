import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { AccountProvider } from './AccountContext';
import { PublicOnlyRoute } from './PublicOnlyRoute';

function renderPublicOnlyAt(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/dashboard" element={<div>Tableau de bord</div>} />
            <Route path="/account" element={<div>Mon compte</div>} />
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<div>Page de connexion</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AccountProvider>
    </QueryClientProvider>,
  );
}

describe('PublicOnlyRoute', () => {
  it('renders the route when there is no session', async () => {
    renderPublicOnlyAt('/login');

    await waitFor(() => expect(screen.getByText('Page de connexion')).toBeInTheDocument());
  });

  it('redirects to /account when a session is restored but profile is incomplete', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          id: 'user-1',
          email: 'a@b.com',
          firstName: null,
          lastName: null,
          avatarUrl: null,
          memberships: [],
        }),
      ),
    );

    renderPublicOnlyAt('/login');

    await waitFor(() => expect(screen.getByText('Mon compte')).toBeInTheDocument());
    expect(screen.queryByText('Page de connexion')).not.toBeInTheDocument();
  });

  it('redirects to /dashboard when a session is restored with complete profile', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          id: 'user-1',
          email: 'a@b.com',
          firstName: 'Jean',
          lastName: 'Dupont',
          avatarUrl: null,
          memberships: [],
        }),
      ),
    );

    renderPublicOnlyAt('/login');

    await waitFor(() => expect(screen.getByText('Tableau de bord')).toBeInTheDocument());
    expect(screen.queryByText('Page de connexion')).not.toBeInTheDocument();
  });
});
