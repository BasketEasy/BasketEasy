import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Button } from '@basketeasy/ui/button';
import { Toaster } from '@basketeasy/ui/toaster';
import type { TeamEvent } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { matchEvent } from '../meeting-points/testEvents';
import { EventVenueDialog } from './EventVenueDialog';

const EVENT_URL = '/api/clubs/club-1/teams/team-1/events/event-1';

function rosterRow(teamPlayerId: string) {
  return {
    teamPlayerId,
    playerId: `p-${teamPlayerId}`,
    firstName: 'A',
    lastName: 'B',
    role: 'PLAYER',
    isMe: false,
  };
}

// tp-1 convoked and GOING, tp-2 convoked only, tp-3 GOING only, tp-4 MAYBE:
// three players are told.
function givenRoster() {
  server.use(
    http.get(`${EVENT_URL}/convocations`, () =>
      HttpResponse.json(
        ['tp-1', 'tp-2', 'tp-3', 'tp-4'].map((id) => ({
          ...rosterRow(id),
          convoked: id === 'tp-1' || id === 'tp-2',
          convokedAt: null,
        })),
      ),
    ),
    http.get(`${EVENT_URL}/rsvps`, () =>
      HttpResponse.json(
        ['tp-1', 'tp-2', 'tp-3', 'tp-4'].map((id) => ({
          ...rosterRow(id),
          status: id === 'tp-4' ? 'MAYBE' : id === 'tp-2' ? null : 'GOING',
          respondedAt: null,
          respondedBy: null,
          respondedByGuardian: false,
          viaLink: false,
          travelMode: null,
        })),
      ),
    ),
  );
}

function Harness({ event }: { event: TeamEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <EventVenueDialog
        clubId="club-1"
        teamId="team-1"
        event={event}
        open={open}
        onOpenChange={setOpen}
        trigger={<Button>Ouvrir</Button>}
      />
      <Toaster />
    </>
  );
}

async function openDialog(event: TeamEvent) {
  givenRoster();
  const user = userEvent.setup();
  renderWithProviders(<Harness event={event} />);
  await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
  return user;
}

const unknownVenue = matchEvent({ location: 'Lieu non communiqué', isImported: true });
const knownVenue = matchEvent({ location: '1 rue A, Rezé', locationName: 'Salle A' });

describe('EventVenueDialog', () => {
  it('requires both the gym name and the address', async () => {
    const user = await openDialog(unknownVenue);

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Nom de la salle requis')).toBeInTheDocument();
    expect(screen.getByText('Adresse requise')).toBeInTheDocument();
  });

  it('seeds an unknown venue empty, never with the placeholder', async () => {
    await openDialog(unknownVenue);

    expect(screen.getByRole('heading', { name: 'Ajouter le lieu' })).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse')).toHaveValue('');
  });

  it('warns that the next FFBB import may replace the venue, for an imported match only', async () => {
    await openDialog(unknownVenue);
    expect(
      screen.getByText('Si la FFBB publie un lieu, le prochain import le remplacera.'),
    ).toBeInTheDocument();
  });

  it('has no FFBB note for a match created by hand', async () => {
    await openDialog(knownVenue);
    expect(screen.queryByText(/prochain import/)).not.toBeInTheDocument();
  });

  it('fills in an unknown venue silently', async () => {
    const user = await openDialog(unknownVenue);

    await user.type(screen.getByLabelText('Nom de la salle'), 'Salle B');
    await user.type(screen.getByLabelText('Adresse'), '2 rue B, Nantes');

    expect(screen.queryByText(/seront prévenus/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  });

  it('says who will be told when a known venue moves, and changes the button', async () => {
    const user = await openDialog(knownVenue);

    await user.clear(screen.getByLabelText('Adresse'));
    await user.type(screen.getByLabelText('Adresse'), '2 rue B, Nantes');

    expect(
      await screen.findByText(
        'Les 3 joueurs convoqués ou présents seront prévenus du changement de salle.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer et prévenir' })).toBeInTheDocument();
  });

  it('does not warn for a change of case only', async () => {
    const user = await openDialog(knownVenue);

    await user.clear(screen.getByLabelText('Adresse'));
    await user.type(screen.getByLabelText('Adresse'), '1 RUE A, rezé');

    expect(screen.queryByText(/seront prévenus/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
  });

  it('shows a server refusal in the dialog', async () => {
    server.use(
      http.patch(EVENT_URL, () =>
        HttpResponse.json({ message: "Renseignez l'adresse de la salle" }, { status: 400 }),
      ),
    );
    const user = await openDialog(knownVenue);

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText("Renseignez l'adresse de la salle")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Modifier le lieu' })).toBeInTheDocument();
  });

  it('saves the pair, toasts and closes', async () => {
    let body: unknown;
    server.use(
      http.patch(EVENT_URL, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json([knownVenue]);
      }),
    );
    const user = await openDialog(unknownVenue);

    await user.type(screen.getByLabelText('Nom de la salle'), '  Salle B ');
    await user.type(screen.getByLabelText('Adresse'), '2 rue B, Nantes');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(body).toEqual({ location: '2 rue B, Nantes', locationName: 'Salle B', scope: 'THIS' }),
    );
    expect(await screen.findByText('Lieu enregistré')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Ajouter le lieu' })).not.toBeInTheDocument(),
    );
  });
});
