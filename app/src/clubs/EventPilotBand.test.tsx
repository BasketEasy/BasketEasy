import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type {
  EventConvocationRosterEntry,
  EventRsvpRosterEntry,
  TeamEvent,
} from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventPilotBand } from './EventPilotBand';

const RSVPS = '/api/clubs/club-1/teams/team-1/events/event-1/rsvps';
const CONVOCATIONS = '/api/clubs/club-1/teams/team-1/events/event-1/convocations';

const DAY_MS = 24 * 60 * 60 * 1000;

function baseEvent(overrides: Partial<TeamEvent> = {}): TeamEvent {
  return {
    id: 'event-1',
    teamId: 'team-1',
    type: 'MATCH',
    startsAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
    location: 'Gymnase du Vigneau',
    notes: null,
    opponentName: 'ESB Rezé',
    venue: 'HOME',
    recurrenceId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    myRsvpStatus: null,
    myRsvpRespondedBy: null,
    myRsvpRespondedAt: null,
    myConvocation: false,
    rsvpSummary: {
      rosterSize: 0,
      convoked: 0,
      answering: 0,
      going: 0,
      maybe: 0,
      notGoing: 0,
      pending: 0,
      isConvocationScoped: false,
    },
    isImported: false,
    timeConfirmed: true,
    logistics: { jerseys: null, balls: null },
    result: null,
    myMatchStats: null,
    meetingPlan: null,
    whatsAppShare: null,
    whatsAppSettings: null,
    myTravelMode: null,
    ...overrides,
  };
}

type Person = {
  id: string;
  status: EventRsvpRosterEntry['status'];
  convoked: boolean;
};

function mockRoster(people: Person[]) {
  const rsvps: EventRsvpRosterEntry[] = people.map((p, i) => ({
    teamPlayerId: p.id,
    playerId: `player-${p.id}`,
    firstName: 'Joueuse',
    lastName: `N${i}`,
    role: 'PLAYER',
    status: p.status,
    respondedAt: p.status ? '2026-01-02T00:00:00.000Z' : null,
    respondedBy: null,
    respondedByGuardian: false,
    viaLink: false,
    travelMode: null,
    isMe: false,
  }));
  const convocations: EventConvocationRosterEntry[] = people.map((p, i) => ({
    teamPlayerId: p.id,
    playerId: `player-${p.id}`,
    firstName: 'Joueuse',
    lastName: `N${i}`,
    role: 'PLAYER',
    convoked: p.convoked,
    convokedAt: p.convoked ? '2026-01-01T00:00:00.000Z' : null,
    isMe: false,
  }));
  server.use(
    http.get(RSVPS, () => HttpResponse.json(rsvps)),
    http.get(CONVOCATIONS, () => HttpResponse.json(convocations)),
  );
}

function renderBand(event: TeamEvent = baseEvent()) {
  return renderWithProviders(<EventPilotBand clubId="club-1" teamId="team-1" event={event} />);
}

const GROUP: Person[] = [
  { id: 'tp-1', status: 'GOING', convoked: true },
  { id: 'tp-2', status: 'GOING', convoked: true },
  { id: 'tp-3', status: 'MAYBE', convoked: true },
  { id: 'tp-4', status: null, convoked: true },
  { id: 'tp-5', status: null, convoked: true },
  { id: 'tp-6', status: 'GOING', convoked: false },
];

describe('EventPilotBand', () => {
  it('answers "ai-je un groupe ?" above the fold: the count, the silence and the meter', async () => {
    mockRoster(GROUP);
    renderBand();

    expect(await screen.findByText('5 convoqué·es')).toBeInTheDocument();
    expect(screen.getByText('2 sans réponse')).toBeInTheDocument();
    expect(screen.getByText('2 oui · 1 peut-être · 0 non · 2 sans réponse')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /présences : 2 oui, 1 peut-être, 2 sans réponse/i }),
    ).toBeInTheDocument();
    // Counted in whole calendar days, from the event's own date.
    expect(screen.getByText('J-3')).toBeInTheDocument();
  });

  it('opens the existing convocation dialog from « Modifier la convocation »', async () => {
    mockRoster(GROUP);
    const user = userEvent.setup();
    renderBand();

    await user.click(await screen.findByRole('button', { name: 'Modifier la convocation' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gérer la convocation' })).toBeInTheDocument();
  });

  it('asks for a group rather than a modification while nobody has been called up', async () => {
    mockRoster(GROUP.map((p) => ({ ...p, convoked: false })));
    renderBand();

    expect(await screen.findByRole('button', { name: 'Convoquer le groupe' })).toBeInTheDocument();
  });

  it('names the reminder that does not exist yet, disabled and explained', async () => {
    mockRoster(GROUP);
    renderBand();

    const relance = await screen.findByRole('button', { name: /relancer les 2 sans réponse/i });
    expect(relance).toBeDisabled();
    expect(relance).toHaveAccessibleDescription(/relances automatiques arrivent/i);
  });

  it('drops the reminder once everyone has answered', async () => {
    mockRoster([
      { id: 'tp-1', status: 'GOING', convoked: true },
      { id: 'tp-2', status: 'NOT_GOING', convoked: true },
    ]);
    renderBand();

    expect(await screen.findByText('2 convoqué·es')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /relancer/i })).not.toBeInTheDocument();
  });

  it('keeps the convocation action reachable when the breakdown fails to load', async () => {
    server.use(
      http.get(RSVPS, () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
      http.get(CONVOCATIONS, () => HttpResponse.json([])),
    );
    renderBand();

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
    expect(screen.queryByText('Effectif vide')).not.toBeInTheDocument();
    // A failed breakdown must not take down the one control that fixes the group.
    expect(screen.getByRole('button', { name: /convoquer le groupe/i })).toBeInTheDocument();
  });

  it('shows an empty state, not a zeroed meter, when the team has no roster', async () => {
    mockRoster([]);
    renderBand();

    expect(await screen.findByText('Effectif vide')).toBeInTheDocument();
    expect(screen.queryByText(/convoqué·es$/)).not.toBeInTheDocument();
  });
});
