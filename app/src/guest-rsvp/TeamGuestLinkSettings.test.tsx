import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { TeamGuestLinkSettings } from './TeamGuestLinkSettings';

const LINK = '/api/clubs/club-1/teams/team-1/guest-link';
const URL_A = 'https://kluvo.test/r/token-a';

function serveLink(info: { url: string } | null) {
  server.use(http.get(LINK, () => HttpResponse.json(info)));
}

function renderCard() {
  return renderWithProviders(
    <>
      <TeamGuestLinkSettings clubId="club-1" teamId="team-1" />
      <Toaster />
    </>,
  );
}

const EXPOSURE = /voit les prénoms de l'équipe .* et peut répondre pour n'importe quel joueur/;

describe('TeamGuestLinkSettings', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  afterEach(() => vi.restoreAllMocks());

  it('says a failed load is a failure, not an off link', async () => {
    server.use(http.get(LINK, () => HttpResponse.json({}, { status: 500 })));
    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Lien indisponible');
    expect(screen.queryByRole('button', { name: 'Activer le lien' })).not.toBeInTheDocument();
  });

  it('offers to switch the link on while it is off, saying what it exposes', async () => {
    serveLink(null);
    renderCard();

    expect(await screen.findByRole('button', { name: 'Activer le lien' })).toBeInTheDocument();
    expect(screen.getByText(EXPOSURE)).toBeInTheDocument();
    expect(screen.queryByLabelText('Lien de réponse')).not.toBeInTheDocument();
  });

  it('renders no heading of its own (the accordion trigger is the heading)', async () => {
    serveLink(null);
    renderCard();

    await screen.findByRole('button', { name: 'Activer le lien' });
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('enables the link and shows its URL', async () => {
    serveLink(null);
    let posted = false;
    server.use(
      http.post(LINK, () => {
        posted = true;
        return HttpResponse.json({ url: URL_A });
      }),
    );
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Activer le lien' }));

    expect(await screen.findByLabelText('Lien de réponse')).toHaveValue(URL_A);
    expect(posted).toBe(true);
    expect(await screen.findByText('Lien activé')).toBeInTheDocument();
    expect(screen.getByText(EXPOSURE)).toBeInTheDocument();
  });

  it('copies the link', async () => {
    serveLink({ url: URL_A });
    const user = userEvent.setup();
    renderCard();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    await user.click(await screen.findByRole('button', { name: 'Copier' }));

    expect(writeText).toHaveBeenCalledWith(URL_A);
    expect(await screen.findByText('Lien copié')).toBeInTheDocument();
  });

  it('offers Partager only where the browser can share', async () => {
    serveLink({ url: URL_A });
    const { unmount } = renderCard();
    await screen.findByLabelText('Lien de réponse');
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
    unmount();

    // `canShare` is read at module load, so re-import with share present.
    vi.resetModules();
    Object.defineProperty(navigator, 'share', { value: vi.fn(), configurable: true });
    const { TeamGuestLinkSettings: WithShare } = await import('./TeamGuestLinkSettings');
    renderWithProviders(<WithShare clubId="club-1" teamId="team-1" />);

    expect(await screen.findByRole('button', { name: 'Partager' })).toBeInTheDocument();
  });

  it('sends nothing to regenerate until the coach confirms, and warns the old link dies', async () => {
    serveLink({ url: URL_A });
    let regenerated = false;
    server.use(
      http.post(`${LINK}/regenerate`, () => {
        regenerated = true;
        return HttpResponse.json({ url: 'https://kluvo.test/r/token-b' });
      }),
    );
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Générer un nouveau lien' }));
    expect(
      screen.getByText(/L'ancien lien cessera de fonctionner immédiatement/),
    ).toBeInTheDocument();
    expect(regenerated).toBe(false);

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Générer un nouveau lien' }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Lien de réponse')).toHaveValue('https://kluvo.test/r/token-b'),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cancelling the confirm leaves the link alone', async () => {
    serveLink({ url: URL_A });
    let deleted = false;
    server.use(
      http.delete(LINK, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Désactiver' }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(deleted).toBe(false);
    expect(screen.getByLabelText('Lien de réponse')).toHaveValue(URL_A);
  });

  it('disables the link once confirmed and goes back to the off state', async () => {
    serveLink({ url: URL_A });
    server.use(http.delete(LINK, () => new HttpResponse(null, { status: 204 })));
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Désactiver' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Désactiver' }),
    );

    expect(await screen.findByRole('button', { name: 'Activer le lien' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Lien de réponse')).not.toBeInTheDocument();
  });

  it('toasts a failed regeneration and keeps showing the current link', async () => {
    serveLink({ url: URL_A });
    server.use(http.post(`${LINK}/regenerate`, () => HttpResponse.json({}, { status: 500 })));
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Générer un nouveau lien' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Générer un nouveau lien' }),
    );

    expect(await screen.findByText(/Une erreur est survenue/)).toBeInTheDocument();
    expect(screen.getByLabelText('Lien de réponse')).toHaveValue(URL_A);
  });
});
