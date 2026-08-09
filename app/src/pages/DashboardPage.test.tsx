import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { DashboardPage } from './DashboardPage';

function renderLoggedIn() {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', memberships: [] }),
    ),
  );
  return renderWithProviders(<DashboardPage />);
}

describe('DashboardPage', () => {
  it("renders the logged-in user's email and the API health status", async () => {
    renderLoggedIn();

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/database: up/)).toBeInTheDocument());
  });

  it('renders an error state when the health check fails', async () => {
    server.use(http.get('/api/health', () => HttpResponse.json(null, { status: 500 })));

    renderLoggedIn();

    await waitFor(() => expect(screen.getByText(/injoignable/)).toBeInTheDocument());
  });

  it('logs out when "Se déconnecter" is clicked', async () => {
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 200 })));
    const user = userEvent.setup();
    renderLoggedIn();

    await waitFor(() => expect(screen.getByText('a@b.com')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /se déconnecter/i }));

    await waitFor(() => expect(screen.queryByText('a@b.com')).not.toBeInTheDocument());
  });
});
