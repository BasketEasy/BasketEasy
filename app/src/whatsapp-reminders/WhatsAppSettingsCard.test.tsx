import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Toaster } from '@basketeasy/ui/toaster';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { WhatsAppSettingsCard } from './WhatsAppSettingsCard';

const SETTINGS = '/api/clubs/club-1/teams/team-1/whatsapp-settings';

function serve(reminderTemplate: string | null) {
  server.use(http.get(SETTINGS, () => HttpResponse.json({ reminderTemplate })));
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
        return HttpResponse.json({ reminderTemplate: null });
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
        return HttpResponse.json({ reminderTemplate: 'Salut {link}{team_name}' });
      }),
    );
    const user = userEvent.setup();
    renderCard();
    await editor();

    await user.click(screen.getByRole('button', { name: 'Équipe' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(body).toEqual({ reminderTemplate: 'Salut {link}{team_name}' }));
    expect(await screen.findByText('Message enregistré')).toBeInTheDocument();
  });

  it('restores the default text and saves it as such', async () => {
    serve('Yo {link}');
    let body: unknown;
    server.use(
      http.patch(SETTINGS, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ reminderTemplate: null });
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
});
