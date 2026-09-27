import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { EventConvocationRosterEntry, EventRsvpRosterEntry } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventRosterList } from './EventRosterList';

const RSVPS = '/api/clubs/club-1/teams/team-1/events/event-1/rsvps';
const CONVOCATIONS = '/api/clubs/club-1/teams/team-1/events/event-1/convocations';

const rsvps: EventRsvpRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    playerId: 'p-1',
    firstName: 'Camille',
    lastName: 'Roussel',
    role: 'PLAYER',
    status: 'GOING',
    respondedAt: '2026-01-02T00:00:00.000Z',
    respondedBy: null,
    respondedByGuardian: false,
    travelMode: null,
    isMe: false,
  },
  {
    teamPlayerId: 'tp-2',
    playerId: 'p-2',
    firstName: 'Chloé',
    lastName: 'Fontaine',
    role: 'COACH',
    status: null,
    respondedAt: null,
    respondedBy: null,
    respondedByGuardian: false,
    travelMode: null,
    isMe: true,
  },
];

const convocations: EventConvocationRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    playerId: 'p-1',
    firstName: 'Camille',
    lastName: 'Roussel',
    role: 'PLAYER',
    convoked: true,
    convokedAt: '2026-01-01T00:00:00.000Z',
    isMe: false,
  },
  {
    teamPlayerId: 'tp-2',
    playerId: 'p-2',
    firstName: 'Chloé',
    lastName: 'Fontaine',
    role: 'COACH',
    convoked: false,
    convokedAt: null,
    isMe: true,
  },
];

function mockRoster(rsvpRows = rsvps, convocationRows = convocations) {
  server.use(
    http.get(RSVPS, () => HttpResponse.json(rsvpRows)),
    http.get(CONVOCATIONS, () => HttpResponse.json(convocationRows)),
  );
}

function renderList() {
  return renderWithProviders(<EventRosterList clubId="club-1" teamId="team-1" eventId="event-1" />);
}

// jsdom's default innerWidth (1024) is above the desktop breakpoint, so the
// ResponsiveTable renders rows; the mobile branch is asserted explicitly.
const desktopWidth = window.innerWidth;
afterEach(() => {
  window.innerWidth = desktopWidth;
});

describe('EventRosterList', () => {
  it('carries both answers per line: who was called up, and what they replied', async () => {
    mockRoster();
    renderList();

    const row = (await screen.findByText('Camille Roussel')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('Convoqué·e')).toBeInTheDocument();
    expect(within(row!).getByText('Oui')).toBeInTheDocument();

    const mine = screen.getByText(/Chloé Fontaine \(vous\)/).closest('tr');
    expect(within(mine!).getByText('Non convoqué·e')).toBeInTheDocument();
    expect(within(mine!).getByText('Sans réponse')).toBeInTheDocument();
    expect(within(mine!).getByText('Entraîneur')).toBeInTheDocument();
  });

  it('is one component per record: the same row renders as a card on mobile', async () => {
    window.innerWidth = 390;
    mockRoster();
    renderList();

    expect(await screen.findByText('Camille Roussel')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Convoqué·e')).toBeInTheDocument();
    expect(screen.getByText('Oui')).toBeInTheDocument();
  });

  it('renders an error with a retry, never an empty state, when the roster fails to load', async () => {
    server.use(
      http.get(RSVPS, () => HttpResponse.json(rsvps)),
      http.get(CONVOCATIONS, () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );
    renderList();

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
    expect(screen.queryByText('Effectif vide')).not.toBeInTheDocument();
  });

  it('shows an empty state when the team has nobody to call up', async () => {
    mockRoster([], []);
    renderList();

    expect(await screen.findByText('Effectif vide')).toBeInTheDocument();
  });

  it('tells the coach when a parent gave the answer', async () => {
    mockRoster([
      {
        ...rsvps[0],
        respondedBy: { userId: 'mum', firstName: 'Sophie', lastInitial: 'R', isMe: false },
        respondedByGuardian: true,
      },
      rsvps[1],
    ]);
    renderList();

    expect(await screen.findByText('Sophie R. · parent')).toBeInTheDocument();
  });
});
