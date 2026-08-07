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
          info: { database: { status: 'up' } },
          details: { database: { status: 'up' } },
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
    await waitFor(() => expect(screen.getByText(/database: up/)).toBeInTheDocument());
  });
});
