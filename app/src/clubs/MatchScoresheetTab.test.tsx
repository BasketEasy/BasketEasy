import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { EventScoresheet, TeamEvent } from '@basketeasy/types/events';
import type {
  ParsedScoresheetData,
  ScoresheetExtraction,
} from '@basketeasy/types/scoresheet-extraction';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { MatchScoresheetTab } from './MatchScoresheetTab';

const matchEvent: TeamEvent = {
  id: 'event-1',
  teamId: 'team-1',
  type: 'MATCH',
  startsAt: '2026-01-01T18:00:00.000Z',
  location: 'Gymnase Pierre de Coubertin',
  notes: null,
  opponentName: 'ES Rezé',
  venue: 'HOME',
  recurrenceId: null,
  createdAt: 'x',
  myRsvpStatus: 'GOING',
  isImported: false,
  timeConfirmed: true,
  myConvocation: true,
  logistics: { jerseys: null, balls: null },
};

const uploadedStatus: EventScoresheet = {
  status: 'UPLOADED',
  uploadedByTeamPlayerId: 'tp-1',
  uploadedAt: '2026-01-01T20:00:00.000Z',
};

function statusFor(status: EventScoresheet['status']): EventScoresheet {
  return { status, uploadedByTeamPlayerId: 'tp-1', uploadedAt: '2026-01-01T20:00:00.000Z' };
}

const parsedData: ParsedScoresheetData = {
  homeScore: 64,
  awayScore: 58,
  quarterScores: [
    { home: 14, away: 12 },
    { home: 16, away: 15 },
    { home: 18, away: 14 },
    { home: 16, away: 17 },
  ],
  players: [
    { team: 'home', number: 4, name: 'Karim Belaïd', points: 18, fouls: 2 },
    { team: 'home', number: 7, name: 'Julie Petit', points: 14, fouls: 3 },
  ],
  // Points are derived from the running-score column, so a fixture whose
  // player totals must add up needs the plays that produced them.
  scoringPlays: [
    { team: 'home', jerseyNumber: 4, points: 2, runningScore: 2 },
    { team: 'home', jerseyNumber: 7, points: 3, runningScore: 5 },
  ],
};

function mockStatus(status: EventScoresheet | null) {
  server.use(
    http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () =>
      HttpResponse.json(status),
    ),
  );
}

function mockExtraction(extraction: ScoresheetExtraction | null) {
  server.use(
    http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction', () =>
      HttpResponse.json(extraction),
    ),
  );
}

const imageFile = new File(['fake-jpeg-bytes'], 'feuille.jpg', { type: 'image/jpeg' });
const pdfFile = new File(['fake-pdf-bytes'], 'feuille.pdf', { type: 'application/pdf' });

afterEach(() => {
  vi.useRealTimers();
});

describe('MatchScoresheetTab', () => {
  it('shows a read-only empty state for a non-rostered viewer when nothing is uploaded', async () => {
    mockStatus(null);

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={false}
        canManage={false}
      />,
    );

    expect(await screen.findByText('Aucune feuille de match pour le moment')).toBeInTheDocument();
    expect(screen.queryByText('Choisir un fichier')).not.toBeInTheDocument();
  });

  it('shows a single file-upload control for a rostered viewer when nothing is uploaded', async () => {
    mockStatus(null);

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={false}
      />,
    );

    expect(await screen.findByText('Ajoutez la feuille de marque')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choisir un fichier' })).toBeInTheDocument();
  });

  it('shows the queued state directly on mount when already uploaded — skips capture', async () => {
    mockStatus(uploadedStatus);

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={false}
      />,
    );

    expect(await screen.findByText('Fichier envoyé')).toBeInTheDocument();
    expect(screen.getByText("En file d'attente pour analyse")).toBeInTheDocument();
    expect(screen.queryByText('Choisir un fichier')).not.toBeInTheDocument();
  });

  it('does not offer "Remplacer le fichier" to a non-rostered viewer once uploaded', async () => {
    mockStatus(uploadedStatus);

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={false}
        canManage={false}
      />,
    );

    expect(await screen.findByText('Fichier envoyé')).toBeInTheDocument();
    expect(screen.queryByText('Remplacer le fichier')).not.toBeInTheDocument();
  });

  it('runs the happy path: select a photo, preview it, send it, and land on the queued state', async () => {
    mockStatus(null);
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet/upload-url', () =>
        HttpResponse.json({
          uploadUrl: 'https://r2.example/upload-target',
          storageKey: 'scoresheets/event-1/abc.jpg',
        }),
      ),
      http.put('https://r2.example/upload-target', () => new HttpResponse(null, { status: 200 })),
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () =>
        HttpResponse.json(uploadedStatus),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={false}
      />,
    );

    const fileInput = await screen.findByLabelText('Choisir un fichier de la feuille de match');
    await user.upload(fileInput, imageFile);

    expect(await screen.findByAltText('Aperçu de la feuille de match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Fichier envoyé')).toBeInTheDocument();
  });

  it('lands on the queued state when the confirm returns QUEUED, not just UPLOADED', async () => {
    // The confirm endpoint hands back QUEUED (it enqueues the OCR job before
    // responding), so a frame that only knew UPLOADED fell through to the
    // capture card and looked like the send had done nothing.
    mockStatus(null);
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet/upload-url', () =>
        HttpResponse.json({
          uploadUrl: 'https://r2.example/upload-target',
          storageKey: 'scoresheets/event-1/abc.jpg',
        }),
      ),
      http.put('https://r2.example/upload-target', () => new HttpResponse(null, { status: 200 })),
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () =>
        HttpResponse.json(statusFor('QUEUED')),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={false}
      />,
    );

    const fileInput = await screen.findByLabelText('Choisir un fichier de la feuille de match');
    await user.upload(fileInput, imageFile);
    await user.click(await screen.findByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Fichier envoyé')).toBeInTheDocument();
    expect(screen.queryByText('Ajoutez la feuille de marque')).not.toBeInTheDocument();
  });

  it('advances from the queued card to the extraction result without a reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let statusCalls = 0;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () => {
        statusCalls += 1;
        return HttpResponse.json(statusFor(statusCalls === 1 ? 'PROCESSING' : 'PARSED'));
      }),
    );
    mockExtraction({
      status: 'PARSED',
      parsedData,
      confidence: 0.96,
      failureReason: null,
      reviewedByUserId: null,
      reviewedAt: null,
    });

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={true}
      />,
    );

    expect(await screen.findByText('Analyse en cours')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(5000));

    await waitFor(() => expect(screen.getByText('96% de confiance')).toBeInTheDocument());
    expect(screen.getByText('Karim Belaïd')).toBeInTheDocument();
  });

  it('shows a document placeholder instead of an image preview for a PDF selection', async () => {
    mockStatus(null);
    const user = userEvent.setup();

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={false}
      />,
    );

    const fileInput = await screen.findByLabelText('Choisir un fichier de la feuille de match');
    await user.upload(fileInput, pdfFile);

    expect(screen.queryByAltText('Aperçu de la feuille de match')).not.toBeInTheDocument();
    expect(await screen.findByText('feuille.pdf')).toBeInTheDocument();
  });

  it('shows a persistent (not toast) failure card when the send fails, and retry re-runs it', async () => {
    mockStatus(null);
    let attempts = 0;
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet/upload-url', () =>
        HttpResponse.json({
          uploadUrl: 'https://r2.example/upload-target',
          storageKey: 'scoresheets/event-1/abc.jpg',
        }),
      ),
      http.put('https://r2.example/upload-target', () => {
        attempts += 1;
        return new HttpResponse(null, { status: attempts === 1 ? 500 : 200 });
      }),
      http.patch('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () =>
        HttpResponse.json(uploadedStatus),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={false}
      />,
    );

    const fileInput = await screen.findByLabelText('Choisir un fichier de la feuille de match');
    await user.upload(fileInput, imageFile);
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText("Échec de l'envoi")).toBeInTheDocument();
    // The failed selection stays visible (not a toast) until retried.
    expect(screen.getByAltText('Aperçu de la feuille de match')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));

    await waitFor(() => expect(attempts).toBe(2));
    expect(await screen.findByText('Fichier envoyé')).toBeInTheDocument();
  });

  it('shows a QueryError with retry when the status fetch itself fails', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={false}
      />,
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('renders the box score, quarter table, and player table for a PARSED extraction', async () => {
    mockStatus(statusFor('PARSED'));
    mockExtraction({
      status: 'PARSED',
      parsedData,
      confidence: 0.96,
      failureReason: null,
      reviewedByUserId: null,
      reviewedAt: null,
    });

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={true}
      />,
    );

    expect(await screen.findByText('96% de confiance')).toBeInTheDocument();
    // Rendered twice (a mobile-stacked copy and a desktop side-by-side copy,
    // toggled with CSS breakpoints rather than JS) — both exist in the DOM.
    expect(screen.getAllByText('64').length).toBeGreaterThan(0);
    expect(screen.getAllByText('58').length).toBeGreaterThan(0);
    expect(screen.getByText('Karim Belaïd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmer ces données/ })).toBeEnabled();
  });

  it('flags a quarter-score mismatch and disables confirm until it is fixed', async () => {
    mockStatus(statusFor('NEEDS_REVIEW'));
    mockExtraction({
      status: 'NEEDS_REVIEW',
      parsedData: {
        ...parsedData,
        quarterScores: [
          { home: 14, away: 12 },
          { home: 16, away: 15 },
          { home: 15, away: 14 }, // sums to 61, not 64
          { home: 16, away: 17 },
        ],
      },
      confidence: 0.62,
      failureReason: null,
      reviewedByUserId: null,
      reviewedAt: null,
    });
    server.use(
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction/confirm',
        async ({ request }) => HttpResponse.json({ ...((await request.json()) as object) }),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={true}
      />,
    );

    const confirmButton = await screen.findByRole('button', { name: /Confirmer ces données/ });
    expect(confirmButton).toHaveAttribute('aria-disabled', 'true');

    // Each flagged cell gets a distinct accessible name, not a generic one
    // shared by every correction input on the page.
    expect(screen.getByRole('spinbutton', { name: 'Q3, Mon équipe' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Score par quart-temps' })).toBeInTheDocument();

    const flaggedInput = screen.getByRole('spinbutton', { name: 'Q3, Mon équipe' });
    await user.clear(flaggedInput);
    await user.type(flaggedInput, '18');

    expect(confirmButton).not.toHaveAttribute('aria-disabled');
  });

  it('hides edit affordances and shows the confirmed footer for a CONFIRMED extraction', async () => {
    mockStatus(statusFor('CONFIRMED'));
    mockExtraction({
      status: 'CONFIRMED',
      parsedData,
      confidence: 0.96,
      failureReason: null,
      reviewedByUserId: 'user-1',
      reviewedAt: '2026-01-01T21:14:00.000Z',
    });

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={true}
      />,
    );

    expect(await screen.findByText('Feuille de match confirmée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirmer ces données/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('shows the failure reason and a retry action for a FAILED extraction', async () => {
    mockStatus(statusFor('FAILED'));
    mockExtraction({
      status: 'FAILED',
      parsedData: null,
      confidence: null,
      failureReason: 'Le document est illisible par l’IA.',
      reviewedByUserId: null,
      reviewedAt: null,
    });

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={true}
      />,
    );

    expect(await screen.findByText("L'analyse a échoué")).toBeInTheDocument();
    expect(await screen.findByText('Le document est illisible par l’IA.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Relancer l'analyse/ })).toBeInTheDocument();
  });
});
