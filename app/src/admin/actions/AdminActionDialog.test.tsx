import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Button } from '@basketeasy/ui/button';
import { Toaster } from '@basketeasy/ui/toaster';
import { __resetToastsForTests } from '@basketeasy/ui/toast-store';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../testUtils';
import { AdminActionDialog } from './AdminActionDialog';

function renderDialog() {
  return renderWithProviders(
    <>
      <AdminActionDialog
        trigger={<Button>Transférer</Button>}
        title="Transférer la propriété"
        description="Le club propriétaire change."
        facts={[{ label: 'Propriétaire actuel', value: 'BC Nantes' }]}
        fields={[
          {
            name: 'clubId',
            kind: 'select',
            label: 'Nouveau club propriétaire',
            placeholder: 'Choisir',
            requiredMessage: 'Choisissez un club',
            options: [{ value: 'club-2', label: 'ES Carquefou' }],
          },
        ]}
        confirmLabel="Confirmer"
        path="teams/team-1/owner"
      />
      <Toaster />
    </>,
  );
}

describe('AdminActionDialog', () => {
  afterEach(() => __resetToastsForTests());

  it('refuses a short reason and a missing field without calling the API', async () => {
    let called = false;
    server.use(
      http.post('/api/admin/teams/team-1/owner', () => {
        called = true;
        return HttpResponse.json({ action: 'TRANSFER_TEAM_OWNERSHIP', auditLogId: 'a-1' });
      }),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Transférer' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Motif'), 'court');
    await user.click(dialog.getByRole('button', { name: 'Confirmer' }));

    expect(await dialog.findByText('Motif requis (10 caractères minimum)')).toBeInTheDocument();
    expect(dialog.getByText('Choisissez un club')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('shows the server refusal in the dialog', async () => {
    server.use(
      http.post('/api/admin/teams/team-1/owner', () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Ce club est déjà propriétaire de l’équipe' },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Transférer' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('combobox', { name: 'Nouveau club propriétaire' }));
    await user.click(await screen.findByRole('option', { name: 'ES Carquefou' }));
    await user.type(dialog.getByLabelText('Motif'), 'Fusion validée, ticket #820');
    await user.click(dialog.getByRole('button', { name: 'Confirmer' }));

    expect(
      await dialog.findByText('Ce club est déjà propriétaire de l’équipe'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('posts the reason and fields, closes and toasts the outcome', async () => {
    let body: unknown = null;
    server.use(
      http.post('/api/admin/teams/team-1/owner', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ action: 'TRANSFER_TEAM_OWNERSHIP', auditLogId: 'a-1' });
      }),
    );
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Transférer' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('combobox', { name: 'Nouveau club propriétaire' }));
    await user.click(await screen.findByRole('option', { name: 'ES Carquefou' }));
    await user.type(dialog.getByLabelText('Motif'), '  Fusion validée, ticket #820 ');
    await user.click(dialog.getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByText('Propriété transférée')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(body).toEqual({ clubId: 'club-2', reason: 'Fusion validée, ticket #820' });
  });
});
