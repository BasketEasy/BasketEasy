import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import type { Player } from '@basketeasy/types/players';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { ParentalConsentDialog } from './ParentalConsentDialog';

const minor: Player = {
  id: 'p1',
  clubId: 'club-1',
  firstName: 'Léa',
  lastName: 'Martin',
  userId: null,
  nationalId: null,
  licenseNumber: null,
  birthDate: '2015-04-03T00:00:00.000Z',
  gender: null,
  licenseType: null,
  isMinor: true,
  parentalConsentGivenAt: null,
  createdAt: 'x',
};

function renderDialog(player: Player = minor) {
  return renderWithProviders(
    <>
      <ParentalConsentDialog clubId="club-1" player={player} />
      <Toaster />
    </>,
  );
}

async function openDialog() {
  const user = userEvent.setup();
  renderDialog();
  await user.click(screen.getByRole('button', { name: /autorisation parentale/i }));
  return user;
}

describe('ParentalConsentDialog', () => {
  it('refuses to submit until the attestation is ticked', async () => {
    let called = false;
    server.use(
      http.post('/api/clubs/club-1/players/p1/parental-consent', () => {
        called = true;
        return HttpResponse.json({});
      }),
    );

    const user = await openDialog();
    await user.click(await screen.findByRole('button', { name: /^enregistrer$/i }));

    expect(await screen.findByText(/cochez la case/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('records the attestation and confirms with a toast', async () => {
    let capturedBody: unknown;
    server.use(
      http.post('/api/clubs/club-1/players/p1/parental-consent', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: 'consent-1' });
      }),
    );

    const user = await openDialog();
    await user.click(await screen.findByRole('checkbox'));
    await user.type(screen.getByLabelText(/nom de la personne qui atteste/i), 'Marie Durand');
    await user.click(screen.getByRole('button', { name: /^enregistrer$/i }));

    await waitFor(() => expect(capturedBody).toEqual({ attestedByName: 'Marie Durand' }));
    expect(await screen.findByText(/autorisation parentale enregistrée/i)).toBeInTheDocument();
  });

  it('reports a failed write without closing the dialog', async () => {
    server.use(
      http.post('/api/clubs/club-1/players/p1/parental-consent', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );

    const user = await openDialog();
    await user.click(await screen.findByRole('checkbox'));
    await user.type(screen.getByLabelText(/nom de la personne qui atteste/i), 'Marie Durand');
    await user.click(screen.getByRole('button', { name: /^enregistrer$/i }));

    expect(await screen.findByText(/erreur est survenue/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^enregistrer$/i })).toBeInTheDocument();
  });

  it('says when an attestation already exists', async () => {
    const user = userEvent.setup();
    renderDialog({ ...minor, parentalConsentGivenAt: '2026-02-03T00:00:00.000Z' });

    await user.click(screen.getByRole('button', { name: /autorisation parentale/i }));

    expect(await screen.findByText(/03\/02\/2026/)).toBeInTheDocument();
  });
});
