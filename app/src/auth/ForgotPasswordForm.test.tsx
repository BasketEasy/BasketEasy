import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { ForgotPasswordForm } from './ForgotPasswordForm';

describe('ForgotPasswordForm', () => {
  it('submits the address and confirms without revealing whether it exists', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post('/api/auth/password-reset/request', async ({ request }) => {
        bodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'theo.dupont@example.fr');
    await user.click(screen.getByRole('button', { name: 'Envoyer le lien' }));

    await waitFor(() => expect(bodies).toEqual([{ email: 'theo.dupont@example.fr' }]));

    // The endpoint answers 204 whether or not the account exists, and this
    // copy has to keep that promise — a confirmation that appeared only for
    // real addresses would be the user-enumeration oracle the API avoids.
    expect(
      await screen.findByText(/Si un compte Kluvo existe pour cette adresse/),
    ).toBeInTheDocument();
  });

  it('rejects a malformed address before calling the API', async () => {
    let called = false;
    server.use(
      http.post('/api/auth/password-reset/request', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<ForgotPasswordForm />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'pas-une-adresse');
    await user.click(screen.getByRole('button', { name: 'Envoyer le lien' }));

    expect(await screen.findByText('Adresse email invalide')).toBeInTheDocument();
    expect(called).toBe(false);
  });
});
