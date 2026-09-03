import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { InviteAcceptForm } from './InviteAcceptForm';

function renderForm(token = 'abc123') {
  return renderWithProviders(<InviteAcceptForm token={token} />);
}

describe('InviteAcceptForm', () => {
  it('shows an invalid-invitation message for an expired/unknown token, without a retry button', async () => {
    server.use(
      http.get('/api/invites/abc123', () =>
        HttpResponse.json({ message: 'Invitation invalide ou expirée' }, { status: 404 }),
      ),
    );

    renderForm();

    expect(await screen.findByText(/invalide ou a expiré/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /réessayer/i })).not.toBeInTheDocument();
  });

  it('offers a retry on a transient failure (not a 404)', async () => {
    server.use(
      http.get('/api/invites/abc123', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );

    renderForm();

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });

  it('renders the player/club preview and submits to create the account', async () => {
    server.use(
      http.get('/api/invites/abc123', () =>
        HttpResponse.json({
          playerFirstName: 'Théo',
          playerLastName: 'Dupont',
          clubName: 'ASVEL',
        }),
      ),
    );

    let capturedBody: unknown;
    server.use(
      http.post('/api/invites/abc123/accept', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          accessToken: 'access-1',
          user: { id: 'user-1', email: 'theo@example.com', memberships: [] },
        });
      }),
    );

    const user = userEvent.setup();
    renderForm();

    expect(await screen.findByText(/rejoindre asvel/i)).toBeInTheDocument();
    expect(screen.getByText(/théo dupont/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/adresse e-mail/i), 'theo@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    await waitFor(() =>
      expect(capturedBody).toEqual({ email: 'theo@example.com', password: 'password123' }),
    );
  });

  it('shows a submit-level error when accepting fails', async () => {
    server.use(
      http.get('/api/invites/abc123', () =>
        HttpResponse.json({
          playerFirstName: 'Théo',
          playerLastName: 'Dupont',
          clubName: 'ASVEL',
        }),
      ),
      http.post('/api/invites/abc123/accept', () =>
        HttpResponse.json({ message: 'Email already in use' }, { status: 409 }),
      ),
    );

    const user = userEvent.setup();
    renderForm();

    await screen.findByText(/rejoindre asvel/i);
    await user.type(screen.getByLabelText(/adresse e-mail/i), 'theo@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/déjà utilisée|déjà lié/i);
  });
});
