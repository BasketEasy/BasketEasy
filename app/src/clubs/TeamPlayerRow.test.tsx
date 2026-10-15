import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Table, TableBody } from '@basketeasy/ui/table';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamPlayerRow } from './TeamPlayerRow';

const teamPlayer = {
  id: 'tp-1',
  teamId: 'team-1',
  playerId: 'p1',
  firstName: 'Alex',
  lastName: 'Dupont',
  clubId: 'club-1',
  role: 'PLAYER' as const,
  jerseyDutyExempt: false,
  createdAt: 'x',
};

function renderRow(canManage: boolean) {
  return renderWithProviders(
    <Table>
      <TableBody>
        <TeamPlayerRow
          clubId="club-1"
          teamId="team-1"
          teamPlayer={teamPlayer}
          canManage={canManage}
        />
      </TableBody>
    </Table>,
  );
}

describe('TeamPlayerRow', () => {
  it('shows the role as a badge, not a select, for a non-manager', () => {
    renderRow(false);

    expect(screen.getByText('Joueur')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retirer/i })).not.toBeInTheDocument();
  });

  it('lets a manager change the role via the select', async () => {
    let capturedBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/players/p1', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ...teamPlayer, role: 'COACH' });
      }),
    );

    const user = userEvent.setup();
    renderRow(true);

    await user.click(screen.getByRole('combobox', { name: /rôle/i }));
    await user.click(await screen.findByRole('option', { name: 'Entraîneur' }));

    await waitFor(() => expect(capturedBody).toEqual({ role: 'COACH' }));
  });

  it('removes the player from the roster', async () => {
    let removeCalled = false;
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/players/p1', () => {
        removeCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderRow(true);

    await user.click(screen.getByRole('button', { name: /retirer/i }));

    await waitFor(() => expect(removeCalled).toBe(true));
  });
});
