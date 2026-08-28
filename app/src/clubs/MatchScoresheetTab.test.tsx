import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { EventScoresheet, TeamEvent } from '@basketeasy/types/events';
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

function mockStatus(status: EventScoresheet | null) {
  server.use(
    http.get('/api/clubs/club-1/teams/team-1/events/event-1/scoresheet', () =>
      HttpResponse.json(status),
    ),
  );
}

const imageFile = new File(['fake-jpeg-bytes'], 'feuille.jpg', { type: 'image/jpeg' });
const pdfFile = new File(['fake-pdf-bytes'], 'feuille.pdf', { type: 'application/pdf' });

describe('MatchScoresheetTab', () => {
  it('shows a read-only empty state for a non-rostered viewer when nothing is uploaded', async () => {
    mockStatus(null);

    renderWithProviders(
      <MatchScoresheetTab clubId="club-1" teamId="team-1" event={matchEvent} isRostered={false} />,
    );

    expect(await screen.findByText('Aucune feuille de match pour le moment')).toBeInTheDocument();
    expect(screen.queryByText('Choisir un fichier')).not.toBeInTheDocument();
  });

  it('shows a single file-upload control for a rostered viewer when nothing is uploaded', async () => {
    mockStatus(null);

    renderWithProviders(
      <MatchScoresheetTab clubId="club-1" teamId="team-1" event={matchEvent} isRostered={true} />,
    );

    expect(await screen.findByText('Ajoutez la feuille de marque')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choisir un fichier' })).toBeInTheDocument();
  });

  it('shows the queued state directly on mount when already uploaded — skips capture', async () => {
    mockStatus(uploadedStatus);

    renderWithProviders(
      <MatchScoresheetTab clubId="club-1" teamId="team-1" event={matchEvent} isRostered={true} />,
    );

    expect(await screen.findByText('Fichier envoyé')).toBeInTheDocument();
    expect(screen.getByText("En file d'attente pour analyse")).toBeInTheDocument();
    expect(screen.queryByText('Choisir un fichier')).not.toBeInTheDocument();
  });

  it('does not offer "Remplacer le fichier" to a non-rostered viewer once uploaded', async () => {
    mockStatus(uploadedStatus);

    renderWithProviders(
      <MatchScoresheetTab clubId="club-1" teamId="team-1" event={matchEvent} isRostered={false} />,
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
      <MatchScoresheetTab clubId="club-1" teamId="team-1" event={matchEvent} isRostered={true} />,
    );

    const fileInput = await screen.findByLabelText('Choisir un fichier de la feuille de match');
    await user.upload(fileInput, imageFile);

    expect(await screen.findByAltText('Aperçu de la feuille de match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByText('Fichier envoyé')).toBeInTheDocument();
  });

  it('shows a document placeholder instead of an image preview for a PDF selection', async () => {
    mockStatus(null);
    const user = userEvent.setup();

    renderWithProviders(
      <MatchScoresheetTab clubId="club-1" teamId="team-1" event={matchEvent} isRostered={true} />,
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
      <MatchScoresheetTab clubId="club-1" teamId="team-1" event={matchEvent} isRostered={true} />,
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
      <MatchScoresheetTab clubId="club-1" teamId="team-1" event={matchEvent} isRostered={true} />,
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
