import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import type { TeamEvent } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventMeetingDialog } from './EventMeetingDialog';
import { at, computedPlan, matchEvent } from './testEvents';

const MEETING_URL = '/api/clubs/club-1/teams/team-1/events/event-1/meeting';

function renderDialog(event: TeamEvent = matchEvent()) {
  return renderWithProviders(
    <>
      <EventMeetingDialog
        clubId="club-1"
        teamId="team-1"
        event={event}
        plan={event.meetingPlan!}
        open
        onOpenChange={() => {}}
      />
      <Toaster />
    </>,
  );
}

function capturePatch(): { body?: unknown } {
  const captured: { body?: unknown } = {};
  server.use(
    http.patch(MEETING_URL, async ({ request }) => {
      captured.body = await request.json();
      return HttpResponse.json(computedPlan);
    }),
  );
  return captured;
}

describe('EventMeetingDialog', () => {
  it('sends only the travel minutes when that is all that changed', async () => {
    const captured = capturePatch();
    const user = userEvent.setup();
    renderDialog();

    expect(
      screen.getByText('Estimé 23 min par OpenRouteService, du RDV à la salle.'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Minutes (vide = calcul automatique)'), '30');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(captured.body).toEqual({ travelMinutes: 30 }));
  });

  it('sends a fixed meeting time on the match day', async () => {
    const captured = capturePatch();
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: /Heure fixe/ }));
    await user.type(screen.getByLabelText('Heure du rendez-vous'), '18:30');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(captured.body).toEqual({ meetsAt: at(18, 30) }));
  });

  it('refuses a meeting time after kick-off', async () => {
    const captured = capturePatch();
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('radio', { name: /Heure fixe/ }));
    await user.type(screen.getByLabelText('Heure du rendez-vous'), '21:00');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText('Le rendez-vous doit être avant le coup d’envoi'),
    ).toBeInTheDocument();
    expect(captured.body).toBeUndefined();
  });

  it('goes back to the default place by sending null', async () => {
    const captured = capturePatch();
    const user = userEvent.setup();
    renderDialog(
      matchEvent({
        meetingPlan: {
          ...computedPlan,
          meetingPointSource: 'EVENT',
          meetingPoint: { name: 'Parking Leclerc', address: 'Route de Vannes' },
        },
      }),
    );

    expect(screen.getByLabelText('Nom du lieu')).toHaveValue('Parking Leclerc');
    expect(
      await screen.findByText('Parking salle Coubertin · défini par le club'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /RDV par défaut/ }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(captured.body).toEqual({ meetingPoint: null }));
  });

  it('previews the meeting time the form would give, as it is typed', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByText('19:15')).toBeInTheDocument();
    expect(
      screen.getByText(
        '20:30 − 45 min d’arrivée − 23 min de trajet, arrondi au quart d’heure inférieur',
      ),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Minutes (vide = calcul automatique)'), '40');
    expect(screen.getByText('19:00')).toBeInTheDocument();
  });

  it('reports a recomputed travel time', async () => {
    server.use(
      http.post(`${MEETING_URL}/refresh`, () =>
        HttpResponse.json({ ...computedPlan, travelMinutes: 21 }),
      ),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Recalculer' }));

    expect(await screen.findByText('Trajet recalculé : 21 min')).toBeInTheDocument();
  });

  it('tells the manager to type the minutes when routing is down', async () => {
    server.use(
      http.post(`${MEETING_URL}/refresh`, () =>
        HttpResponse.json({ message: 'down' }, { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Recalculer' }));

    expect(
      await screen.findByText(
        'Le calcul d’itinéraire est indisponible. Saisissez la durée à la main.',
      ),
    ).toBeInTheDocument();
  });
});
