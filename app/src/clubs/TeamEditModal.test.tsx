import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Team } from '@basketeasy/types/teams';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamEditModal } from './TeamEditModal';

const team = { id: 'team-1', name: 'U11 Filles', category: 'U11', gender: 'WOMEN' } as Team;

function renderModal() {
  return renderWithProviders(
    <TeamEditModal clubId="club-1" teamId="team-1" team={team} open onOpenChange={() => {}} />,
  );
}

describe('TeamEditModal', () => {
  it('sends the edited name with the unchanged category and gender', async () => {
    let body: unknown = null;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...team, name: 'U11 F1' });
      }),
    );
    const user = userEvent.setup();
    renderModal();

    const name = screen.getByLabelText("Nom de l'équipe");
    await user.clear(name);
    await user.type(name, 'U11 F1');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(body).toEqual({ name: 'U11 F1', category: 'U11', gender: 'WOMEN' }));
  });

  it('refuses an empty name before calling the API', async () => {
    let called = false;
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1', () => {
        called = true;
        return HttpResponse.json(team);
      }),
    );
    const user = userEvent.setup();
    renderModal();

    await user.clear(screen.getByLabelText("Nom de l'équipe"));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText("Nom de l'équipe requis")).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('keeps what the manager is typing when the team is refetched while open', async () => {
    // A background refetch hands the open dialog a new, equal team object.
    function Refetching() {
      const [current, setCurrent] = useState(team);
      return (
        <>
          <button type="button" onClick={() => setCurrent({ ...team })}>
            refetch
          </button>
          <TeamEditModal
            clubId="club-1"
            teamId="team-1"
            team={current}
            open
            onOpenChange={() => {}}
          />
        </>
      );
    }
    const user = userEvent.setup();
    renderWithProviders(<Refetching />);

    const name = screen.getByLabelText("Nom de l'équipe");
    await user.clear(name);
    await user.type(name, 'U11 F2');
    fireEvent.click(screen.getByRole('button', { name: 'refetch', hidden: true }));

    expect(screen.getByLabelText("Nom de l'équipe")).toHaveValue('U11 F2');
  });
});
