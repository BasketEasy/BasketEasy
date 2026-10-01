import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { JerseySwapDialog } from './JerseySwapDialog';
import { dutyDetail, emma, ines } from './testDuty';

const URL_SWAP = '/api/clubs/club-1/teams/team-1/events/event-1/jersey-duty/swap';
const chloe = {
  ...ines,
  teamPlayerId: 'tp-chloe',
  firstName: 'Chloé',
  lastName: 'Roux',
  turnsThisSeason: 2,
};
const detail = dutyDetail({ holder: emma, swapCandidates: [ines, chloe] });

function renderDialog(onOpenChange = vi.fn()) {
  renderWithProviders(
    <JerseySwapDialog
      clubId="club-1"
      teamId="team-1"
      eventId="event-1"
      detail={detail}
      childName={null}
      open
      onOpenChange={onOpenChange}
    />,
  );
  return onOpenChange;
}

describe('JerseySwapDialog', () => {
  it('lists the candidates with their turns and pre-selects the first', async () => {
    renderDialog();
    expect(await screen.findByText('Proposer un échange')).toBeInTheDocument();
    expect(screen.getByText('0 lavage')).toBeInTheDocument();
    expect(screen.getByText('2 lavages')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Inès B\./ })).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByText('Vous restez responsable tant qu’elle n’a pas accepté.'),
    ).toBeInTheDocument();
  });

  it('sends the chosen teammate and closes', async () => {
    let body: unknown;
    server.use(
      http.post(URL_SWAP, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(detail);
      }),
    );
    const onOpenChange = renderDialog();
    await userEvent.click(await screen.findByRole('radio', { name: /Chloé R\./ }));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la proposition' }));
    await waitFor(() => expect(body).toEqual({ teamPlayerId: 'tp-chloe' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('keeps a refusal in the sheet', async () => {
    server.use(
      http.post(URL_SWAP, () =>
        HttpResponse.json({ message: 'locked', code: 'JERSEY_DUTY_LOCKED' }, { status: 409 }),
      ),
    );
    const onOpenChange = renderDialog();
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer la proposition' }));
    expect(
      await screen.findByText(
        'Le match a commencé : seul un·e responsable peut encore changer le lavage.',
      ),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
