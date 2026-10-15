import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { PageContainer } from '@basketeasy/ui/page-container';
import { server } from '../mocks/server';
import { AccountProvider } from './AccountContext';
import { ProtectedRoute } from './ProtectedRoute';

// Its own file: the restore's in-flight refresh is shared module state, so a
// sibling test that unmounts mid-restore would otherwise leak into this one.
describe('ProtectedRoute when the session cannot be restored', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a retry screen, not the login page, when the session could not be restored', async () => {
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number,
      ...args: unknown[]
    ) =>
      realSetTimeout(
        fn,
        ms !== undefined && [500, 1500, 3000, 6000].includes(ms) ? 0 : ms,
        ...args,
      )) as never);
    let failing = true;
    server.use(
      http.post('/api/auth/refresh', () =>
        failing
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ accessToken: 'restored-token' }),
      ),
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'user-1', email: 'a@b.com', emailVerified: true, memberships: [] }),
      ),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AccountProvider>
          <MemoryRouter initialEntries={['/dashboard']}>
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

    expect(
      await screen.findByText('Connexion impossible', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Page de connexion')).not.toBeInTheDocument();

    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(screen.getByText('Contenu protégé')).toBeInTheDocument());
  });
});
