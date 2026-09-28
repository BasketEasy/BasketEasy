import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { INVITE_ALREADY_ACCEPTED_CODE } from '@basketeasy/types/player-invites';
import {
  GUARDIAN_INVITE_REFUSED_CODE,
  type GuardianInvitePreview,
} from '@basketeasy/types/guardians';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { GuardianInviteCard } from './GuardianInviteCard';

const minorPreview: GuardianInvitePreview = {
  playerFirstName: 'Léo',
  playerLastName: 'Martin',
  clubName: 'ASBC Rezé',
  teamNames: ['U11 M'],
  requiresConsent: true,
  expiresAt: '2026-10-04T10:00:00.000Z',
};

function mockPreview(body: GuardianInvitePreview | { status: number; code?: string }) {
  server.use(
    http.get('/api/guardian-invites/tok', () =>
      'status' in body
        ? HttpResponse.json({ message: 'x', code: body.code }, { status: body.status })
        : HttpResponse.json(body),
    ),
  );
}

function mockLoggedIn() {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 't' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'u1',
        email: 'sophie@example.com',
        firstName: 'Sophie',
        lastName: 'Martin',
        avatarUrl: null,
        emailVerified: true,
        emailNotificationsEnabled: true,
        memberships: [],
      }),
    ),
  );
}

function renderCard() {
  return renderWithProviders(
    <Routes>
      <Route path="/guardian-invite/:token" element={<GuardianInviteCard token="tok" />} />
      <Route path="/dashboard" element={<p>Tableau de bord</p>} />
    </Routes>,
    { route: '/guardian-invite/tok' },
  );
}

describe('GuardianInviteCard', () => {
  it('explains an expired link', async () => {
    mockPreview({ status: 404 });
    renderCard();
    expect(await screen.findByText(/n'est plus valide ou a expiré/i)).toBeInTheDocument();
  });

  it('sends someone whose link was already used to log in', async () => {
    mockPreview({ status: 409, code: INVITE_ALREADY_ACCEPTED_CODE });
    renderCard();
    expect(await screen.findByText('Lien déjà utilisé')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /connectez-vous/i })).toHaveAttribute('href', '/login');
  });

  it('requires consent for a minor before creating the account', async () => {
    mockPreview(minorPreview);
    let body: unknown = null;
    server.use(
      http.post('/api/guardian-invites/tok/accept', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          accessToken: 'a',
          user: { id: 'u1', email: 's@x.fr', memberships: [] },
        });
      }),
    );
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByText('Suivre Léo Martin')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Prénom'), 'Sophie');
    await user.type(screen.getByLabelText('Nom'), 'Martin');
    await user.type(screen.getByLabelText('Adresse e-mail'), 's@x.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'password1234');
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByText(/cochez la case/i)).toBeInTheDocument();
    expect(body).toBeNull();

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /créer mon compte/i }));

    expect(await screen.findByText('Tableau de bord')).toBeInTheDocument();
    expect(body).toEqual({
      firstName: 'Sophie',
      lastName: 'Martin',
      email: 's@x.fr',
      password: 'password1234',
      consent: true,
    });
  });

  it('asks no consent for an adult', async () => {
    mockPreview({ ...minorPreview, requiresConsent: false });
    renderCard();

    expect(await screen.findByText('Suivre Léo Martin')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('lets a logged-in parent follow the child with their existing account', async () => {
    mockLoggedIn();
    mockPreview(minorPreview);
    let body: unknown = null;
    server.use(
      http.post('/api/guardian-invites/tok/accept-as-me', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ playerId: 'p1', clubId: 'club-1' });
      }),
    );
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByText('sophie@example.com')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mot de passe')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Suivre Léo' }));

    await waitFor(() => expect(body).toEqual({ consent: true }));
    expect(await screen.findByText('Tableau de bord')).toBeInTheDocument();
  });

  it('asks a logged-in parent for consent before calling the API', async () => {
    mockLoggedIn();
    mockPreview(minorPreview);
    let called = false;
    server.use(
      http.post('/api/guardian-invites/tok/accept-as-me', () => {
        called = true;
        return HttpResponse.json({ playerId: 'p1', clubId: 'club-1' });
      }),
    );
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Suivre Léo' }));

    expect(
      await screen.findByText('Cochez la case pour donner votre autorisation parentale.'),
    ).toBeInTheDocument();
    expect(called).toBe(false);

    // Ticking the box clears the error without another submit.
    await user.click(screen.getByRole('checkbox'));
    await waitFor(() =>
      expect(
        screen.queryByText('Cochez la case pour donner votre autorisation parentale.'),
      ).not.toBeInTheDocument(),
    );
  });

  it.each([
    [
      'shows a refusal written for the parent',
      { message: 'Ce joueur a déjà 4 parents liés', code: GUARDIAN_INVITE_REFUSED_CODE },
      'Ce joueur a déjà 4 parents liés',
    ],
    [
      'never shows a validation message verbatim',
      { message: 'consent must be a boolean value' },
      'Certaines informations saisies sont invalides.',
    ],
  ])('%s', async (_label, errorBody, expected) => {
    mockLoggedIn();
    mockPreview({ ...minorPreview, requiresConsent: false });
    server.use(
      http.post('/api/guardian-invites/tok/accept-as-me', () =>
        HttpResponse.json(errorBody, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Suivre Léo' }));

    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(screen.queryByText('consent must be a boolean value')).not.toBeInTheDocument();
  });
});
