import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { ClubMemberAddForm } from './ClubMemberAddForm';

describe('ClubMemberAddForm', () => {
  it('shows a validation error and does not submit for an invalid email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ClubMemberAddForm clubId="club-1" />);

    await user.type(screen.getByLabelText(/adresse e-mail du membre/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /ajouter/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/e-mail/i);
  });

  it('submits a valid email and clears the field on success', async () => {
    let addCalled = false;
    server.use(
      http.post('/api/clubs/club-1/members', async ({ request }) => {
        addCalled = true;
        const body = (await request.json()) as { email: string };
        expect(body).toEqual({ email: 'a@b.com' });
        return HttpResponse.json({
          userId: 'user-2',
          email: body.email,
          role: 'MEMBER',
          joinedAt: '2026-01-02',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(<ClubMemberAddForm clubId="club-1" />);

    const emailInput = screen.getByLabelText(/adresse e-mail du membre/i);
    await user.type(emailInput, 'a@b.com');
    await user.click(screen.getByRole('button', { name: /ajouter/i }));

    await screen.findByRole('button', { name: /ajouter/i });
    expect(addCalled).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a specific error when the email has no account (404)', async () => {
    server.use(
      http.post('/api/clubs/club-1/members', () =>
        HttpResponse.json({ message: 'No account with that email' }, { status: 404 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<ClubMemberAddForm clubId="club-1" />);

    await user.type(screen.getByLabelText(/adresse e-mail du membre/i), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: /ajouter/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /aucun compte avec cette adresse e-mail/i,
    );
  });

  it('shows the generic conflict error when the user is already a member (409)', async () => {
    server.use(
      http.post('/api/clubs/club-1/members', () =>
        HttpResponse.json({ message: 'User is already a member of this club' }, { status: 409 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<ClubMemberAddForm clubId="club-1" />);

    await user.type(screen.getByLabelText(/adresse e-mail du membre/i), 'a@b.com');
    await user.click(screen.getByRole('button', { name: /ajouter/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/déjà membre/i);
  });
});
