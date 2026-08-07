import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          info: { database: { status: 'up' } },
          details: { database: { status: 'up' } },
        }),
      }),
    );
  });

  it('renders the brand tagline', () => {
    renderApp();
    expect(screen.getByText("La gestion d'équipe, simplifiée.")).toBeInTheDocument();
  });

  it('renders the API health status once the fetch resolves', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText(/database: up/)).toBeInTheDocument());
  });
});
