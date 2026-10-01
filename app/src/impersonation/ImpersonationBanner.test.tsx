import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import { server } from '../mocks/server';
import { ImpersonationBanner } from './ImpersonationBanner';
import { beginImpersonation, dropImpersonation, isImpersonating } from './impersonationSession';

function start(minutes = 12) {
  beginImpersonation({
    sessionId: 's-1',
    token: 'impersonation-token',
    expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    subject: { id: 'user-9', displayName: 'Jean Dupont' },
  });
}

function renderBanner() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['anything'], 'admin data');
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<ImpersonationBanner />} />
          <Route path="/admin/users/:userId" element={<p>Fiche admin</p>} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('ImpersonationBanner', () => {
  afterEach(() => {
    dropImpersonation();
    vi.useRealTimers();
  });

  it('renders nothing outside an impersonation', () => {
    renderBanner();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('names the subject, says read-only and counts down', () => {
    start(12);
    renderBanner();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Vue en tant que Jean Dupont · lecture seule · 12 min',
    );
  });

  it('« Quitter » ends it on the server, clears the cache and returns to the record', async () => {
    let ended = false;
    server.use(
      http.post('/api/admin/impersonations/s-1/end', () => {
        ended = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    start();
    const queryClient = renderBanner();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Quitter' }));

    expect(await screen.findByText('Fiche admin')).toBeInTheDocument();
    expect(isImpersonating()).toBe(false);
    expect(queryClient.getQueryData(['anything'])).toBeUndefined();
    expect(await screen.findByText('Consultation terminée')).toBeInTheDocument();
    await waitFor(() => expect(ended).toBe(true));
  });

  it('leaves by itself when the session expires', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    start(1);
    renderBanner();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });

    expect(screen.getByText('Fiche admin')).toBeInTheDocument();
    expect(isImpersonating()).toBe(false);
  });
});
