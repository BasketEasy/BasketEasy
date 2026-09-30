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
      dueAt: null,
      sentAt: null,
      sentBy: null,
      platform: null,
      message: MESSAGE,
      changes: [],
    },
  ],
};

const sent: EventWhatsAppShare = {
  guestLinkActive: true,
  shares: [
    {
      type: 'REMINDER',
      state: 'SENT',
      dueAt: null,
      sentAt: new Date(2026, 9, 4, 18, 12).toISOString(),
      sentBy: { firstName: 'Sophie', lastInitial: 'M', isMe: false },
      platform: 'WA_ME',
      message: MESSAGE,
      changes: [],
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

function renderCard(props: Partial<React.ComponentProps<typeof WhatsAppShareCard>> = {}) {
  return renderWithProviders(
    <>
      <WhatsAppShareCard clubId="club-1" teamId="team-1" eventId="event-1" {...props} />
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

  describe('reminder states', () => {
    const inState = (state: string, over: Record<string, unknown> = {}): EventWhatsAppShare => ({
      guestLinkActive: true,
      shares: [{ ...notSent.shares[0], state: state as never, ...over }],
    });

    it('SCHEDULED says when the reminder is due, and still lets the manager share now', async () => {
      serve(inState('SCHEDULED', { dueAt: new Date(2026, 9, 1, 18, 0).toISOString() }));
      renderCard();

      expect(await screen.findByText(/Rappel prévu le 01\/10 à 18:00/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Partager sur WhatsApp' })).toBeInTheDocument();
    });

    it('PENDING is flagged « À partager » in the brand tone', async () => {
      serve(inState('PENDING'));
      renderCard();

      expect(await screen.findByText('À partager')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Partager sur WhatsApp' })).toBeInTheDocument();
    });

    it('EXPIRED says nobody shared, and the button is still there', async () => {
      serve(inState('EXPIRED'));
      renderCard();

      expect(await screen.findByText('Non partagé')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Partager sur WhatsApp' })).toBeInTheDocument();
    });

    it('says the reminder is off for the event while still allowing a manual share', async () => {
      serve(inState('VOID'));
      renderCard({ reminderEnabled: false });

      expect(await screen.findByText(/Rappel désactivé pour cet événement/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Partager sur WhatsApp' })).toBeInTheDocument();
    });

    it('paints the event’s own share state while the message is still loading', async () => {
      server.use(
        http.get(SHARE, async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return HttpResponse.json(inState('PENDING'));
        }),
      );
      renderCard({
        initialShare: { ...inState('PENDING').shares[0], message: undefined } as never,
      });

      expect(screen.getByText('À partager')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Partager sur WhatsApp' }),
      ).not.toBeInTheDocument();
      expect(
        await screen.findByRole('button', { name: 'Partager sur WhatsApp' }),
      ).toBeInTheDocument();
    });

    it('focuses the share button once loaded when opened from a notification', async () => {
      serve(inState('PENDING'));
      renderCard({ focusOnLoad: true });

      const button = await screen.findByRole('button', { name: 'Partager sur WhatsApp' });
      await waitFor(() => expect(button).toHaveFocus());
    });
  });

  describe('an update raised after the group was told', () => {
    const UPDATE_MESSAGE = '⚠️ Changement : Match contre ES Vertou, dim. 4 oct. !';
    const withUpdate = (
      state: string,
      changes = [{ label: 'Heure de début', from: '15:30', to: '16:00' }],
    ) =>
      ({
        guestLinkActive: true,
        shares: [
          {
            ...notSent.shares[0],
            type: 'UPDATE',
            state,
            message: UPDATE_MESSAGE,
            changes,
          },
          sent.shares[0],
        ],
      }) as EventWhatsAppShare;

    it('shows the update above the reminder, and says what moved with the old value struck through', async () => {
      serve(withUpdate('PENDING'));
      renderCard();

      expect(await screen.findByText('Changement à partager')).toBeInTheDocument();
      const list = screen.getByRole('list', { name: 'Ce qui a changé' });
      expect(list).toHaveTextContent('Heure de début : 15:30 → 16:00');
      expect(list.querySelector('.line-through')).toHaveTextContent('15:30');
      // The reminder stays as history, below.
      const sections = document.querySelectorAll('section');
      expect(sections).toHaveLength(2);
      expect(sections[0]).toHaveTextContent('Changement à partager');
      expect(sections[1]).toHaveTextContent('Envoyé le 04/10 à 18:12');
    });

    it('confirms the update on its own route, leaving the reminder alone', async () => {
      serve(withUpdate('PENDING'));
      const posted: string[] = [];
      server.use(
        http.post(`${SHARE}/UPDATE/confirm`, () => {
          posted.push('UPDATE');
          return HttpResponse.json(sent.shares[0]);
        }),
        http.post(`${SHARE}/REMINDER/confirm`, () => {
          posted.push('REMINDER');
          return HttpResponse.json(sent.shares[0]);
        }),
      );
      vi.spyOn(window, 'open').mockReturnValue(null);
      const user = userEvent.setup();
      renderCard();

      await user.click(await screen.findByRole('button', { name: 'Partager sur WhatsApp' }));
      await user.click(screen.getByRole('button', { name: "Oui, c'est envoyé" }));

      await waitFor(() => expect(posted).toEqual(['UPDATE']));
    });

    it('lists a sent update as history, without the changes', async () => {
      serve(withUpdate('SENT', []));
      renderCard();
      expect(await screen.findByText('Changement envoyé')).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'Ce qui a changé' })).not.toBeInTheDocument();
    });

    it('hides a voided or expired update', async () => {
      serve(withUpdate('VOID'));
      renderCard();
      await screen.findByText('Envoyé');
      expect(document.querySelectorAll('section')).toHaveLength(1);
    });

    it('focuses the update’s button first when opened from a notification', async () => {
      serve(withUpdate('PENDING'));
      renderCard({ focusOnLoad: true });
      const [first] = await screen.findAllByRole('button', { name: /Partager/ });
      await waitFor(() => expect(first).toHaveFocus());
      expect(document.querySelectorAll('section')[0]).toContainElement(first);
    });
  });
});
