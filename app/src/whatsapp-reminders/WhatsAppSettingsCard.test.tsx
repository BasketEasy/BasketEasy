import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { WhatsAppSettingsCard } from './WhatsAppSettingsCard';

const SETTINGS = '/api/clubs/club-1/teams/team-1/whatsapp-settings';

const settings = (over: Record<string, unknown> = {}) => ({
  reminderTemplate: null,
  updateTemplate: null,
  cancellationTemplate: null,
  reminderEnabled: false,
  defaultOffsetMinutes: 4320,
  hasReachableManager: true,
  ...over,
});

function serve(reminderTemplate: string | null, over: Record<string, unknown> = {}) {
  server.use(http.get(SETTINGS, () => HttpResponse.json(settings({ reminderTemplate, ...over }))));
}

function renderCard() {
  return renderWithProviders(
    <>
      <WhatsAppSettingsCard clubId="club-1" teamId="team-1" />
      <Toaster />
    </>,
  );
}

const editor = () => screen.findByRole('textbox', { name: 'Message de rappel' });

describe('WhatsAppSettingsCard', () => {
  it('says a failed load is a failure', async () => {
    server.use(http.get(SETTINGS, () => HttpResponse.json({}, { status: 500 })));
    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Message indisponible');
  });

  it('shows the default with variables as chips, never as codes', async () => {
    serve(null);
    renderCard();

    const box = await editor();
    expect(box).toHaveTextContent('Heure de RDV');
    expect(box).toHaveTextContent('Lien de réponse');
    expect(box).not.toHaveTextContent('{');
  });

  it('renders no heading of its own (the accordion trigger is the heading)', async () => {
    serve(null);
    renderCard();

    await editor();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('previews a match with the RDV line and a training without it', async () => {
    serve(null);
    const user = userEvent.setup();
    renderCard();
    await editor();

    expect(screen.getByText(/RDV 14:30 – Parking du club\./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Entraînement' }));

    expect(screen.queryByText(/RDV 14:30/)).not.toBeInTheDocument();
    expect(screen.getByText(/On commence à 18:30/)).toBeInTheDocument();
  });

  it('blocks the save on a template without the link, naming it by its label', async () => {
    serve('Salut {team_name}');
    let saved = false;
    server.use(
      http.patch(SETTINGS, () => {
        saved = true;
        return HttpResponse.json({ ...settings(), guestLinkEnabled: false });
      }),
    );
    const user = userEvent.setup();
    renderCard();
    await editor();

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Le message doit contenir le lien de réponse (« Lien de réponse »)',
    );
    expect(saved).toBe(false);
  });

  it('blocks the save on an unknown variable', async () => {
    serve('{link} {nope}');
    const user = userEvent.setup();
    renderCard();
    await editor();

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('information inconnue');
  });

  it('inserts a variable from its button and saves the {key} text', async () => {
    serve('Salut {link}');
    let body: unknown;
    server.use(
      http.patch(SETTINGS, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          ...settings({ reminderTemplate: 'Salut {link}{team_name}' }),
          guestLinkEnabled: false,
        });
      }),
    );
    const user = userEvent.setup();
    renderCard();
    await editor();

    await user.click(screen.getByRole('button', { name: 'Équipe' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(body).toMatchObject({
        reminderTemplate: 'Salut {link}{team_name}',
        reminderEnabled: false,
        defaultOffsetMinutes: 4320,
      }),
    );
    expect(await screen.findByText('Réglages enregistrés')).toBeInTheDocument();
  });

  it('restores the default text and saves it as such', async () => {
    serve('Yo {link}');
    let body: unknown;
    server.use(
      http.patch(SETTINGS, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...settings(), guestLinkEnabled: false });
      }),
    );
    const user = userEvent.setup();
    renderCard();
    const box = await editor();
    expect(box).toHaveTextContent('Yo');

    await user.click(screen.getByRole('button', { name: 'Rétablir le texte par défaut' }));
    await waitFor(() => expect(box).toHaveTextContent('Heure de RDV'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(body).toBeDefined());
    expect((body as { reminderTemplate: string }).reminderTemplate).toContain('{meeting_time}');
  });

  it('binds a server refusal to the field', async () => {
    serve('Yo {link}');
    server.use(
      http.patch(SETTINGS, () =>
        HttpResponse.json(
          { message: 'Le message est trop long', code: 'TOO_LONG' },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderCard();
    await editor();

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Le message est trop long');
  });

  it('warns when no manager would hear the reminder', async () => {
    serve(null, { hasReachableManager: false });
    renderCard();

    expect(await screen.findByText(/Aucun gestionnaire de l’équipe ne reçoit/)).toBeInTheDocument();
  });

  it('shows no warning when someone is reachable', async () => {
    serve(null);
    renderCard();
    await editor();

    expect(screen.queryByText(/Aucun gestionnaire de l’équipe ne reçoit/)).not.toBeInTheDocument();
  });

  it('shows the offset only once the reminder is on, in whole days when it is', async () => {
    serve(null, { reminderEnabled: false });
    const user = userEvent.setup();
    renderCard();
    await editor();

    expect(screen.queryByLabelText('Me rappeler')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Rappel automatique' }));

    expect(screen.getByLabelText('Me rappeler')).toHaveValue('3');
    expect(screen.getByRole('combobox', { name: 'Unité de durée' })).toHaveTextContent('jours');
  });

  it('saves the toggle and the offset as minutes, and says when the guest link was switched on', async () => {
    serve(null, { reminderEnabled: false });
    let body: unknown;
    server.use(
      http.patch(SETTINGS, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          ...settings({ reminderEnabled: true, defaultOffsetMinutes: 2880 }),
          guestLinkEnabled: true,
        });
      }),
    );
    const user = userEvent.setup();
    renderCard();
    await editor();

    await user.click(screen.getByRole('checkbox', { name: 'Rappel automatique' }));
    const offset = screen.getByLabelText('Me rappeler');
    await user.clear(offset);
    await user.type(offset, '2');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(body).toMatchObject({ reminderEnabled: true, defaultOffsetMinutes: 2880 }),
    );
    expect(await screen.findByText('Réglages enregistrés')).toBeInTheDocument();
    expect(screen.getByText(/lien de réponse sans compte a été activé/)).toBeInTheDocument();
  });

  it('refuses an offset beyond the guest page’s 14 days', async () => {
    serve(null, { reminderEnabled: true });
    let saved = false;
    server.use(
      http.patch(SETTINGS, () => {
        saved = true;
        return HttpResponse.json({ ...settings(), guestLinkEnabled: false });
      }),
    );
    const user = userEvent.setup();
    renderCard();
    await editor();

    const offset = screen.getByLabelText('Me rappeler');
    await user.clear(offset);
    await user.type(offset, '20');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('14 jours avant au maximum')).toBeInTheDocument();
    expect(saved).toBe(false);
  });

  describe('the three templates', () => {
    const kind = (name: string) => screen.getByRole('button', { name, pressed: false });

    it('switches between reminder, change and cancellation, each with its own editor', async () => {
      serve(null);
      const user = userEvent.setup();
      renderCard();
      expect(await screen.findByRole('textbox', { name: 'Message de rappel' })).toHaveTextContent(
        'Dis-nous si tu viens',
      );

      await user.click(kind('Changement'));
      expect(
        await screen.findByRole('textbox', { name: 'Message de changement' }),
      ).toHaveTextContent('Changement');

      await user.click(kind('Annulation'));
      expect(
        await screen.findByRole('textbox', { name: 'Message d’annulation' }),
      ).toHaveTextContent("c'est annulé");
    });

    it('shows the reminder toggle only in the reminder section', async () => {
      serve(null);
      const user = userEvent.setup();
      renderCard();
      await editor();
      expect(screen.getByRole('checkbox', { name: 'Rappel automatique' })).toBeInTheDocument();

      await user.click(kind('Annulation'));

      expect(
        screen.queryByRole('checkbox', { name: 'Rappel automatique' }),
      ).not.toBeInTheDocument();
    });

    it('previews the cancellation as one line with no link', async () => {
      serve(null);
      const user = userEvent.setup();
      renderCard();
      await editor();
      await user.click(kind('Annulation'));

      expect(
        await screen.findByText(
          "❌ Match contre ES Vertou du sam. 4 oct. : c'est annulé. On te tient au courant !",
        ),
      ).toBeInTheDocument();
    });

    it('does not require the link in a cancellation, while a change still does', async () => {
      serve(null, { cancellationTemplate: 'Annulé', updateTemplate: 'Changement {team_name}' });
      let saved = false;
      server.use(
        http.patch(SETTINGS, () => {
          saved = true;
          return HttpResponse.json({ ...settings(), guestLinkEnabled: false });
        }),
      );
      const user = userEvent.setup();
      renderCard();
      await editor();

      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

      // The change template lacks the link, so the save is blocked and the form
      // jumps to the section that is wrong.
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Le message doit contenir le lien',
      );
      expect(screen.getByRole('textbox', { name: 'Message de changement' })).toBeInTheDocument();
      expect(saved).toBe(false);
    });

    it('saves a cancellation with no link', async () => {
      serve(null, { cancellationTemplate: 'Annulé' });
      let body: Record<string, unknown> = {};
      server.use(
        http.patch(SETTINGS, async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ ...settings(), guestLinkEnabled: false });
        }),
      );
      const user = userEvent.setup();
      renderCard();
      await editor();

      await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

      await waitFor(() => expect(body.cancellationTemplate).toBe('Annulé'));
    });

    it('restores the default of the section being edited only', async () => {
      serve(null, { updateTemplate: 'Yo {link}' });
      const user = userEvent.setup();
      renderCard();
      await editor();
      await user.click(kind('Changement'));
      const box = await screen.findByRole('textbox', { name: 'Message de changement' });
      expect(box).toHaveTextContent('Yo');

      await user.click(screen.getByRole('button', { name: 'Rétablir le texte par défaut' }));

      await waitFor(() => expect(box).toHaveTextContent('Nouveau RDV'));
    });
  });
});
