import { describe, expect, it, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import type { MyPersonas } from '@basketeasy/types/guardians';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { ActingAsProvider } from './ActingAsContext';
import { resolvePersona, useActingAs } from './useActingAs';

const child = (playerId: string, firstName: string) => ({
  playerId,
  firstName,
  lastName: 'Martin',
  clubId: 'club-1',
  clubName: 'ASBC',
  teams: [{ teamId: `team-${playerId}`, teamName: 'U11' }],
  pendingCount: 0,
});

const parentWhoPlays: MyPersonas = {
  self: { pendingCount: 0, playerIds: ['me'] },
  children: [child('leo', 'Léo'), child('emma', 'Emma')],
};

function mockSession(personas: MyPersonas) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 't' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({
        id: 'user-1',
        email: 'a@b.fr',
        firstName: 'Sophie',
        lastName: 'Martin',
        avatarUrl: null,
        emailVerified: true,
        emailNotificationsEnabled: true,
        memberships: [],
      }),
    ),
    http.get('/api/me/personas', () => HttpResponse.json(personas)),
  );
}

function Probe() {
  const { forPlayerId, persona } = useActingAs();
  const location = useLocation();
  return (
    <>
      <p>persona:{forPlayerId ?? 'moi'}</p>
      <p>name:{persona?.firstName ?? '-'}</p>
      <p>search:{location.search}</p>
    </>
  );
}

function renderProbe(route = '/dashboard') {
  return renderWithProviders(
    <ActingAsProvider>
      <Probe />
    </ActingAsProvider>,
    { route },
  );
}

describe('resolvePersona', () => {
  it('keeps a known child, falls back to « Moi », or the first child for a parent only', () => {
    expect(resolvePersona(parentWhoPlays, 'emma')).toBe('emma');
    expect(resolvePersona(parentWhoPlays, 'unknown')).toBeNull();
    expect(resolvePersona(parentWhoPlays, null)).toBeNull();
    expect(resolvePersona({ ...parentWhoPlays, self: null }, undefined)).toBe('leo');
    expect(resolvePersona({ ...parentWhoPlays, self: null }, null)).toBe('leo');
  });
});

describe('ActingAsProvider', () => {
  beforeEach(() => window.localStorage.clear());

  it('switches to the child named by ?pour= and strips it from the URL', async () => {
    mockSession(parentWhoPlays);
    renderProbe('/dashboard?pour=emma&tab=x');

    expect(await screen.findByText('persona:emma')).toBeInTheDocument();
    expect(await screen.findByText('name:Emma')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('search:?tab=x')).toBeInTheDocument());
    expect(window.localStorage.getItem('kluvo.actingAs.user-1')).toBe('emma');
  });

  it('reopens on the child chosen last time', async () => {
    window.localStorage.setItem('kluvo.actingAs.user-1', 'leo');
    mockSession(parentWhoPlays);
    renderProbe();

    expect(await screen.findByText('name:Léo')).toBeInTheDocument();
  });

  it('falls back to « Moi » when the remembered child is no longer followed', async () => {
    window.localStorage.setItem('kluvo.actingAs.user-1', 'gone');
    mockSession(parentWhoPlays);
    renderProbe();

    expect(await screen.findByText('persona:moi')).toBeInTheDocument();
  });

  it('opens a parent who is nothing else on their child', async () => {
    mockSession({ self: null, children: [child('leo', 'Léo')] });
    renderProbe();

    expect(await screen.findByText('persona:leo')).toBeInTheDocument();
  });
});
