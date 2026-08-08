import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { AccountProvider } from './AccountContext';
import { ProtectedRoute } from './ProtectedRoute';

function renderProtectedAt(initialPath: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<div>Page de connexion</div>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<div>Contenu protégé</div>} />
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
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships: [] }),
      ),
    );

    renderProtectedAt('/dashboard');

    await waitFor(() => expect(screen.getByText('Contenu protégé')).toBeInTheDocument());
  });
});
