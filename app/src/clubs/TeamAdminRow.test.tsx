import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Table, TableBody } from '@basketeasy/ui/table';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamAdminRow } from './TeamAdminRow';

const admin = { userId: 'u2', email: 'a@b.com', teamId: 'team-1', createdAt: 'x' };

function renderRow(canManage: boolean) {
  return renderWithProviders(
    <Table>
      <TableBody>
        <TeamAdminRow clubId="club-1" teamId="team-1" admin={admin} canManage={canManage} />
      </TableBody>
    </Table>,
  );
}

describe('TeamAdminRow', () => {
  it('hides the Retirer button for a non-manager', () => {
    renderRow(false);

    expect(screen.getByText('a@b.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retirer/i })).not.toBeInTheDocument();
  });

  it('removes the team admin', async () => {
    let removeCalled = false;
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/admins/u2', () => {
        removeCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderRow(true);

    await user.click(screen.getByRole('button', { name: /retirer/i }));

    await waitFor(() => expect(removeCalled).toBe(true));
  });

  it('shows the server’s own message when removal is blocked (last admin removing themselves)', async () => {
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/admins/u2', () =>
        HttpResponse.json(
          {
            message:
              'Vous êtes le dernier administrateur de cette équipe : demandez à un administrateur du club de vous retirer.',
          },
          { status: 400 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderRow(true);

    await user.click(screen.getByRole('button', { name: /retirer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/dernier administrateur/i);
  });

  it('falls back to the generic message for other removal failures', async () => {
    server.use(
      http.delete('/api/clubs/club-1/teams/team-1/admins/u2', () =>
        HttpResponse.json({ message: 'Team admin not found' }, { status: 404 }),
      ),
    );

    const user = userEvent.setup();
    renderRow(true);

    await user.click(screen.getByRole('button', { name: /retirer/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/introuvable/i);
  });
});
