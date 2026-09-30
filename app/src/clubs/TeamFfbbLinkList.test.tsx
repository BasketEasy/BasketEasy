import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamFfbbLinkList } from './TeamFfbbLinkList';

function renderList(canManage: boolean) {
  return renderWithProviders(
    <>
      <TeamFfbbLinkList clubId="club-1" teamId="team-1" canManage={canManage} />
      <Toaster />
    </>,
  );
}

describe('TeamFfbbLinkList', () => {
  it('shows nothing for a non-manager when there are no links', async () => {
    server.use(http.get('/api/clubs/club-1/teams/team-1/ffbb-links', () => HttpResponse.json([])));

    const { container } = renderList(false);

    await waitFor(() => expect(container).not.toHaveTextContent('Compétitions FFBB liées'));
  });

  it('shows an empty-state line and the add row for a manager', async () => {
    server.use(http.get('/api/clubs/club-1/teams/team-1/ffbb-links', () => HttpResponse.json([])));

    renderList(true);

    expect(await screen.findByText(/aucune compétition ffbb liée/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/lien ffbb de l'équipe/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /importer le calendrier ffbb/i }),
    ).not.toBeInTheDocument();
  });

  it('renders multiple links as chips, with a neutral fallback for a missing label', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/ffbb-links', () =>
        HttpResponse.json([
          { id: 'link-1', ffbbEngagementLabel: 'Seniors M D3' },
          { id: 'link-2', ffbbEngagementLabel: null },
        ]),
      ),
    );

    renderList(true);

    expect(await screen.findByText('Seniors M D3')).toBeInTheDocument();
    expect(screen.getByText('Compétition liée')).toBeInTheDocument();
    expect(screen.getByText('Compétitions FFBB liées (2)')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /importer le calendrier ffbb/i }),
    ).toBeInTheDocument();
  });

  it('adds a link and clears the input on success', async () => {
    let capturedBody: unknown;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/ffbb-links', () => HttpResponse.json([])),
      http.post('/api/clubs/club-1/teams/team-1/ffbb-links', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ id: 'link-1', ffbbEngagementLabel: 'Coupe' });
      }),
    );

    const user = userEvent.setup();
    renderList(true);

    const input = await screen.findByLabelText(/lien ffbb de l'équipe/i);
    await user.type(
      input,
      'https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/2',
    );
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    await waitFor(() =>
      expect(capturedBody).toEqual({
        ffbbTeamUrl:
          'https://competitions.ffbb.com/ligues/pdl/comites/0044/clubs/pdl0044190/equipes/2',
      }),
    );
    await waitFor(() => expect(screen.getByLabelText(/lien ffbb de l'équipe/i)).toHaveValue(''));
  });

  it('shows a field error, not a toast, when adding a link fails validation', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/ffbb-links', () => HttpResponse.json([])),
      http.post('/api/clubs/club-1/teams/team-1/ffbb-links', () =>
        HttpResponse.json(
          { message: 'Ce lien ne correspond pas au format attendu.', code: 'FFBB_LINK_INVALID' },
          { status: 400 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderList(true);

    const input = await screen.findByLabelText(/lien ffbb de l'équipe/i);
    await user.type(input, '200000005346381');
    await user.click(screen.getByRole('button', { name: /^ajouter$/i }));

    expect(await screen.findByText(/ne correspond pas au format attendu/i)).toBeInTheDocument();
  });

  it('removes a link via its chip button, with no confirmation step', async () => {
    let removeCalled = false;
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/ffbb-links', () =>
        HttpResponse.json([{ id: 'link-1', ffbbEngagementLabel: 'Seniors M D3' }]),
      ),
      http.delete('/api/clubs/club-1/teams/team-1/ffbb-links/link-1', () => {
        removeCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderList(true);

    await user.click(await screen.findByRole('button', { name: /retirer le lien vers/i }));

    await waitFor(() => expect(removeCalled).toBe(true));
  });

  it('shows the created/updated/unchanged counts on a successful import', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/ffbb-links', () =>
        HttpResponse.json([{ id: 'link-1', ffbbEngagementLabel: 'Championnat' }]),
      ),
      http.post('/api/clubs/club-1/teams/team-1/ffbb-import', () =>
        HttpResponse.json({
          created: 8,
          updated: 2,
          unchanged: 1,
          missingVenue: [],
          missingVenueTotal: 0,
        }),
      ),
    );

    const user = userEvent.setup();
    renderList(true);

    await user.click(await screen.findByRole('button', { name: /importer le calendrier ffbb/i }));

    expect(await screen.findByText('Calendrier importé')).toBeInTheDocument();
    expect(screen.getByText(/8 créés, 2 mis à jour, 1 inchangés/i)).toBeInTheDocument();
  });

  it('shows a positive no-op message when nothing changed', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/ffbb-links', () =>
        HttpResponse.json([{ id: 'link-1', ffbbEngagementLabel: 'Championnat' }]),
      ),
      http.post('/api/clubs/club-1/teams/team-1/ffbb-import', () =>
        HttpResponse.json({
          created: 0,
          updated: 0,
          unchanged: 8,
          missingVenue: [],
          missingVenueTotal: 0,
        }),
      ),
    );

    const user = userEvent.setup();
    renderList(true);

    await user.click(await screen.findByRole('button', { name: /importer le calendrier ffbb/i }));

    expect(await screen.findByText('Calendrier à jour')).toBeInTheDocument();
  });

  it('shows a destructive toast naming the failed competition, and nothing else was touched', async () => {
    server.use(
      http.get('/api/clubs/club-1/teams/team-1/ffbb-links', () =>
        HttpResponse.json([{ id: 'link-1', ffbbEngagementLabel: 'Coupe Loire-Atlantique' }]),
      ),
      http.post('/api/clubs/club-1/teams/team-1/ffbb-import', () =>
        HttpResponse.json(
          {
            message:
              "Impossible de récupérer les matchs pour « Coupe Loire-Atlantique ». Rien n'a été touché — réessayez plus tard.",
          },
          { status: 502 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderList(true);

    await user.click(await screen.findByRole('button', { name: /importer le calendrier ffbb/i }));

    expect(await screen.findByText("Échec de l'import")).toBeInTheDocument();
    expect(
      screen.getByText(/impossible de récupérer les matchs pour « coupe loire-atlantique/i),
    ).toBeInTheDocument();
  });

  describe('matches left without a venue', () => {
    function givenImport(result: object) {
      server.use(
        http.get('/api/clubs/club-1/teams/team-1/ffbb-links', () =>
          HttpResponse.json([{ id: 'link-1', ffbbEngagementLabel: 'Championnat' }]),
        ),
        http.post('/api/clubs/club-1/teams/team-1/ffbb-import', () =>
          HttpResponse.json({ created: 3, updated: 0, unchanged: 0, ...result }),
        ),
      );
    }

    async function importNow() {
      const user = userEvent.setup();
      renderList(true);
      await user.click(await screen.findByRole('button', { name: /importer le calendrier ffbb/i }));
      await screen.findByText('Calendrier importé');
    }

    it('lists each match without a venue, linking to its page', async () => {
      givenImport({
        missingVenue: [
          { eventId: 'event-1', opponentName: 'Rezé', startsAt: '2099-10-04T13:30:00Z' },
          { eventId: 'event-2', opponentName: null, startsAt: '2099-10-11T13:30:00Z' },
        ],
        missingVenueTotal: 2,
      });

      await importNow();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('2 matchs sans lieu');
      expect(alert).toHaveTextContent('Les joueurs ne savent pas encore où aller.');
      expect(screen.getByRole('link', { name: /vs Rezé/ })).toHaveAttribute(
        'href',
        '/clubs/club-1/teams/team-1/events/event-1',
      );
      expect(screen.getByRole('link', { name: /Match ·/ })).toHaveAttribute(
        'href',
        '/clubs/club-1/teams/team-1/events/event-2',
      );
      expect(alert).not.toHaveTextContent(/et \d+ autre/);
    });

    it('counts the matches past the listed ones', async () => {
      givenImport({
        missingVenue: Array.from({ length: 20 }, (_, i) => ({
          eventId: `event-${i}`,
          opponentName: `Club ${i}`,
          startsAt: '2099-10-04T13:30:00Z',
        })),
        missingVenueTotal: 23,
      });

      await importNow();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('23 matchs sans lieu');
      expect(screen.getAllByRole('link')).toHaveLength(20);
      expect(alert).toHaveTextContent('et 3 autres');
    });

    it('shows nothing when every match has a venue', async () => {
      givenImport({ missingVenue: [], missingVenueTotal: 0 });

      await importNow();

      expect(screen.queryByText(/sans lieu/)).not.toBeInTheDocument();
    });
  });
});
