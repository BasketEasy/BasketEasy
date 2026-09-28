import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { EventConvocationRosterEntry, EventRsvpRosterEntry } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventAttendanceSection } from './EventAttendanceSection';
import { computedPlan } from '../meeting-points/testEvents';

const RSVPS = '/api/clubs/club-1/teams/team-1/events/event-1/rsvps';
const CONVOCATIONS = '/api/clubs/club-1/teams/team-1/events/event-1/convocations';

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  status: EventRsvpRosterEntry['status'];
  convoked: boolean;
  isMe?: boolean;
  travelMode?: EventRsvpRosterEntry['travelMode'];
};

const SQUAD: Person[] = [
  { id: 'tp-1', firstName: 'Camille', lastName: 'Roussel', status: 'GOING', convoked: true },
  { id: 'tp-2', firstName: 'Sarah', lastName: 'Diallo', status: 'GOING', convoked: true },
  { id: 'tp-3', firstName: 'Manon', lastName: 'Guérin', status: 'MAYBE', convoked: true },
  { id: 'tp-4', firstName: 'Amina', lastName: 'Traoré', status: 'NOT_GOING', convoked: true },
  {
    id: 'tp-5',
    firstName: 'Léa',
    lastName: 'Moreau',
    status: null,
    convoked: true,
    isMe: true,
  },
  // Not called up: must never be counted, and must not be listed either.
  { id: 'tp-6', firstName: 'Chloé', lastName: 'Fontaine', status: 'GOING', convoked: false },
];

function mockRoster(people: Person[] = SQUAD) {
  const rsvps: EventRsvpRosterEntry[] = people.map((p) => ({
    teamPlayerId: p.id,
    playerId: `player-${p.id}`,
    firstName: p.firstName,
    lastName: p.lastName,
    role: 'PLAYER',
    status: p.status,
    respondedAt: p.status ? '2026-01-02T00:00:00.000Z' : null,
    respondedBy: null,
    respondedByGuardian: false,
    travelMode: p.travelMode ?? null,
    isMe: p.isMe ?? false,
  }));
  const convocations: EventConvocationRosterEntry[] = people.map((p) => ({
    teamPlayerId: p.id,
    playerId: `player-${p.id}`,
    firstName: p.firstName,
    lastName: p.lastName,
    role: 'PLAYER',
    convoked: p.convoked,
    convokedAt: p.convoked ? '2026-01-01T00:00:00.000Z' : null,
    isMe: p.isMe ?? false,
  }));
  server.use(
    http.get(RSVPS, () => HttpResponse.json(rsvps)),
    http.get(CONVOCATIONS, () => HttpResponse.json(convocations)),
  );
}

function renderSection() {
  return renderWithProviders(
    <EventAttendanceSection clubId="club-1" teamId="team-1" eventId="event-1" />,
  );
}

describe('EventAttendanceSection', () => {
  it('shows who comes to the meeting point and who goes direct, on a match that has one', async () => {
    mockRoster(
      SQUAD.map((p) =>
        p.id === 'tp-1'
          ? { ...p, travelMode: 'DIRECT' }
          : p.status === 'GOING'
            ? { ...p, travelMode: 'MEETING_POINT' }
            : p,
      ),
    );
    renderWithProviders(
      <EventAttendanceSection
        clubId="club-1"
        teamId="team-1"
        eventId="event-1"
        meetingPlan={computedPlan}
      />,
    );

    // Two tiles — the count, and the hour each group is expected.
    expect(await screen.findByText('au RDV · 19:15')).toBeInTheDocument();
    expect(screen.getByText('en direct · 19:45')).toBeInTheDocument();
    expect(screen.getByText('Direct')).toBeInTheDocument();
    expect(screen.getByText('RDV')).toBeInTheDocument();
  });

  it('leaves travel out when the match has no meeting point', async () => {
    mockRoster(
      SQUAD.map((p) => (p.status === 'GOING' ? { ...p, travelMode: 'MEETING_POINT' } : p)),
    );
    renderSection();

    await screen.findByText(/sur 5 convoqué·es/);
    expect(screen.queryByText('RDV')).not.toBeInTheDocument();
    expect(screen.queryByText(/au RDV/)).not.toBeInTheDocument();
  });

  it('summarises the convoked group and previews who is coming first', async () => {
    mockRoster();
    renderSection();

    expect(
      await screen.findByText('2 oui · 1 peut-être · 1 non · 1 sans réponse — sur 5 convoqué·es'),
    ).toBeInTheDocument();
    // The meter says the same thing to a screen reader, so it is never a
    // colour-only signal.
    expect(
      screen.getByRole('img', { name: /présences : 2 oui, 1 peut-être, 1 non, 1 sans réponse/i }),
    ).toBeInTheDocument();
    // GOING first, then MAYBE, then NOT_GOING, then the silent ones.
    expect(screen.getByText('Camille Roussel')).toBeInTheDocument();
    expect(screen.getByText('Sarah Diallo')).toBeInTheDocument();
    // Not convoked: outside the group the counts describe, so outside the list.
    expect(screen.queryByText('Chloé Fontaine')).not.toBeInTheDocument();
  });

  it('discloses the rest of the group in place rather than linking to a tab that no longer exists', async () => {
    mockRoster();
    const user = userEvent.setup();
    renderSection();

    const more = await screen.findByRole('button', { name: 'Voir les 5 convoqué·es' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    // The 5th name is behind the disclosure (4 rows are previewed).
    expect(screen.queryByText(/Léa Moreau/)).not.toBeInTheDocument();

    await user.click(more);
    expect(screen.getByText(/Léa Moreau \(vous\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Masquer la liste' })).toBeInTheDocument();
  });

  it('describes the whole roster while no group has been named yet', async () => {
    mockRoster(SQUAD.map((p) => ({ ...p, convoked: false })));
    renderSection();

    expect(await screen.findByText(/sur 6 inscrit·es/)).toBeInTheDocument();
    expect(screen.getByText('Chloé Fontaine')).toBeInTheDocument();
  });

  it('renders an error with a retry, never an empty state, when the roster fails to load', async () => {
    server.use(
      http.get(RSVPS, () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
      http.get(CONVOCATIONS, () => HttpResponse.json([])),
    );
    renderSection();

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
    expect(screen.queryByText('Effectif vide')).not.toBeInTheDocument();
  });

  it('shows an empty state when the team has no roster at all', async () => {
    mockRoster([]);
    renderSection();

    expect(await screen.findByText('Effectif vide')).toBeInTheDocument();
  });
});
