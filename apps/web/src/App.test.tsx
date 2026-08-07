import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          service: 'basketeasy-api',
          timestamp: '2026-01-01T00:00:00.000Z',
        }),
      }),
    );
  });

  it('renders the brand tagline', () => {
    render(<App />);
    expect(screen.getByText("La gestion d'équipe, simplifiée.")).toBeInTheDocument();
  });

  it('renders the API health status once the fetch resolves', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/basketeasy-api/)).toBeInTheDocument());
  });
});
