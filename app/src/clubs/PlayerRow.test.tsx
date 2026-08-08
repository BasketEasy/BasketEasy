import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Table, TableBody } from '@basketeasy/ui/table';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { PlayerRow } from './PlayerRow';

const player = {
  id: 'p1',
  clubId: 'club-1',
  firstName: 'Alex',
  lastName: 'Dupont',
  createdAt: 'x',
};

function renderRow(isAdmin = true) {
  return renderWithProviders(
    <Table>
      <TableBody>
        <PlayerRow clubId="club-1" player={player} isAdmin={isAdmin} />
      </TableBody>
    </Table>,
  );
}

describe('PlayerRow', () => {
  it('discards an edited draft when Annuler is clicked, instead of keeping it for next time', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole('button', { name: /modifier/i }));
    const firstNameInput = screen.getAllByRole('textbox')[0];
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Alexandre');
    await user.click(screen.getByRole('button', { name: /annuler/i }));

    // Re-enter edit mode: the input should show the original name, not the
    // discarded 'Alexandre' draft.
    await user.click(screen.getByRole('button', { name: /modifier/i }));
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Alex');
  });

  it('shows an error and stays in edit mode when saving fails', async () => {
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
});
