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

const roster = [
  {
    id: 'tp-4',
    teamId: 'team-1',
    playerId: 'p-4',
    firstName: 'Karim',
    lastName: 'Belaïd',
    clubId: 'club-1',
    role: 'PLAYER' as const,
    createdAt: 'x',
  },
  {
    id: 'tp-7',
    teamId: 'team-1',
    playerId: 'p-7',
    firstName: 'Julie',
    lastName: 'Petit',
    clubId: 'club-1',
    role: 'PLAYER' as const,
    createdAt: 'x',
  },
];

// The extraction card fetches the roster to populate the mapping selects, so
// every test that renders it needs this handler even when it asserts nothing
// about the mapping.
function mockRoster(items = roster) {
  server.use(
    http.get('/api/clubs/club-1/teams/team-1/players', () =>
      HttpResponse.json({ items, total: items.length, page: 1, pageSize: 100 }),
    ),
  );
}

function mockExtraction(extraction: ScoresheetExtraction | null) {
  mockRoster();
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
      suggestedRosterMapping: [],
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
    expect(screen.getByDisplayValue('Karim Belaïd')).toBeInTheDocument();
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
      suggestedRosterMapping: [],
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
    // A manager can edit every field in place, so the box score is an input,
    // not static text.
    expect(screen.getAllByDisplayValue('64').length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('58').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Karim Belaïd')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirmer ces données/ })).toBeEnabled();
  });

  describe('roster mapping step', () => {
    const parsedWithOurSide: ParsedScoresheetData = {
      ...parsedData,
      scoringPlays: [
        { team: 'home', jerseyNumber: 4, points: 3, runningScore: 3 },
        { team: 'home', jerseyNumber: 4, points: 3, runningScore: 6 },
        { team: 'home', jerseyNumber: 7, points: 2, runningScore: 8 },
      ],
    };

    const renderCard = () =>
      renderWithProviders(
        <MatchScoresheetTab
          clubId="club-1"
          teamId="team-1"
          event={matchEvent}
          isRostered={true}
          canManage={true}
        />,
      );

    const withSuggestions = (suggestions: ScoresheetExtraction['suggestedRosterMapping']) => {
      mockStatus(statusFor('PARSED'));
      mockExtraction({
        status: 'PARSED',
        parsedData: parsedWithOurSide,
        confidence: 0.96,
        failureReason: null,
        reviewedByUserId: null,
        reviewedAt: null,
        suggestedRosterMapping: suggestions,
      });
    };

    it('seeds each select from the server suggestion and reports how many were recognised', async () => {
      withSuggestions([
        { jerseyNumber: 4, teamPlayerId: 'tp-4', sheetName: 'BELAID K.' },
        { jerseyNumber: 7, teamPlayerId: null, sheetName: null },
      ]);

      renderCard();

      expect(await screen.findByText('Qui est qui')).toBeInTheDocument();
      expect(screen.getByText('1 numéro sur 2')).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Joueur du numéro 4' })).toHaveTextContent(
        'Karim Belaïd',
      );
      expect(screen.getByRole('combobox', { name: 'Joueur du numéro 7' })).toHaveTextContent(
        'Non attribué',
      );
    });

    it('says what an unassigned number will cost rather than blocking the confirm', async () => {
      withSuggestions([{ jerseyNumber: 4, teamPlayerId: null, sheetName: null }]);

      renderCard();

      // Number 4 scored two threes on our side.
      expect(
        await screen.findByText('Ses 6 points ne seront comptés pour personne.'),
      ).toBeInTheDocument();
      expect(screen.getByText('nom illisible')).toBeInTheDocument();
      // A squad can field a licensed guest who isn't in the app, so the
      // confirm must stay available.
      expect(screen.getByRole('button', { name: /Confirmer ces données/ })).toBeEnabled();
    });

    it('sends only the assigned numbers when confirming', async () => {
      withSuggestions([
        { jerseyNumber: 4, teamPlayerId: 'tp-4', sheetName: 'BELAID K.' },
        { jerseyNumber: 7, teamPlayerId: null, sheetName: null },
      ]);
      let confirmBody: unknown;
      server.use(
        http.patch(
          '/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction/confirm',
          async ({ request }) => {
            confirmBody = await request.json();
            return HttpResponse.json({
              status: 'CONFIRMED',
              parsedData: parsedWithOurSide,
              confidence: 0.96,
              failureReason: null,
              reviewedByUserId: 'user-1',
              reviewedAt: '2026-01-02T10:00:00.000Z',
              suggestedRosterMapping: [],
            });
          },
        ),
      );
      const user = userEvent.setup();

      renderCard();

      await user.click(await screen.findByRole('button', { name: /Confirmer ces données/ }));

      await waitFor(() =>
        expect(confirmBody).toEqual({
          rosterMapping: [{ jerseyNumber: 4, teamPlayerId: 'tp-4' }],
        }),
      );
    });

    it('lets a manager correct a suggestion, and sends the correction', async () => {
      withSuggestions([{ jerseyNumber: 4, teamPlayerId: 'tp-4', sheetName: 'BELAID K.' }]);
      let confirmBody: unknown;
      server.use(
        http.patch(
          '/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction/confirm',
          async ({ request }) => {
            confirmBody = await request.json();
            return HttpResponse.json({
              status: 'CONFIRMED',
              parsedData: parsedWithOurSide,
              confidence: 0.96,
              failureReason: null,
              reviewedByUserId: 'user-1',
              reviewedAt: '2026-01-02T10:00:00.000Z',
              suggestedRosterMapping: [],
            });
          },
        ),
      );
      const user = userEvent.setup();

      renderCard();

      expect(await screen.findByText('Suggestion retenue')).toBeInTheDocument();
      await user.click(screen.getByRole('combobox', { name: 'Joueur du numéro 4' }));
      await user.click(await screen.findByRole('option', { name: 'Julie Petit' }));

      expect(screen.getByText('Corrigé')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Confirmer ces données/ }));

      await waitFor(() =>
        expect(confirmBody).toEqual({
          rosterMapping: [{ jerseyNumber: 4, teamPlayerId: 'tp-7' }],
        }),
      );
    });

    it('does not offer a roster member already taken by another number', async () => {
      withSuggestions([
        { jerseyNumber: 4, teamPlayerId: 'tp-4', sheetName: 'BELAID K.' },
        { jerseyNumber: 7, teamPlayerId: null, sheetName: null },
      ]);
      const user = userEvent.setup();

      renderCard();

      await user.click(await screen.findByRole('combobox', { name: 'Joueur du numéro 7' }));

      // The server rejects the same player on two numbers; the field
      // shouldn't offer the collision in the first place.
      expect(await screen.findByRole('option', { name: 'Karim Belaïd' })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(screen.getByRole('option', { name: 'Julie Petit' })).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
    });

    it('hides the mapping step once the sheet is confirmed', async () => {
      mockStatus(statusFor('CONFIRMED'));
      mockExtraction({
        status: 'CONFIRMED',
        parsedData: parsedWithOurSide,
        confidence: 0.96,
        failureReason: null,
        reviewedByUserId: 'user-1',
        reviewedAt: '2026-01-02T10:00:00.000Z',
        suggestedRosterMapping: [{ jerseyNumber: 4, teamPlayerId: 'tp-4', sheetName: 'BELAID K.' }],
      });

      renderCard();

      expect(await screen.findByText('Feuille de match confirmée')).toBeInTheDocument();
      expect(screen.queryByText('Qui est qui')).not.toBeInTheDocument();
    });
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
      suggestedRosterMapping: [],
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
      suggestedRosterMapping: [],
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
      suggestedRosterMapping: [],
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

  // The archived file is still in the bucket, so recovering from a provider
  // outage re-runs the job rather than asking for the photo again.
  it('re-runs the analysis on the archived file without a re-upload', async () => {
    const user = userEvent.setup();
    mockStatus(statusFor('FAILED'));
    mockExtraction({
      status: 'FAILED',
      parsedData: null,
      confidence: null,
      failureReason: "Le service d'analyse était momentanément saturé.",
      reviewedByUserId: null,
      reviewedAt: null,
      suggestedRosterMapping: [],
    });
    let retried = false;
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet-extraction/retry', () => {
        retried = true;
        return HttpResponse.json(statusFor('QUEUED'));
      }),
    );

    renderWithProviders(
      <MatchScoresheetTab
        clubId="club-1"
        teamId="team-1"
        event={matchEvent}
        isRostered={true}
        canManage={true}
      />,
    );

    await user.click(await screen.findByRole('button', { name: /Relancer l'analyse/ }));

    await waitFor(() => expect(retried).toBe(true));
    expect(await screen.findByText("En file d'attente pour analyse")).toBeInTheDocument();
  });
});
