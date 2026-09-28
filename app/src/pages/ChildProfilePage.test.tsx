import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { Toaster } from '@basketeasy/ui/toaster';
import type { MyChildProfile } from '@basketeasy/types/guardians';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { ChildProfilePage } from './ChildProfilePage';

const child: MyChildProfile = {
  playerId: 'child-1',
  firstName: 'Léo',
  lastName: 'Martin',
  birthDate: '2015-05-01T00:00:00.000Z',
  gender: 'MEN',
  isMinor: true,
  clubId: 'club-1',
  clubName: 'ASBC Rezé',
  teams: [{ teamId: 'team-1', teamName: 'U11 M' }],
  coGuardians: [{ firstName: 'Marc', lastName: 'Martin' }],
  consent: {
    consentGivenAt: '2026-09-01T10:00:00.000Z',
    attestedByName: 'Sophie Martin',
    source: 'GUARDIAN_IN_APP',
  },
};

function renderPage() {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/children/:playerId" element={<ChildProfilePage />} />
        <Route path="/account" element={<p>Mon compte</p>} />
      </Routes>
      <Toaster />
    </>,
    { route: '/children/child-1' },
  );
}

describe('ChildProfilePage', () => {
  it('shows the profile, the club-managed part and co-parents by name only', async () => {
    server.use(http.get('/api/me/children/child-1', () => HttpResponse.json(child)));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Léo Martin' })).toBeInTheDocument();
    expect(screen.getByLabelText('Prénom')).toHaveValue('Léo');
    expect(screen.getByText('U11 M')).toBeInTheDocument();
    expect(screen.getByText('Suivi aussi par Marc Martin.')).toBeInTheDocument();
    expect(screen.getByText(/autorisation parentale donnée le/i)).toBeInTheDocument();
  });

  it('saves the four editable fields', async () => {
    let body: unknown = null;
    server.use(
      http.get('/api/me/children/child-1', () => HttpResponse.json(child)),
      http.patch('/api/me/children/child-1', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...child, firstName: 'Léon' });
      }),
    );
    const user = userEvent.setup();
    renderPage();

    const firstName = await screen.findByLabelText('Prénom');
    await user.clear(firstName);
    await user.type(firstName, 'Léon');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(body).toEqual({
        firstName: 'Léon',
        lastName: 'Martin',
        birthDate: '2015-05-01',
        gender: 'MEN',
      }),
    );
  });

  it('does not let a parent clear a minor’s birth date', async () => {
    let patched = false;
    server.use(
      http.get('/api/me/children/child-1', () => HttpResponse.json(child)),
      http.patch('/api/me/children/child-1', () => {
        patched = true;
        return HttpResponse.json(child);
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.clear(await screen.findByLabelText('Date de naissance'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText(/seul le club peut retirer cette date/i)).toBeInTheDocument();
    expect(patched).toBe(false);
  });

  it('stops following after a confirmation and returns to the account page', async () => {
    let deleted = false;
    server.use(
      http.get('/api/me/children/child-1', () => HttpResponse.json(child)),
      http.delete('/api/me/children/child-1', () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Ne plus suivre Léo' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Ne plus suivre' }),
    );

    expect(await screen.findByText('Mon compte')).toBeInTheDocument();
    expect(deleted).toBe(true);
  });

  it('says so when the caller does not follow this child', async () => {
    server.use(
      http.get('/api/me/children/child-1', () =>
        HttpResponse.json({ message: 'Joueur introuvable' }, { status: 404 }),
      ),
    );
    renderPage();

    expect(await screen.findByText('Enfant introuvable')).toBeInTheDocument();
  });
});
