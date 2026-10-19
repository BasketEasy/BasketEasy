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

  it('shows a distinct already-accepted message with a login link when the preview 409s', async () => {
    server.use(
      http.get('/api/invites/abc123', () =>
        HttpResponse.json(
          { message: 'Cette invitation a déjà été acceptée', code: 'INVITE_ALREADY_ACCEPTED' },
          { status: 409 },
        ),
      ),
    );

    renderForm();

    expect(await screen.findByText(/déjà un compte/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /connectez-vous/i })).toHaveAttribute('href', '/login');
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

  it('shows the already-accepted notice with a login link when submit races an accepted invite', async () => {
    server.use(
      http.get('/api/invites/abc123', () =>
        HttpResponse.json({
          playerFirstName: 'Théo',
          playerLastName: 'Dupont',
          clubName: 'ASVEL',
        }),
      ),
      http.post('/api/invites/abc123/accept', () =>
        HttpResponse.json(
          { message: 'Cette invitation a déjà été acceptée', code: 'INVITE_ALREADY_ACCEPTED' },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderForm();

    await screen.findByText(/rejoindre asvel/i);
    await user.type(screen.getByLabelText(/adresse e-mail/i), 'theo@example.com');
    await user.type(screen.getByLabelText(/mot de passe/i), 'password123');
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByText(/déjà un compte pour cette invitation/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /connectez-vous/i })).toHaveAttribute('href', '/login');
  });

  describe('with a session', () => {
    function useSession() {
      server.use(
        http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
        http.get('/api/auth/me', () =>
          HttpResponse.json({
            id: 'user-1',
            email: 'admin@example.com',
            emailVerified: true,
            firstName: 'Jean',
            lastName: 'Dupont',
            avatarUrl: null,
            memberships: [],
          }),
        ),
        http.get('/api/invites/abc123', () =>
          HttpResponse.json({
            playerFirstName: 'Théo',
            playerLastName: 'Dupont',
            clubName: 'ASVEL',
          }),
        ),
      );
    }

    it('offers to link the logged-in account instead of registering a new one', async () => {
      useSession();

      renderForm();

      expect(await screen.findByText(/admin@example\.com/)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /lier ce compte à la fiche de théo/i }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/mot de passe/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: /créer un compte/i })).not.toBeInTheDocument();
    });

    it('links the account with the accept-as-me route', async () => {
      useSession();
      let called = false;
      server.use(
        http.post('/api/invites/abc123/accept-as-me', () => {
          called = true;
          return HttpResponse.json({
            playerId: 'player-1',
            clubId: 'club-1',
            user: {
              id: 'user-1',
              email: 'admin@example.com',
              emailVerified: true,
              firstName: 'Jean',
              lastName: 'Dupont',
              avatarUrl: null,
              memberships: [{ clubId: 'club-1', role: 'MEMBER' }],
            },
          });
        }),
      );

      const user = userEvent.setup();
      renderForm();

      await user.click(await screen.findByRole('button', { name: /lier ce compte/i }));

      await waitFor(() => expect(called).toBe(true));
    });

    it('says so when the account already holds another player of the club', async () => {
      useSession();
      server.use(
        http.post('/api/invites/abc123/accept-as-me', () =>
          HttpResponse.json({ message: 'conflict' }, { status: 409 }),
        ),
      );

      const user = userEvent.setup();
      renderForm();

      await user.click(await screen.findByRole('button', { name: /lier ce compte/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/déjà lié à un autre joueur/i);
    });
  });

  it('offers a login tab to a visitor who already has an account', async () => {
    server.use(
      http.get('/api/invites/abc123', () =>
        HttpResponse.json({
          playerFirstName: 'Théo',
          playerLastName: 'Dupont',
          clubName: 'ASVEL',
        }),
      ),
    );

    const user = userEvent.setup();
    renderForm();

    await user.click(await screen.findByRole('tab', { name: /j'ai déjà un compte/i }));

    expect(await screen.findByRole('button', { name: /se connecter/i })).toBeInTheDocument();
  });
});
