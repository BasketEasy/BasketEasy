import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { useAccount } from '../auth/useAccount';
import { beginImpersonation, dropImpersonation } from './impersonationSession';

function WhoAmI() {
  const { user, isLoading } = useAccount();
  if (isLoading) return null;
  return <p>{user ? user.email : 'déconnecté'}</p>;
}

describe('impersonation and the session', () => {
  afterEach(() => {
    dropImpersonation();
  });

  it('reads « me » directly as the subject, never through a refresh', async () => {
    let refreshed = false;
    let authorization: string | null = null;
    server.use(
      http.post('/api/auth/refresh', () => {
        refreshed = true;
        return HttpResponse.json({ accessToken: 'admin-access' });
      }),
      http.get('/api/auth/me', ({ request }) => {
        authorization = request.headers.get('Authorization');
        return HttpResponse.json({ id: 'user-9', email: 'jean@example.org' });
      }),
    );
    beginImpersonation({
      sessionId: 's-1',
      token: 'impersonation-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      subject: { id: 'user-9', displayName: 'Jean Dupont' },
    });

    renderWithProviders(<WhoAmI />);

    expect(await screen.findByText('jean@example.org')).toBeInTheDocument();
    expect(refreshed).toBe(false);
    expect(authorization).toBe('Bearer impersonation-token');
  });
});
