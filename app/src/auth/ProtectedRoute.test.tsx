import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { PageContainer } from '@basketeasy/ui/page-container';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AccountProvider } from './AccountContext';
import { ProtectedRoute } from './ProtectedRoute';

// ActiveClubProvider is mounted by ProtectedRoute itself now (not a level
// above it, the way this test used to wrap it) — see ProtectedRoute.tsx.
function renderProtectedAt(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<div>Page de connexion</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<PageContainer>Contenu protégé</PageContainer>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AccountProvider>
    </QueryClientProvider>,
  );
}

describe('ProtectedRoute', () => {
  it('redirects to /login when there is no session', async () => {
    renderProtectedAt('/dashboard');

    await waitFor(() => expect(screen.getByText('Page de connexion')).toBeInTheDocument());
    expect(screen.queryByText('Contenu protégé')).not.toBeInTheDocument();
  });

  it('renders the protected content when a session is restored', async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', emailVerified: true, memberships: [] }),
      ),
    );

    renderProtectedAt('/dashboard');

    await waitFor(() => expect(screen.getByText('Contenu protégé')).toBeInTheDocument());
  });

  it("renders the skip link's #contenu target on every protected page, so it never points at nothing", async () => {
    server.use(
      http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', emailVerified: true, memberships: [] }),
      ),
    );

    renderProtectedAt('/dashboard');

    await waitFor(() => expect(screen.getByText('Contenu protégé')).toBeInTheDocument());

    const skipLink = screen.getByRole('link', { name: /aller au contenu/i });
    expect(skipLink).toHaveAttribute('href', '#contenu');
    expect(document.querySelector('#contenu')).toBeInTheDocument();
  });

  it('keeps the app shell on screen while the session resolves', () => {
    // Hold the session request pending on purpose — the default MSW
    // handler resolves /api/auth/refresh with a 401 immediately, which
    // would settle isLoading before this assertion runs and defeat the
    // point of the test.
    server.use(http.post('/api/auth/refresh', () => new Promise(() => {})));

    renderWithProviders(<ProtectedRoute />, { route: '/dashboard' });

    expect(screen.getByText('Kluvo')).toBeInTheDocument();
  });
});
