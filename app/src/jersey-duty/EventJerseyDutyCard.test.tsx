import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { JerseyDutyDetail } from '@basketeasy/types/jersey-duty';
import { matchEvent } from '../meeting-points/testEvents';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventJerseyDutyCard } from './EventJerseyDutyCard';
import { dutyDetail, emma, ines } from './testDuty';

const DUTY_URL = '/api/clubs/club-1/teams/team-1/events/event-1/jersey-duty';
const event = matchEvent({ teamId: 'team-1', id: 'event-1' });

function mockDuty(detail: JerseyDutyDetail) {
  server.use(http.get(DUTY_URL, () => HttpResponse.json(detail)));
}

function renderCard(isMine = false) {
  return renderWithProviders(
    <EventJerseyDutyCard
      clubId="club-1"
      teamId="team-1"
      event={{
        ...event,
        jerseyDuty: { holder: null, status: 'UNASSIGNED', broughtBy: null, isMine },
      }}
    />,
  );
}

const suggestion = { kind: 'SUGGESTED', candidate: emma, isFewest: true } as const;

describe('EventJerseyDutyCard', () => {
  it('shows the suggested player the three actions, with the fewest-turns suffix', async () => {
    mockDuty(
      dutyDetail({
        suggestion,
        rights: { canAccept: true, canDecline: true, canSwap: true } as JerseyDutyDetail['rights'],
      }),
    );
    renderCard();
    expect(await screen.findByText('Lucas D.')).toBeInTheDocument();
    expect(screen.getByText('Lavage des maillots')).toBeInTheDocument();
    expect(screen.getByText('Après le match')).toBeInTheDocument();
    expect(screen.getByText('C’est votre tour')).toBeInTheDocument();
    expect(screen.getByText('1 lavage cette saison, le moins de l’équipe.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'C’est noté' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Je ne peux pas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Échanger' })).toBeInTheDocument();
    expect(screen.getByText(/La suggestion change si les présences changent/)).toBeInTheDocument();
  });

  it('omits the suffix when the suggested player is not strictly the fewest', async () => {
    mockDuty(
      dutyDetail({
        suggestion: { ...suggestion, isFewest: false },
        rights: { canAccept: true, canDecline: true, canSwap: true } as JerseyDutyDetail['rights'],
      }),
    );
    renderCard();
    expect(await screen.findByText('1 lavage cette saison.')).toBeInTheDocument();
  });

  it('accepts through the API', async () => {
    const accepted = dutyDetail({ status: 'ACCEPTED', holder: emma });
    let called = false;
    server.use(
      http.get(DUTY_URL, () =>
        HttpResponse.json(
          called
            ? accepted
            : dutyDetail({
                suggestion,
                rights: {
                  canAccept: true,
                  canDecline: true,
                  canSwap: true,
                } as JerseyDutyDetail['rights'],
              }),
        ),
      ),
      http.post(`${DUTY_URL}/accept`, () => {
        called = true;
        return HttpResponse.json(accepted);
      }),
    );
    renderCard();
    await userEvent.click(await screen.findByRole('button', { name: 'C’est noté' }));
    await waitFor(() => expect(called).toBe(true));
  });

  it('declines through the API', async () => {
    let called = false;
    server.use(
      http.get(DUTY_URL, () =>
        HttpResponse.json(
          dutyDetail({
            suggestion,
            rights: {
              canAccept: true,
              canDecline: true,
              canSwap: true,
            } as JerseyDutyDetail['rights'],
          }),
        ),
      ),
      http.post(`${DUTY_URL}/decline`, () => {
        called = true;
        return HttpResponse.json(dutyDetail());
      }),
    );
    renderCard();
    await userEvent.click(await screen.findByRole('button', { name: 'Je ne peux pas' }));
    await waitFor(() => expect(called).toBe(true));
  });

  it('shows an accepted holder « Vous » with the withdraw and swap actions', async () => {
    mockDuty(
      dutyDetail({
        status: 'ACCEPTED',
        holder: emma,
        acceptedBy: { firstName: 'Emma', lastInitial: 'M', isMe: true },
        rights: { canDecline: true, canSwap: true } as JerseyDutyDetail['rights'],
      }),
    );
    renderCard(true);
    expect(await screen.findByText('Vous')).toBeInTheDocument();
    expect(screen.getByText('Vous rapportez le sac propre au prochain match.')).toBeInTheDocument();
    expect(screen.getByText('Noté')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Je ne peux plus' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Échanger' })).toBeInTheDocument();
  });

  it('shows a pending swap to its proposer and cancels it', async () => {
    let cancelled = false;
    server.use(
      http.get(DUTY_URL, () =>
        HttpResponse.json(
          dutyDetail({
            status: 'ACCEPTED',
            holder: emma,
            pendingSwap: { to: ines, requestedAt: '2026-10-01T09:00:00.000Z' },
            rights: { canDecline: true, canCancelSwap: true } as JerseyDutyDetail['rights'],
          }),
        ),
      ),
      http.delete(`${DUTY_URL}/swap`, () => {
        cancelled = true;
        return HttpResponse.json(dutyDetail());
      }),
    );
    renderCard(true);
    expect(await screen.findByText('Échange proposé à Inès B.')).toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler la proposition' }));
    await waitFor(() => expect(cancelled).toBe(true));
  });

  it('shows a received swap and accepts or refuses it', async () => {
    let refused = false;
    server.use(
      http.get(DUTY_URL, () =>
        HttpResponse.json(
          dutyDetail({
            status: 'ASSIGNED',
            holder: { ...emma, firstName: 'Emma', lastName: 'Moreau' },
            pendingSwap: { to: ines, requestedAt: '2026-10-01T09:00:00.000Z' },
            rights: { canRespondToSwap: true } as JerseyDutyDetail['rights'],
          }),
        ),
      ),
      http.post(`${DUTY_URL}/swap/refuse`, () => {
        refused = true;
        return HttpResponse.json(dutyDetail());
      }),
    );
    renderCard();
    expect(await screen.findByText('Échange proposé')).toBeInTheDocument();
    expect(
      screen.getByText('Emma M. vous propose de laver les maillots à sa place.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accepter' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    await waitFor(() => expect(refused).toBe(true));
  });

  it('is read-only for someone else’s suggestion', async () => {
    mockDuty(dutyDetail({ suggestion }));
    renderCard();
    expect(await screen.findByText('Emma M.')).toBeInTheDocument();
    expect(screen.getByText('Suggestion, pas encore confirmée')).toBeInTheDocument();
    expect(screen.getByText('Suggérée')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says there is no suggestion when nobody is in the pool, with the real RSVP label', async () => {
    mockDuty(dutyDetail({ suggestion: { kind: 'EMPTY_POOL' } }));
    renderCard();
    expect(await screen.findByText('Aucune suggestion pour l’instant')).toBeInTheDocument();
    expect(
      screen.getByText('Elle apparaîtra dès qu’une joueuse convoquée aura répondu « Présent ».'),
    ).toBeInTheDocument();
  });

  it('says the suggestion waits for the previous match', async () => {
    mockDuty(
      dutyDetail({
        suggestion: { kind: 'AFTER_PREVIOUS', previousMatchStartsAt: '2026-10-04T12:00:00.000Z' },
      }),
    );
    renderCard();
    expect(await screen.findByText(/Suggestion après le match du 4 oct\./)).toBeInTheDocument();
    expect(screen.getByText('On attend de savoir qui lave après ce match-là.')).toBeInTheDocument();
  });

  it('speaks for a boy in guardian copy', async () => {
    mockDuty(
      dutyDetail({
        teamGender: 'MEN',
        suggestion: {
          kind: 'SUGGESTED',
          candidate: { ...emma, firstName: 'Léo', gender: 'MEN', turnsThisSeason: 0 },
          isFewest: false,
        },
        rights: { canAccept: true, canDecline: true, canSwap: true } as JerseyDutyDetail['rights'],
      }),
    );
    renderCard();
    // Outside a guardian persona the reader acts for themself.
    expect(await screen.findByText('C’est votre tour')).toBeInTheDocument();
  });

  it('gives a manager the assign field and the pool summary before kickoff', async () => {
    mockDuty(
      dutyDetail({
        suggestion,
        rights: { canManage: true } as JerseyDutyDetail['rights'],
      }),
    );
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json([]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/rsvps', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/teams/team-1/jersey-rotation', () =>
        HttpResponse.json({ rows: [] }),
      ),
    );
    renderCard();
    expect(await screen.findByText('Suggestion · 1 lavage cette saison')).toBeInTheDocument();
    expect(screen.getByText('Suggérée')).toBeInTheDocument();
    expect(screen.getByText('Assigner quelqu’un d’autre')).toBeInTheDocument();
    expect(
      screen.getByText('Parmi 8 joueuses convoquées et présentes, 1 exemptée.'),
    ).toBeInTheDocument();
  });

  it('warns a manager when nobody can be told', async () => {
    mockDuty(
      dutyDetail({
        suggestion: { kind: 'SUGGESTED', candidate: { ...emma, reachable: false }, isFewest: true },
        rights: { canManage: true } as JerseyDutyDetail['rights'],
      }),
    );
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json([]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/rsvps', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/teams/team-1/jersey-rotation', () =>
        HttpResponse.json({ rows: [] }),
      ),
    );
    renderCard();
    expect(await screen.findByText('Personne ne sera prévenu')).toBeInTheDocument();
  });

  it('locks the card for a manager after kickoff and marks the turn done', async () => {
    let done = false;
    server.use(
      http.get(DUTY_URL, () =>
        HttpResponse.json(
          dutyDetail({
            locked: true,
            status: 'ASSIGNED',
            holder: emma,
            rights: { canManage: true } as JerseyDutyDetail['rights'],
          }),
        ),
      ),
      http.post(`${DUTY_URL}/done`, () => {
        done = true;
        return HttpResponse.json(dutyDetail());
      }),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
        HttpResponse.json([]),
      ),
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/rsvps', () => HttpResponse.json([])),
      http.get('/api/clubs/club-1/teams/team-1/jersey-rotation', () =>
        HttpResponse.json({ rows: [] }),
      ),
    );
    renderCard();
    expect(await screen.findByText('Verrouillé depuis le coup d’envoi')).toBeInTheDocument();
    expect(screen.getByText('En cours')).toBeInTheDocument();
    expect(screen.getByText(/Ramène le sac au match du 11 oct\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Changer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler ce tour' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Marquer fait' }));
    await waitFor(() => expect(done).toBe(true));
  });

  it('hides « Maillots apportés par » when nobody brought them', async () => {
    mockDuty(dutyDetail({ broughtBy: null, suggestion: { kind: 'EMPTY_POOL' } }));
    renderCard();
    await screen.findByText('Aucune suggestion pour l’instant');
    expect(screen.queryByText(/Maillots apportés par/)).not.toBeInTheDocument();
  });

  it('shows the error branch instead of an empty state', async () => {
    server.use(http.get(DUTY_URL, () => HttpResponse.json({ message: 'x' }, { status: 500 })));
    renderCard();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Aucune suggestion pour l’instant')).not.toBeInTheDocument();
  });
});
