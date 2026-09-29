import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import type { EventWhatsAppShare } from '@basketeasy/types/whatsapp-reminder';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { WhatsAppShareCard } from './WhatsAppShareCard';

const SHARE = '/api/clubs/club-1/teams/team-1/events/event-1/whatsapp-share';
const MESSAGE =
  '🏀 Match contre ES Vertou, sam. 4 oct. !\nDis-nous si tu viens 👉 https://k.test/r/a?src=wa';

const notSent: EventWhatsAppShare = {
  guestLinkActive: true,
  shares: [
    {
      type: 'REMINDER',
      state: 'NOT_SENT',
      sentAt: null,
      sentBy: null,
      platform: null,
      message: MESSAGE,
    },
  ],
};

const sent: EventWhatsAppShare = {
  guestLinkActive: true,
  shares: [
    {
      type: 'REMINDER',
      state: 'SENT',
      sentAt: new Date(2026, 9, 4, 18, 12).toISOString(),
      sentBy: { firstName: 'Sophie', lastInitial: 'M', isMe: false },
      platform: 'WA_ME',
      message: MESSAGE,
    },
  ],
};

const linkOff: EventWhatsAppShare = {
  guestLinkActive: false,
  shares: [{ ...notSent.shares[0], message: null }],
};

function serve(body: EventWhatsAppShare) {
  server.use(http.get(SHARE, () => HttpResponse.json(body)));
}

function renderCard() {
  return renderWithProviders(
    <>
      <WhatsAppShareCard clubId="club-1" teamId="team-1" eventId="event-1" />
      <Toaster />
    </>,
  );
}

function setShare(share: unknown) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
}

describe('WhatsAppShareCard', () => {
  beforeEach(() => setShare(undefined));
  afterEach(() => vi.restoreAllMocks());

  it('says a failed load is a failure', async () => {
    server.use(http.get(SHARE, () => HttpResponse.json({}, { status: 500 })));
    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Partage indisponible');
    expect(screen.queryByRole('button', { name: 'Partager sur WhatsApp' })).not.toBeInTheDocument();
  });

  it('offers to share a reminder that was never sent, and shows the exact message', async () => {
    serve(notSent);
    const user = userEvent.setup();
    renderCard();

    expect(
      await screen.findByRole('button', { name: 'Partager sur WhatsApp' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Envoyé')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voir le message' }));

    expect(screen.getByText(/Match contre ES Vertou, sam\. 4 oct\./)).toBeInTheDocument();
  });

  it('shows who sent it and when, with a share-again button', async () => {
    serve(sent);
    renderCard();

    expect(await screen.findByText('Envoyé')).toBeInTheDocument();
    expect(screen.getByText('Envoyé le 04/10 à 18:12 par Sophie M.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partager à nouveau' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Partager sur WhatsApp' })).not.toBeInTheDocument();
  });

  it('blocks sharing while the guest link is off, and re-enables it', async () => {
    serve(linkOff);
    let enabled = false;
    server.use(
      http.post('/api/clubs/club-1/teams/team-1/guest-link', () => {
        enabled = true;
        server.use(http.get(SHARE, () => HttpResponse.json(notSent)));
        return HttpResponse.json({ url: 'https://k.test/r/a' });
      }),
    );
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByText(/Le lien de réponse est désactivé/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Partager/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réactiver le lien' }));

    expect(
      await screen.findByRole('button', { name: 'Partager sur WhatsApp' }),
    ).toBeInTheDocument();
    expect(enabled).toBe(true);
  });

  it('falls back to wa.me without navigator.share, then confirms with « Oui »', async () => {
    serve(notSent);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    let body: unknown;
    server.use(
      http.post(`${SHARE}/REMINDER/confirm`, async ({ request }) => {
        body = await request.json();
        server.use(http.get(SHARE, () => HttpResponse.json(sent)));
        return HttpResponse.json(sent.shares[0]);
      }),
    );
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Partager sur WhatsApp' }));

    expect(open).toHaveBeenCalledWith(
      `https://wa.me/?text=${encodeURIComponent(MESSAGE)}`,
      '_blank',
      'noopener',
    );
    expect(screen.getByText(/Vous l'avez envoyé dans le groupe/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "Oui, c'est envoyé" }));

    await waitFor(() => expect(body).toEqual({ platform: 'WA_ME' }));
    expect(await screen.findByText('Partage enregistré')).toBeInTheDocument();
    expect(await screen.findByText('Envoyé')).toBeInTheDocument();
    expect(screen.queryByText(/Vous l'avez envoyé dans le groupe/)).not.toBeInTheDocument();
  });

  it('« Pas encore » posts nothing and hides the row', async () => {
    serve(notSent);
    vi.spyOn(window, 'open').mockReturnValue(null);
    let posted = false;
    server.use(
      http.post(`${SHARE}/REMINDER/confirm`, () => {
        posted = true;
        return HttpResponse.json(sent.shares[0]);
      }),
    );
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Partager sur WhatsApp' }));
    await user.click(screen.getByRole('button', { name: 'Pas encore' }));

    expect(screen.queryByText(/Vous l'avez envoyé dans le groupe/)).not.toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('shows no confirm row when the user backs out of the share sheet', async () => {
    serve(notSent);
    setShare(vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')));
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Partager sur WhatsApp' }));

    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(screen.queryByText(/Vous l'avez envoyé dans le groupe/)).not.toBeInTheDocument();
  });

  it('copies the message and asks for the same confirmation, recording COPY', async () => {
    serve(notSent);
    let body: unknown;
    server.use(
      http.post(`${SHARE}/REMINDER/confirm`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(sent.shares[0]);
      }),
    );
    const user = userEvent.setup();
    // user-event installs its own clipboard stub on setup(), so spy on that one.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Copier le message' }));
    expect(writeText).toHaveBeenCalledWith(MESSAGE);
    await user.click(await screen.findByRole('button', { name: "Oui, c'est envoyé" }));

    await waitFor(() => expect(body).toEqual({ platform: 'COPY' }));
  });
});
