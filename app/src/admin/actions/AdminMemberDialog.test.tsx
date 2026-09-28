import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { AdminClubMember } from '@basketeasy/types/platform-admin-browse';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../testUtils';
import { AdminMemberDialog } from './AdminMemberDialog';

const MEMBER: AdminClubMember = {
  person: {
    kind: 'user',
    id: 'user-1',
    displayName: 'Paul Renaud',
    email: 'paul@example.fr',
    emailDomain: 'example.fr',
    redacted: false,
  },
  role: 'ADMIN',
  joinedAt: '2026-09-20T10:00:00.000Z',
};

function renderDialog() {
  renderWithProviders(<AdminMemberDialog clubId="club-1" clubName="AL Orvault" member={MEMBER} />);
}

async function openWithReason(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Gérer' }));
  const dialog = within(screen.getByRole('dialog'));
  await user.type(dialog.getByLabelText('Motif'), 'Demande du président, ticket #815');
  return dialog;
}

describe('AdminMemberDialog', () => {
  it('asks for a different role before changing it', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await openWithReason(user);

    await user.click(dialog.getByRole('button', { name: 'Changer le rôle' }));

    expect(
      await dialog.findByText('Choisissez un autre rôle que le rôle actuel.'),
    ).toBeInTheDocument();
  });

  it('shows the last-admin refusal', async () => {
    server.use(
      http.post('/api/admin/clubs/club-1/members/user-1/role', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message: 'C’est le dernier admin du club : nommez d’abord un autre admin',
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderDialog();
    const dialog = await openWithReason(user);

    await user.click(dialog.getByRole('radio', { name: /Membre/ }));
    await user.click(dialog.getByRole('button', { name: 'Changer le rôle' }));

    expect(
      await dialog.findByText('C’est le dernier admin du club : nommez d’abord un autre admin'),
    ).toBeInTheDocument();
  });

  it('removes the membership through its own route with the same reason', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/admin/clubs/club-1/members/user-1/remove', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ action: 'REMOVE_MEMBERSHIP', auditLogId: 'a-1' });
      }),
    );
    const user = userEvent.setup();
    renderDialog();
    const dialog = await openWithReason(user);

    await user.click(dialog.getByRole('button', { name: 'Retirer du club' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(body).toEqual({ reason: 'Demande du président, ticket #815' });
  });
});
