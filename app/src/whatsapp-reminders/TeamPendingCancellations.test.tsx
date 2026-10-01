import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import type { TeamPendingCancellation } from '@basketeasy/types/whatsapp-reminder';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamPendingCancellations } from './TeamPendingCancellations';

const LIST = '/api/clubs/club-1/teams/team-1/whatsapp-shares/pending-cancellations';

const status = (state: 'PENDING' | 'SENT') => ({
  type: 'CANCELLATION' as const,
  state,
  dueAt: null,
  sentAt: null,
  sentBy: null,
  platform: null,
});

const cancellation = (
  shareId: string,
  over: Partial<TeamPendingCancellation> = {},
): TeamPendingCancellation => ({
  shareId,
  eventName: 'Match contre ES Vertou',
  eventDate: 'sam. 4 oct.',
  message: "❌ Match contre ES Vertou du sam. 4 oct. : c'est annulé.",
  status: status('PENDING'),
  ...over,
});

function serve(items: TeamPendingCancellation[]) {
  server.use(http.get(LIST, () => HttpResponse.json(items)));
}

function renderCards(route = '/') {
  return renderWithProviders(
    <>
      <TeamPendingCancellations clubId="club-1" teamId="team-1" />
      <Toaster />
    </>,
    { route },
  );
}

afterEach(() => vi.restoreAllMocks());

describe('TeamPendingCancellations', () => {
  it('renders nothing while loading and nothing for the normal empty case', async () => {
    serve([]);
    const { container } = renderCards();
    expect(container.querySelector('section')).toBeNull();
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says a failed load is a failure, not an empty list', async () => {
    server.use(http.get(LIST, () => HttpResponse.json({}, { status: 500 })));
    renderCards();
    expect(await screen.findByRole('alert')).toHaveTextContent('Annulations indisponibles');
  });

  it('offers each cancellation with its message and the share flow', async () => {
    serve([
      cancellation('c1'),
      cancellation('c2', { eventName: 'Entraînement', eventDate: 'mer. 1 oct.' }),
    ]);
    renderCards();

    expect(
      await screen.findByRole('heading', { name: 'Annulations à partager' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Partager sur WhatsApp' })).toHaveLength(2);
    expect(screen.getByText('Match contre ES Vertou, sam. 4 oct.')).toBeInTheDocument();
    expect(screen.getByText('Entraînement, mer. 1 oct.')).toBeInTheDocument();
  });

  it('confirms by share id, and the list refetches without it', async () => {
    serve([cancellation('c1')]);
    let body: unknown;
    server.use(
      http.post(
        '/api/clubs/club-1/teams/team-1/whatsapp-shares/c1/confirm',
        async ({ request }) => {
          body = await request.json();
          server.use(http.get(LIST, () => HttpResponse.json([])));
          return HttpResponse.json(status('PENDING'));
        },
      ),
    );
    vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    renderCards();

    await user.click(await screen.findByRole('button', { name: 'Partager sur WhatsApp' }));
    await user.click(screen.getByRole('button', { name: "Oui, c'est envoyé" }));

    await waitFor(() => expect(body).toEqual({ platform: 'WA_ME' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Annulations à partager' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('shows an already sent cancellation as such, with a quiet share-again button', async () => {
    serve([cancellation('c1', { status: status('SENT') })]);
    renderCards();
    expect(await screen.findByText('Annulation envoyée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partager à nouveau' })).toBeInTheDocument();
  });

  it('focuses the cancellation the notification named', async () => {
    serve([cancellation('c1'), cancellation('c2')]);
    renderCards('/?partage=c2');

    const buttons = await screen.findAllByRole('button', { name: 'Partager sur WhatsApp' });
    await waitFor(() => expect(buttons[1]).toHaveFocus());
    expect(buttons[0]).not.toHaveFocus();
  });
});
