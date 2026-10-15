import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from '@basketeasy/ui/toaster';
import type { GuestEvent, GuestTeamPage } from '@basketeasy/types/guest-links';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { computedPlan } from '../meeting-points/testEvents';
import { GuestRsvpPage } from './GuestRsvpPage';

const roster: GuestTeamPage['roster'] = [
  { teamPlayerId: 'tp-leo', firstName: 'Léo', lastInitial: 'M', role: 'PLAYER' },
  { teamPlayerId: 'tp-zoe', firstName: 'Zoé', lastInitial: 'B', role: 'PLAYER' },
  { teamPlayerId: 'tp-anne', firstName: 'Anne', lastInitial: 'D', role: 'COACH' },
];

const attendance = (overrides: Record<string, Partial<GuestEvent['attendance'][number]>> = {}) =>
  roster.map((member) => ({
    teamPlayerId: member.teamPlayerId,
    status: null,
    travelMode: null,
    convoked: false,
    viaLink: false,
    ...overrides[member.teamPlayerId],
  })) as GuestEvent['attendance'];

const training = (overrides: Partial<GuestEvent> = {}): GuestEvent => ({
  id: 'event-train',
  type: 'TRAINING',
  startsAt: new Date(2026, 9, 8, 18, 0).toISOString(),
  timeConfirmed: true,
  location: 'Gymnase A',
  locationName: null,
  opponentName: null,
  venue: null,
  notes: null,
  meetingPlan: null,
  attendance: attendance(),
  ...overrides,
});

const match = (overrides: Partial<GuestEvent> = {}): GuestEvent => ({
  id: 'event-match',
  type: 'MATCH',
  startsAt: new Date(2026, 9, 10, 20, 30).toISOString(),
  timeConfirmed: true,
  location: 'Salle des Sports, Rezé',
  locationName: null,
  opponentName: 'Rezé BC',
  venue: 'AWAY',
  notes: null,
  meetingPlan: computedPlan,
  attendance: attendance(),
  ...overrides,
});

const page = (events: GuestEvent[]): GuestTeamPage => ({
  teamName: 'U15 Masculins',
  clubName: 'BC Nantes',
  roster,
  events,
});

function serve(body: GuestTeamPage) {
  server.use(http.get('/api/public/guest/tok', () => HttpResponse.json(body)));
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}

function renderPage(route = '/r/tok') {
  return renderWithProviders(
    <>
      <LocationProbe />
      <Routes>
        <Route path="/r/:token" element={<GuestRsvpPage />} />
      </Routes>
      <Toaster />
    </>,
    { route },
  );
}

beforeEach(() => window.localStorage.clear());

describe('GuestRsvpPage', () => {
  it('shows the picker first: players before coaches, first name + initial only', async () => {
    serve(page([training()]));
    renderPage();

    expect(await screen.findByRole('heading', { name: 'U15 Masculins' })).toBeInTheDocument();
    expect(screen.getByText('BC Nantes')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual([
      'Léo M.',
      'Zoé B.',
      expect.stringContaining('Anne D.'),
    ]);
    expect(screen.queryByText('Gymnase A')).not.toBeInTheDocument();
  });

  it('shows the team as the page hero, and the identity card once a player is chosen', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(page([training()]));
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'U15 Masculins' })).toBeVisible();
    expect(screen.getByText('Répondez pour les 14 prochains jours')).toBeInTheDocument();
    expect(screen.getByText('Vous répondez pour')).toBeInTheDocument();
    expect(screen.getByText('Léo M.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ce n.est pas moi/ })).toBeInTheDocument();
  });

  it('remembers the choice on the device and « Ce n’est pas moi ? » forgets it', async () => {
    serve(page([training()]));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('radio', { name: /Léo M\./ }));

    expect(window.localStorage.getItem('kluvo.guest.tok')).toBe('tp-leo');
    expect(await screen.findByText('Gymnase A')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ce n.est pas moi/ }));

    expect(window.localStorage.getItem('kluvo.guest.tok')).toBeNull();
    expect(await screen.findByRole('radiogroup')).toBeInTheDocument();
  });

  it('opens straight on the agenda for a remembered player', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(page([training()]));
    renderPage();

    expect(await screen.findByText('Gymnase A')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: /Qui êtes-vous/ })).not.toBeInTheDocument();
  });

  it('names the gym when a manager gave one, and keeps the timeline’s directions', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(page([match({ locationName: 'Salle Coubertin' })]));
    renderPage();

    expect(await screen.findByText('Samedi 10 octobre · Salle Coubertin')).toBeInTheDocument();
    expect(screen.getByText('Arrivée · Salle Coubertin')).toBeInTheDocument();
    // No hero on the guest page: the arrival step keeps the gym's directions.
    expect(screen.getByRole('link', { name: 'Itinéraire vers la salle' })).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent('Salle des Sports, Rezé')),
    );
  });

  it('ignores a remembered player who is no longer on the roster', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-gone');
    serve(page([training()]));
    renderPage();

    expect(await screen.findByRole('radio', { name: /Léo M\./ })).toBeInTheDocument();
  });

  it('renders the dead-link state for a 404', async () => {
    server.use(
      http.get('/api/public/guest/tok', () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
    );
    renderPage();

    expect(await screen.findByText("Ce lien n'est plus actif")).toBeInTheDocument();
    expect(screen.getByText(/nouveau lien à votre coach/)).toBeInTheDocument();
  });

  it('says a failed load is a failure, not an empty page', async () => {
    server.use(http.get('/api/public/guest/tok', () => HttpResponse.json({}, { status: 500 })));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Chargement impossible');
    expect(screen.queryByText(/Aucun événement/)).not.toBeInTheDocument();
  });

  it('says so when nothing is coming up in the next 14 days', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(page([]));
    renderPage();

    expect(
      await screen.findByText('Aucun événement dans les 14 prochains jours'),
    ).toBeInTheDocument();
  });

  it('answers, and the pressed button and the nudge follow', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(page([training()]));
    let body: unknown;
    server.use(
      http.put('/api/public/guest/tok/events/event-train/rsvp', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          training({ attendance: attendance({ 'tp-leo': { status: 'GOING', viaLink: true } }) }),
        );
      }),
    );
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByText(/Allez plus loin/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Présent' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Présent' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(body).toEqual({ teamPlayerId: 'tp-leo', status: 'GOING' });
    expect(screen.getByText('Allez plus loin avec un compte Kluvo')).toBeInTheDocument();
  });

  it('sends via WHATSAPP after a ?src=wa visit, and strips the param from the URL', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(page([training()]));
    let body: unknown;
    server.use(
      http.put('/api/public/guest/tok/events/event-train/rsvp', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(training());
      }),
    );
    const user = userEvent.setup();
    renderPage('/r/tok?src=wa');

    await user.click(await screen.findByRole('button', { name: 'Présent' }));

    await waitFor(() =>
      expect(body).toEqual({ teamPlayerId: 'tp-leo', status: 'GOING', via: 'WHATSAPP' }),
    );
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/r\/tok$/);
  });

  it('sends no via for a plain visit', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(page([training()]));
    let body: Record<string, unknown> = {};
    server.use(
      http.put('/api/public/guest/tok/events/event-train/rsvp', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(training());
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Présent' }));

    await waitFor(() => expect(body.status).toBe('GOING'));
    expect(body).not.toHaveProperty('via');
  });

  it('clears the answer when the active one is touched again', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(page([training({ attendance: attendance({ 'tp-leo': { status: 'GOING' } }) })]));
    let url = '';
    server.use(
      http.delete('/api/public/guest/tok/events/event-train/rsvp', ({ request }) => {
        url = request.url;
        return HttpResponse.json(training());
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Présent' }));

    await waitFor(() => expect(url).toContain('teamPlayerId=tp-leo'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Présent' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  });

  it('offers the travel choice for a match only once the player is coming', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(
      page([
        match({
          attendance: attendance({ 'tp-leo': { status: 'GOING', travelMode: 'MEETING_POINT' } }),
        }),
        training({ id: 'event-train2', attendance: attendance({ 'tp-leo': { status: 'GOING' } }) }),
      ]),
    );
    let body: unknown;
    server.use(
      http.put('/api/public/guest/tok/events/event-match/rsvp', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(match());
      }),
    );
    const user = userEvent.setup();
    renderPage();

    // One travel question: the training never has one.
    expect(await screen.findAllByRole('radiogroup', { name: /Comment venez-vous/ })).toHaveLength(
      1,
    );
    await user.click(screen.getByRole('radio', { name: /Directement à la salle/ }));

    await waitFor(() =>
      expect(body).toEqual({
        teamPlayerId: 'tp-leo',
        status: 'GOING',
        travelMode: 'DIRECT',
      }),
    );
  });

  it('shows the call-up badge only on the chosen player’s own events', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(
      page([
        match({ attendance: attendance({ 'tp-leo': { convoked: true } }) }),
        training({ attendance: attendance({ 'tp-zoe': { convoked: true } }) }),
      ]),
    );
    renderPage();

    expect(await screen.findAllByText('Convoqué·e')).toHaveLength(1);
  });

  it('counts who is coming from what the page already holds', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(
      page([
        training({
          attendance: attendance({
            'tp-leo': { status: 'GOING' },
            'tp-zoe': { status: 'NOT_GOING' },
          }),
        }),
      ]),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Qui vient ?' }));

    expect(screen.getByText('1/3 présents')).toBeInTheDocument();
    const zoe = screen.getByText('Zoé B.').closest('div')?.parentElement as HTMLElement;
    expect(within(zoe).getByText('Absent')).toBeInTheDocument();
  });

  it('toasts a closed event and refetches so it drops off', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    let pages = 0;
    server.use(
      http.get('/api/public/guest/tok', () => {
        pages += 1;
        return HttpResponse.json(pages === 1 ? page([training()]) : page([]));
      }),
      http.put('/api/public/guest/tok/events/event-train/rsvp', () =>
        HttpResponse.json(
          { message: 'closed', code: 'GUEST_RSVP_CLOSED', statusCode: 409 },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Présent' }));

    expect(
      await screen.findByText('Les réponses sont closes pour cet événement.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Aucun événement dans les 14 prochains jours'),
    ).toBeInTheDocument();
  });

  it('confirms an invitation request the same way whatever the server did', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(page([training()]));
    server.use(
      http.put('/api/public/guest/tok/events/event-train/rsvp', () =>
        HttpResponse.json(training({ attendance: attendance({ 'tp-leo': { status: 'GOING' } }) })),
      ),
      // The server refuses: the visitor still reads the same confirmation.
      http.post('/api/public/guest/tok/invite-request', () =>
        HttpResponse.json({}, { status: 429 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Présent' }));
    await user.click(await screen.findByRole('button', { name: 'Demander mon invitation' }));

    expect(await screen.findByText('Demande envoyée à votre coach')).toBeInTheDocument();
  });

  it('can be dismissed, and links to login for someone who has an account', async () => {
    window.localStorage.setItem('kluvo.guest.tok', 'tp-leo');
    serve(page([training()]));
    server.use(
      http.put('/api/public/guest/tok/events/event-train/rsvp', () =>
        HttpResponse.json(training()),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Présent' }));
    expect(await screen.findByRole('link', { name: /J.ai déjà un compte/ })).toHaveAttribute(
      'href',
      '/login',
    );
    await user.click(screen.getByRole('button', { name: 'Plus tard' }));

    expect(screen.queryByText(/Allez plus loin/)).not.toBeInTheDocument();
  });

  it('keeps the page out of search indexes and the Referer while it is mounted', async () => {
    serve(page([training()]));
    const { unmount } = renderPage();

    await screen.findByRole('heading', { name: 'U15 Masculins' });
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer',
    );

    unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });
});
