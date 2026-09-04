import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EmailVerificationBanner } from './EmailVerificationBanner';

function mockSession(emailVerified: boolean) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'theo.dupont@example.fr',
        emailVerified,
        memberships: [],
      }),
    ),
  );
}

describe('EmailVerificationBanner', () => {
  it('prompts an unverified account, naming the address the link went to', async () => {
    mockSession(false);

    renderWithProviders(<EmailVerificationBanner />);

    expect(await screen.findByText('Confirmez votre adresse e-mail')).toBeInTheDocument();
    expect(screen.getByText(/theo\.dupont@example\.fr/)).toBeInTheDocument();
  });

  it('renders nothing once the address is confirmed', async () => {
    mockSession(true);

    const { container } = renderWithProviders(<EmailVerificationBanner />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('renders nothing with no session at all', async () => {
    const { container } = renderWithProviders(<EmailVerificationBanner />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('asks for a fresh link and confirms with a toast', async () => {
    mockSession(false);
    let requested = false;
    server.use(
      http.post('/api/auth/verify-email/request', () => {
        requested = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<EmailVerificationBanner />);
    await user.click(await screen.findByRole('button', { name: 'Renvoyer l’e-mail' }));

    await waitFor(() => expect(requested).toBe(true));
  });

  it('can be dismissed for the rest of the page load', async () => {
    mockSession(false);
    const user = userEvent.setup();

    renderWithProviders(<EmailVerificationBanner />);
    await user.click(await screen.findByRole('button', { name: 'Plus tard' }));

    expect(screen.queryByText('Confirmez votre adresse e-mail')).not.toBeInTheDocument();
  });
});
