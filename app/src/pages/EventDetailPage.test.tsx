import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type {
  EventConvocationRosterEntry,
  EventRsvpRosterEntry,
  TeamEvent,
} from '@basketeasy/types/events';
import type { MyTeamSummary } from '@basketeasy/types/my-teams';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import App from '../App';
import { EVENT_SECTION_IDS } from '../clubs/useEventSectionAnchor';

function mockSession(memberships: { clubId: string; role: 'ADMIN' | 'MEMBER' }[]) {
  server.use(
    http.post('/api/auth/refresh', () => HttpResponse.json({ accessToken: 'restored-token' })),
    http.get('/api/auth/me', () =>
      HttpResponse.json({ id: 'user-1', email: 'a@b.com', emailVerified: true, memberships }),
    ),
  );
}

const baseTeam = {
  id: 'team-1',
  name: 'U15 Filles',
  category: 'U15',
  gender: 'WOMEN',
  createdAt: 'x',
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Relative to now, not a fixed date: several assertions below depend on this
// match not having been played yet (the vote window opens 1h after kickoff
// and closes 5 days later), so a hardcoded date silently turns into a past
// match and fails the suite on some later run — same reason MatchVoteTab's
// fixtures are relative.
const matchEvent: TeamEvent = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'MATCH',
  startsAt: new Date(Date.now() + 2 * DAY_MS).toISOString(),
  location: 'Gymnase Pierre de Coubertin',
  notes: null,
  opponentName: 'ES Rezé',
  venue: 'HOME',
  recurrenceId: null,
  createdAt: 'x',
  myRsvpStatus: null,
  isImported: false,
  timeConfirmed: true,
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
  logistics: { jerseys: null, balls: null },
  result: null,
  myMatchStats: null,
  meetingPlan: null,
  myTravelMode: null,
};

const trainingEvent: TeamEvent = {
  ...matchEvent,
  id: 'event-2',
  type: 'TRAINING',
  opponentName: null,
  venue: null,
};

const rsvpRoster: EventRsvpRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    playerId: 'player-1',
    firstName: 'Lea',
    lastName: 'Bernard',
    role: 'PLAYER',
    status: 'GOING',
    respondedAt: '2026-01-02T00:00:00.000Z',
    travelMode: null,
    isMe: false,
  },
  {
    teamPlayerId: 'tp-2',
    playerId: 'player-2',
    firstName: 'Nour',
    lastName: 'Amrani',
    role: 'PLAYER',
    status: null,
    respondedAt: null,
    travelMode: null,
    isMe: true,
  },
];

const convocationRoster: EventConvocationRosterEntry[] = [
  {
    teamPlayerId: 'tp-1',
    playerId: 'player-1',
    firstName: 'Lea',
    lastName: 'Bernard',
    role: 'PLAYER',
    convoked: true,
    convokedAt: '2026-01-01T00:00:00.000Z',
    isMe: false,
  },
  {
    teamPlayerId: 'tp-2',
    playerId: 'player-2',
    firstName: 'Nour',
    lastName: 'Amrani',
    role: 'PLAYER',
    convoked: true,
    convokedAt: '2026-01-01T00:00:00.000Z',
    isMe: true,
  },
];

const myTeams: MyTeamSummary[] = [];

const route = '/clubs/club-1/teams/team-1/events/event-1';
const trainingRoute = '/clubs/club-1/teams/team-1/events/event-2';

/**
 * Every request the page makes for a MATCH, in one place. Each test overrides
 * only the handler it is actually about — MSW runs with
 * `onUnhandledRequest: 'error'`, so a block silently dropped from a view
 * would surface here as an unmocked call rather than as a passing test.
 */
function mockEventPage({
  event = matchEvent,
  rostered = false,
  rsvps = rsvpRoster,
  convocations = convocationRoster,
}: {
  event?: typeof matchEvent;
  rostered?: boolean;
  rsvps?: EventRsvpRosterEntry[];
  convocations?: EventConvocationRosterEntry[];
} = {}) {
  server.use(
    http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
    http.get(`/api/clubs/club-1/teams/team-1/events/${event.id}`, () => HttpResponse.json(event)),
    http.get(`/api/clubs/club-1/teams/team-1/events/${event.id}/rsvps`, () =>
      HttpResponse.json(rsvps),
    ),
    http.get(`/api/clubs/club-1/teams/team-1/events/${event.id}/convocations`, () =>
      HttpResponse.json(convocations),
    ),
    http.get(`/api/clubs/club-1/teams/team-1/events/${event.id}/scoresheet`, () =>
      HttpResponse.json(null),
    ),
    http.get('/api/me/teams', () =>
      HttpResponse.json(
        rostered
          ? [
              {
                teamId: 'team-1',
                teamName: baseTeam.name,
                category: 'U15',
                gender: 'WOMEN',
                clubId: 'club-1',
                clubName: 'AS Test',
                isTeamAdmin: false,
                rosterRole: 'PLAYER',
              },
            ]
          : myTeams,
      ),
    ),
  );
}

const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
afterEach(() => scrollSpy.mockClear());

describe('EventDetailPage — player view', () => {
  it('puts the decision above the fold and renders no tabs at all', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockEventPage({ event: { ...matchEvent, myConvocation: true }, rostered: true });

    renderWithProviders(<App />, { route });

    expect(
      await screen.findByRole('heading', { level: 1, name: /u15 filles vs es rezé/i }),
    ).toBeInTheDocument();

    // The convocation is a sentence, not a bare badge.
    expect(await screen.findByText(/vous a retenu·e dans le groupe des 2/i)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Ma réponse' })).toBeInTheDocument();

    // No tab shell survives on the player's page.
    expect(screen.queryAllByRole('tab')).toHaveLength(0);

    // …and the decision comes before « S'y rendre » and « Qui vient ? » in
    // document order, which is the whole point of the reorder.
    const band = document.getElementById(EVENT_SECTION_IDS.decision);
    const presences = document.getElementById(EVENT_SECTION_IDS.presences);
    expect(band).not.toBeNull();
    expect(presences).not.toBeNull();
    expect(
      band!.compareDocumentPosition(presences!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('serves « comment j’y vais ? » with an itinerary link, and « qui vient ? » without a tab', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockEventPage({ rostered: true });

    renderWithProviders(<App />, { route });

    expect(await screen.findByRole('heading', { name: /s’y rendre/i })).toBeInTheDocument();
    const itinerary = await screen.findByRole('link', { name: /itinéraire/i });
    expect(itinerary).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=Gymnase%20Pierre%20de%20Coubertin',
    );

    expect(screen.getByRole('heading', { name: /qui vient/i })).toBeInTheDocument();
    expect(
      await screen.findByText(/1 oui · 0 peut-être · 0 non · 1 sans réponse/),
    ).toBeInTheDocument();
  });

  it('gives a player none of the management entry points', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockEventPage({ rostered: true });

    renderWithProviders(<App />, { route });

    await screen.findByRole('heading', { level: 1, name: /u15 filles vs es rezé/i });
    expect(screen.queryByRole('button', { name: /^modifier$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^supprimer$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /convocation|convoquer le groupe/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /relancer/i })).toBeNull();
  });

  it('drops the decision band for a viewer who is not on the roster', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockEventPage({ rostered: false });

    renderWithProviders(<App />, { route });

    await screen.findByRole('heading', { level: 1, name: /u15 filles vs es rezé/i });
    expect(screen.queryByRole('group', { name: 'Ma réponse' })).not.toBeInTheDocument();
    // …but « Qui vient ? » is still visible to the same audience as the event.
    expect(await screen.findByRole('heading', { name: /qui vient/i })).toBeInTheDocument();
  });

  it('shows the coach notes when there are any', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockEventPage({ event: { ...matchEvent, notes: 'Échauffement à 19h50.' }, rostered: true });

    renderWithProviders(<App />, { route });

    expect(await screen.findByRole('heading', { name: /notes du coach/i })).toBeInTheDocument();
    expect(screen.getByText('Échauffement à 19h50.')).toBeInTheDocument();
  });

  it('renders a TRAINING with no opponent, venue or scoresheet block', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockEventPage({ event: trainingEvent, rostered: true });

    renderWithProviders(<App />, { route: trainingRoute });

    expect(
      await screen.findByRole('heading', { level: 1, name: /u15 filles — entraînement/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Domicile')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /après la rencontre/i })).not.toBeInTheDocument();
  });
});

describe('EventDetailPage — manager view', () => {
  it('leads with the pilot band and keeps every management entry point reachable', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    mockEventPage();

    renderWithProviders(<App />, { route });

    await screen.findByRole('heading', { level: 1, name: /u15 filles vs es rezé/i });

    // Pilot band: the counts that used to sit behind the Effectif tab.
    expect(await screen.findByText('2 convoqué·es')).toBeInTheDocument();
    expect(screen.getByText('1 sans réponse')).toBeInTheDocument();
    expect(screen.getByText('1 oui · 0 peut-être · 0 non · 1 sans réponse')).toBeInTheDocument();

    // Every entry point the tabs used to hold, still one tap away.
    expect(screen.getByRole('button', { name: 'Modifier la convocation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /relancer les 1 sans réponse/i })).toBeDisabled();
    expect(screen.getByRole('heading', { name: /logistique/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /effectif de la rencontre/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /après la rencontre/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^modifier$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^supprimer$/i })).toBeInTheDocument();

    // The roster keeps both answers per line.
    const rosterSection = document.getElementById(EVENT_SECTION_IDS.presences)!;
    expect(within(rosterSection).getByText('Lea Bernard')).toBeInTheDocument();
    expect(within(rosterSection).getAllByText('Convoqué·e').length).toBeGreaterThan(0);

    // And no tabs.
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('opens the existing convocation dialog from the pilot band', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    mockEventPage();
    const user = userEvent.setup();

    renderWithProviders(<App />, { route });

    await user.click(await screen.findByRole('button', { name: 'Modifier la convocation' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gérer la convocation' })).toBeInTheDocument();
  });

  it('does not show a non-rostered manager an RSVP control of her own', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    mockEventPage({ rostered: false });

    renderWithProviders(<App />, { route });

    await screen.findByRole('heading', { level: 1, name: /u15 filles vs es rezé/i });
    expect(screen.queryByRole('group', { name: 'Ma réponse' })).not.toBeInTheDocument();
  });

  it('gives a rostered coach both hats: the pilot band and her own RSVP control', async () => {
    // §1.3: canManage and isRostered are independent axes, and this is the
    // first screen that says so.
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    mockEventPage({ rostered: true });

    renderWithProviders(<App />, { route });

    expect(await screen.findByText('2 convoqué·es')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modifier la convocation' })).toBeInTheDocument();
    expect(screen.getByText(/vous êtes aussi sur l’effectif/i)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Ma réponse' })).toBeInTheDocument();
  });

  it('keeps the vote block gated exactly as the Vote tab was', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    // Not convoked and not present: ineligible, and the window is still open.
    mockEventPage();
    const { unmount } = renderWithProviders(<App />, { route });

    await screen.findByRole('heading', { level: 1, name: /u15 filles vs es rezé/i });
    expect(screen.queryByRole('heading', { name: /vote du match/i })).not.toBeInTheDocument();
    unmount();

    mockEventPage({ event: { ...matchEvent, myConvocation: true, myRsvpStatus: 'GOING' } });
    renderWithProviders(<App />, { route });

    expect(await screen.findByRole('heading', { name: /vote du match/i })).toBeInTheDocument();
  });
});

describe('EventDetailPage — query branches', () => {
  it('shows an error state with retry when the event fails to load', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () => HttpResponse.json(baseTeam)),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );

    renderWithProviders(<App />, { route });

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
    // Never an empty state: a failed fetch must not tell anyone their event
    // does not exist.
    expect(screen.queryByText('Événement introuvable')).not.toBeInTheDocument();
  });

  it('shows an error state with retry when the team fails to load', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    server.use(
      http.get('/api/clubs/club-1/teams/team-1', () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1', () =>
        HttpResponse.json(matchEvent),
      ),
    );

    renderWithProviders(<App />, { route });

    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeInTheDocument();
    expect(screen.queryByText('Événement introuvable')).not.toBeInTheDocument();
  });
});

describe('EventDetailPage — ?tab= deep links', () => {
  it('scrolls an old ?tab=effectif link to « Qui vient ? » for a player', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockEventPage({ rostered: true });

    renderWithProviders(<App />, { route: `${route}?tab=effectif` });

    await screen.findByRole('heading', { name: /qui vient/i });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy.mock.instances[0]).toBe(document.getElementById(EVENT_SECTION_IDS.presences));
  });

  it('scrolls an old ?tab=scoresheet link to « Après la rencontre » for a manager', async () => {
    mockSession([{ clubId: 'club-1', role: 'ADMIN' }]);
    mockEventPage();

    renderWithProviders(<App />, { route: `${route}?tab=scoresheet` });

    await screen.findByRole('heading', { name: /après la rencontre/i });
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy.mock.instances[0]).toBe(
      document.getElementById(EVENT_SECTION_IDS.apresLaRencontre),
    );
  });

  it('stays put, rather than jumping somewhere arbitrary, when the block a ?tab= names is not rendered', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    // Ineligible viewer on an open match: there is no vote block to reach.
    mockEventPage({ rostered: true });

    renderWithProviders(<App />, { route: `${route}?tab=vote` });

    await screen.findByRole('heading', { name: /qui vient/i });
    expect(screen.queryByRole('heading', { name: /vote du match/i })).not.toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('ignores an unknown ?tab= value', async () => {
    mockSession([{ clubId: 'club-1', role: 'MEMBER' }]);
    mockEventPage({ rostered: true });

    renderWithProviders(<App />, { route: `${route}?tab=nope` });

    await screen.findByRole('heading', { level: 1, name: /u15 filles vs es rezé/i });
    expect(scrollSpy).not.toHaveBeenCalled();
  });
});
