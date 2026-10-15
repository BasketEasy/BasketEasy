import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Table, TableBody } from '@basketeasy/ui/table';
import { Toaster } from '@basketeasy/ui/toaster';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { PlayerRow } from './PlayerRow';

const player = {
  id: 'p1',
  clubId: 'club-1',
  firstName: 'Alex',
  lastName: 'Dupont',
  userId: null,
  nationalId: null,
  licenseNumber: null,
  birthDate: null,
  gender: null,
  licenseType: null,
  isMinor: false,
  parentalConsentGivenAt: null,
  guardianCount: 0,
  createdAt: 'x',
};

function renderRow(isAdmin = true) {
  return renderWithProviders(
    <>
      <Table>
        <TableBody>
          <PlayerRow
            clubId="club-1"
            player={player}
            isAdmin={isAdmin}
            linkedMemberEmail={null}
            linkableMembers={[]}
          />
        </TableBody>
      </Table>
      <Toaster />
    </>,
  );
}

describe('PlayerRow', () => {
  it('discards an edited draft when the dialog is closed, instead of keeping it for next time', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole('button', { name: /modifier/i }));
    const firstNameInput = screen.getAllByRole('textbox')[0];
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Alexandre');
    await user.click(screen.getByRole('button', { name: /fermer/i }));

    // Re-open the dialog: the input should show the original name, not the
    // discarded 'Alexandre' draft — Radix unmounts the dialog content (and
    // with it the form's local state) when it closes.
    await user.click(screen.getByRole('button', { name: /modifier/i }));
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Alex');
  });

  it('shows an error and stays open when saving fails', async () => {
    server.use(
      http.patch('/api/clubs/club-1/players/p1', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );

    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole('button', { name: /modifier/i }));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/erreur est survenue/i);
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeInTheDocument();
  });

  it('shows an error when deleting fails (e.g. a role or state conflict)', async () => {
    server.use(
      http.delete('/api/clubs/club-1/players/p1', () =>
        HttpResponse.json({ message: 'error' }, { status: 403 }),
      ),
    );

    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole('button', { name: /supprimer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/droits nécessaires/i);
  });

  it('hides admin controls for a non-admin viewer', () => {
    renderRow(false);

    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /supprimer/i })).not.toBeInTheDocument();
  });

  it('shows the linked member email when the player already has one', () => {
    renderWithProviders(
      <Table>
        <TableBody>
          <PlayerRow
            clubId="club-1"
            player={{ ...player, userId: 'user-2' }}
            isAdmin={true}
            linkedMemberEmail="b@example.com"
            linkableMembers={[]}
          />
        </TableBody>
      </Table>,
    );

    expect(screen.getByText('b@example.com')).toBeInTheDocument();
  });

  it('links the player to a member and saves it in the update request', async () => {
    let capturedBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/players/p1', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...player, userId: 'user-2' });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <Table>
        <TableBody>
          <PlayerRow
            clubId="club-1"
            player={player}
            isAdmin={true}
            linkedMemberEmail={null}
            linkableMembers={[
              {
                userId: 'user-2',
                email: 'b@example.com',
                firstName: null,
                lastName: null,
                role: 'MEMBER',
                joinedAt: 'x',
              },
            ]}
          />
        </TableBody>
      </Table>,
    );

    await user.click(screen.getByRole('button', { name: /modifier/i }));
    await user.click(screen.getByRole('combobox', { name: /compte lié/i }));
    await user.click(await screen.findByRole('option', { name: 'b@example.com' }));
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    // The row leaves edit mode on a successful save — the resulting display
    // value comes from the parent's query cache, out of scope for this
    // isolated PlayerRow test, so we only assert the request that was sent.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /enregistrer/i })).not.toBeInTheDocument(),
    );
    expect(capturedBody).toEqual({
      firstName: 'Alex',
      lastName: 'Dupont',
      userId: 'user-2',
      nationalId: null,
      licenseNumber: null,
      birthDate: null,
      gender: null,
      licenseType: null,
    });
  });

  describe('parental consent', () => {
    const minor = { ...player, isMinor: true, parentalConsentGivenAt: null };

    it('flags a minor with no attestation on file', () => {
      renderWithProviders(
        <>
          <Table>
            <TableBody>
              <PlayerRow
                clubId="club-1"
                player={minor}
                isAdmin
                linkedMemberEmail={null}
                linkableMembers={[]}
              />
            </TableBody>
          </Table>
          <Toaster />
        </>,
      );

      expect(screen.getByText(/autorisation manquante/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /autorisation parentale/i })).toBeInTheDocument();
    });

    it('drops the flag once an attestation exists, keeping the action', () => {
      renderWithProviders(
        <>
          <Table>
            <TableBody>
              <PlayerRow
                clubId="club-1"
                player={{ ...minor, parentalConsentGivenAt: '2026-02-03T00:00:00.000Z' }}
                isAdmin
                linkedMemberEmail={null}
                linkableMembers={[]}
              />
            </TableBody>
          </Table>
          <Toaster />
        </>,
      );

      expect(screen.queryByText(/autorisation manquante/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /autorisation parentale/i })).toBeInTheDocument();
    });

    it('shows nothing about consent for an adult', () => {
      renderWithProviders(
        <>
          <Table>
            <TableBody>
              <PlayerRow
                clubId="club-1"
                player={player}
                isAdmin
                linkedMemberEmail={null}
                linkableMembers={[]}
              />
            </TableBody>
          </Table>
          <Toaster />
        </>,
      );

      expect(screen.queryByText(/autorisation/i)).not.toBeInTheDocument();
    });
  });
});
