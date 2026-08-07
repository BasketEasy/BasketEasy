import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from './mocks/server';
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
  it('renders the brand tagline', () => {
    renderApp();
    expect(screen.getByText("La gestion d'équipe, simplifiée.")).toBeInTheDocument();
  });

  it('renders the API health status once the fetch resolves', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText(/database: up/)).toBeInTheDocument());
  });

  it('renders an error state when the health check fails', async () => {
    server.use(http.get('/api/health', () => HttpResponse.json(null, { status: 500 })));

    renderApp();
    await waitFor(() => expect(screen.getByText(/unreachable/)).toBeInTheDocument());
  });
});
