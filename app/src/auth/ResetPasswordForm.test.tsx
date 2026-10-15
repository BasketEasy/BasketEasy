import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { ResetPasswordForm } from './ResetPasswordForm';

describe('ResetPasswordForm', () => {
  it('sends the token with the new password and reports every session signed out', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post('/api/auth/password-reset/confirm', async ({ request }) => {
        bodies.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<ResetPasswordForm token="tok-1" />);
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'nouveau-mot-de-passe');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'nouveau-mot-de-passe');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(bodies).toEqual([{ token: 'tok-1', password: 'nouveau-mot-de-passe' }]),
    );

    // Saying so is the point: a reset revokes every RefreshToken, and someone
    // recovering a compromised account came for that reassurance.
    expect(await screen.findByText(/sessions ouvertes ont été déconnectées/)).toBeInTheDocument();
  });

  it('binds a mismatch to the confirmation field, not the form root', async () => {
    const user = userEvent.setup();

    renderWithProviders(<ResetPasswordForm token="tok-1" />);
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'nouveau-mot-de-passe');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'autre-chose-encore');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText('Les deux mots de passe ne correspondent pas'),
    ).toBeInTheDocument();
  });

  it('surfaces a spent link as a link problem, not a field problem', async () => {
    server.use(
      http.post('/api/auth/password-reset/confirm', () =>
        HttpResponse.json({ message: 'expired' }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(<ResetPasswordForm token="tok-1" />);
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'nouveau-mot-de-passe');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'nouveau-mot-de-passe');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/lien est invalide ou a expiré/);
  });
});
