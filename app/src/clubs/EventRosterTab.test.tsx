import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { EventConvocationRosterEntry, EventRsvpRosterEntry } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventRosterTab } from './EventRosterTab';

const rsvps: EventRsvpRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    playerId: 'player-1',
    firstName: 'Lea',
    lastName: 'Bernard',
    role: 'PLAYER',
    status: 'GOING',
    respondedAt: '2026-01-02T00:00:00.000Z',
    isMe: true,
  },
  {
    teamPlayerId: 'tp-2',
    playerId: 'player-2',
    firstName: 'Nathan',
    lastName: 'Hubert',
    role: 'PLAYER',
    status: 'NOT_GOING',
    respondedAt: '2026-01-02T00:00:00.000Z',
    isMe: false,
  },
  {
    teamPlayerId: 'tp-3',
    playerId: 'player-3',
    firstName: 'Ines',
    lastName: 'Petit',
    role: 'COACH',
    status: null,
    respondedAt: null,
    isMe: false,
  },
];

const convocations: EventConvocationRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    playerId: 'player-1',
    firstName: 'Lea',
    lastName: 'Bernard',
    role: 'PLAYER',
    convoked: true,
    convokedAt: '2026-01-01T00:00:00.000Z',
    isMe: true,
  },
  {
    teamPlayerId: 'tp-2',
    playerId: 'player-2',
    firstName: 'Nathan',
    lastName: 'Hubert',
    role: 'PLAYER',
    convoked: false,
    convokedAt: null,
    isMe: false,
  },
  {
    teamPlayerId: 'tp-3',
    playerId: 'player-3',
    firstName: 'Ines',
    lastName: 'Petit',
    role: 'COACH',
    convoked: true,
    convokedAt: '2026-01-01T00:00:00.000Z',
    isMe: false,
  },
];

function mockRoster() {
  server.use(
    http.get('/api/clubs/club-1/teams/team-1/events/event-1/rsvps', () => HttpResponse.json(rsvps)),
    http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
      HttpResponse.json(convocations),
    ),
  );
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
}

describe('EventRosterTab', () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it('shows an error state with retry when either roster fetch fails', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/rsvps', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json(convocations),
      ),
    );

    renderWithProviders(
      <EventRosterTab clubId="club-1" teamId="team-1" eventId="event-1" canManage={false} />,
    );

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
  });

  it('merges RSVP and convocation status per roster member, on the desktop table', async () => {
    mockRoster();

    renderWithProviders(
      <EventRosterTab clubId="club-1" teamId="team-1" eventId="event-1" canManage={false} />,
    );

    expect(await screen.findByText(/lea bernard \(vous\)/i)).toBeInTheDocument();
    expect(screen.getByText('Nathan Hubert')).toBeInTheDocument();
    expect(screen.getByText('Ines Petit')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Joueur' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Convocation' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Présence' })).toBeInTheDocument();

    // Lea: convoked + present.
    expect(screen.getAllByText('Convoqué').length).toBe(2);
    expect(screen.getByText('Présent')).toBeInTheDocument();
    // Nathan: not convoked + absent.
    expect(screen.getByText('Non convoqué')).toBeInTheDocument();
    expect(screen.getByText('Absent')).toBeInTheDocument();
    // Ines: convoked, no RSVP response yet.
    expect(screen.getByText('En attente')).toBeInTheDocument();
  });

  it('derives the summary meters from the merged roster', async () => {
    mockRoster();

    renderWithProviders(
      <EventRosterTab clubId="club-1" teamId="team-1" eventId="event-1" canManage={false} />,
    );

    await waitFor(() => expect(screen.getByText('2/3')).toBeInTheDocument());
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('Convoqués')).toBeInTheDocument();
    expect(screen.getByText('Présences confirmées')).toBeInTheDocument();
  });

  it('hides the manage-convocation control for a non-manager', async () => {
    mockRoster();

    renderWithProviders(
      <EventRosterTab clubId="club-1" teamId="team-1" eventId="event-1" canManage={false} />,
    );
    await screen.findByText(/lea bernard/i);
    expect(screen.queryByRole('button', { name: /gérer la convocation/i })).not.toBeInTheDocument();
  });

  it('shows the manage-convocation control for a manager', async () => {
    mockRoster();

    renderWithProviders(
      <EventRosterTab clubId="club-1" teamId="team-1" eventId="event-1" canManage />,
    );
    expect(
      await screen.findByRole('button', { name: /gérer la convocation/i }),
    ).toBeInTheDocument();
  });

  it('collapses to cards below the desktop breakpoint', async () => {
    setViewportWidth(375);
    mockRoster();

    renderWithProviders(
      <EventRosterTab clubId="club-1" teamId="team-1" eventId="event-1" canManage={false} />,
    );

    await screen.findByText(/lea bernard/i);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
  });

  it('shows an empty state when the roster has no members', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/rsvps', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json([]),
      ),
    );

    renderWithProviders(
      <EventRosterTab clubId="club-1" teamId="team-1" eventId="event-1" canManage={false} />,
    );

    expect(await screen.findByText('Effectif vide')).toBeInTheDocument();
  });
});
