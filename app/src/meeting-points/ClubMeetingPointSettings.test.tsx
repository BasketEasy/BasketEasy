import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { ClubMeetingPointSettings } from './ClubMeetingPointSettings';

function renderSettings() {
  return renderWithProviders(
    <>
      <ClubMeetingPointSettings clubId="club-1" />
      <Toaster />
    </>,
  );
}

describe('ClubMeetingPointSettings', () => {
  it('shows the configured place and buffer', async () => {
    server.use(
      http.get('/api/clubs/club-1/meeting-settings', () =>
        HttpResponse.json({
          meetingPoint: { name: 'Parking Coubertin', address: '12 rue X, Nantes' },
          arrivalBufferMinutes: 60,
        }),
      ),
    );
    renderSettings();

    expect(await screen.findByText('Parking Coubertin')).toBeInTheDocument();
    expect(screen.getByText('12 rue X, Nantes')).toBeInTheDocument();
    expect(screen.getByText('Arrivée à la salle 60 min avant le match')).toBeInTheDocument();
    expect(screen.getByText(/S’applique à toutes les équipes du club/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
    // No heading of its own: the club page's accordion trigger is the heading.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('offers « Définir » when no meeting point exists', async () => {
    renderSettings();

    expect(await screen.findByText('Aucun point de rendez-vous')).toBeInTheDocument();
    expect(
      screen.getByText('Les joueurs vont directement à la salle, 45 min avant le match.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Définir' })).toBeInTheDocument();
  });

  it('shows a retry on error, never « Aucun point de rendez-vous »', async () => {
    server.use(
      http.get('/api/clubs/club-1/meeting-settings', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderSettings();

    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.queryByText('Aucun point de rendez-vous')).not.toBeInTheDocument();
  });

  it('refuses a name without an address', async () => {
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole('button', { name: 'Définir' }));
    await user.type(screen.getByLabelText('Nom du lieu'), 'Parking');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Renseignez le nom et l’adresse')).toBeInTheDocument();
  });

  it('saves the place and buffer, then closes with a toast', async () => {
    let body: unknown;
    server.use(
      http.patch('/api/clubs/club-1/meeting-settings', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(body as object);
      }),
    );
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole('button', { name: 'Définir' }));
    await user.type(screen.getByLabelText('Nom du lieu'), 'Parking');
    await user.type(screen.getByLabelText('Adresse'), '1 rue X');
    const buffer = screen.getByLabelText('Arrivée à la salle avant le match');
    await user.clear(buffer);
    await user.type(buffer, '50');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(body).toEqual({
        meetingPoint: { name: 'Parking', address: '1 rue X' },
        arrivalBufferMinutes: 50,
      }),
    );
    expect(await screen.findByText('Point de rendez-vous enregistré')).toBeInTheDocument();
  });

  it('keeps the dialog open with the server error', async () => {
    server.use(
      http.patch('/api/clubs/club-1/meeting-settings', () =>
        HttpResponse.json({ message: 'Adresse trop longue' }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole('button', { name: 'Définir' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText('Certaines informations saisies sont invalides.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('removes the club meeting point from the dialog', async () => {
    let body: unknown;
    server.use(
      http.get('/api/clubs/club-1/meeting-settings', () =>
        HttpResponse.json({
          meetingPoint: { name: 'Parking Coubertin', address: '12 rue X, Nantes' },
          arrivalBufferMinutes: 60,
        }),
      ),
      http.patch('/api/clubs/club-1/meeting-settings', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(body as object);
      }),
    );
    const user = userEvent.setup();
    renderSettings();
    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer le RDV' }));

    await waitFor(() => expect(body).toEqual({ meetingPoint: null, arrivalBufferMinutes: 60 }));
  });
});
