import { describe, expect, it } from 'vitest';
import { StrictMode } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { VerifyEmailCard } from './VerifyEmailCard';

describe('VerifyEmailCard', () => {
  it('confirms the address and reports success', async () => {
    renderWithProviders(<VerifyEmailCard token="tok-1" />);

    expect(await screen.findByText('Adresse confirmée')).toBeInTheDocument();
  });

  it('sends the token from the URL', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post('/api/auth/verify-email/confirm', async ({ request }) => {
        bodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<VerifyEmailCard token="tok-1" />);

    await waitFor(() => expect(bodies).toEqual([{ token: 'tok-1' }]));
  });

  it('reports a spent or expired link rather than a field-level error', async () => {
    server.use(
      http.post('/api/auth/verify-email/confirm', () =>
        HttpResponse.json({ message: 'expired' }, { status: 400 }),
      ),
    );

    renderWithProviders(<VerifyEmailCard token="tok-1" />);

    expect(await screen.findByText('Lien invalide')).toBeInTheDocument();
    // A 400 here means the *link* is spent, not that a field was mistyped —
    // see getAccountSecurityErrorMessage.
    expect(await screen.findByRole('alert')).toHaveTextContent(/lien est invalide ou a expiré/);
  });

  it('consumes the token exactly once, and still resolves, under StrictMode', async () => {
    // Two regressions in one test. The ref guard stops StrictMode's
    // double-invoked mount effect burning the token on the first call and
    // showing the second call's "already used" error. And the card reads its
    // outcome from `mutateAsync`'s promise rather than the mutation
    // observer's flags or per-call callbacks — StrictMode's simulated unmount
    // tears that observer down mid-flight, and the card sat on
    // "Confirmation…" forever when it depended on them.
    let calls = 0;
    server.use(
      http.post('/api/auth/verify-email/confirm', () => {
        calls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(
      <StrictMode>
        <VerifyEmailCard token="tok-1" />
      </StrictMode>,
    );

    expect(await screen.findByText('Adresse confirmée')).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('has one h1 and a plain wordmark', async () => {
    renderWithProviders(<VerifyEmailCard token="tok-1" />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Kluvo')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Kluvo' })).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Adresse confirmée' }),
    ).toBeInTheDocument();
  });
});
