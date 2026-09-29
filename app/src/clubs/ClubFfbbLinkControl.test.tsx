import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { ClubFfbbLinkControl } from './ClubFfbbLinkControl';

describe('ClubFfbbLinkControl', () => {
  it('shows a link-it button when no code is set, and an inline field once clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ClubFfbbLinkControl
        clubId="club-1"
        club={{ id: 'club-1', name: 'COC', ffbbClubCode: null, createdAt: 'x' }}
      />,
    );

    expect(screen.getByRole('button', { name: /lier ce club à la ffbb/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /lier ce club à la ffbb/i }));

    expect(screen.getByLabelText(/code club ffbb/i)).toBeInTheDocument();
  });

  it('shows the stored code with a badge once set, and no confirm step to remove it', async () => {
    let removeCalled = false;
    server.use(
      http.delete('/api/clubs/club-1/ffbb-link', () => {
        removeCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <ClubFfbbLinkControl
        clubId="club-1"
        club={{ id: 'club-1', name: 'COC', ffbbClubCode: 'pdl0044190', createdAt: 'x' }}
      />,
    );

    expect(screen.getByText('FFBB')).toBeInTheDocument();
    expect(screen.getByText('pdl0044190')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /supprimer le lien/i }));

    await waitFor(() => expect(removeCalled).toBe(true));
  });

  it('re-opens the inline field to modify an existing code, and saves the new value', async () => {
    let capturedBody: unknown;
    server.use(
      http.patch('/api/clubs/club-1/ffbb-link', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 'club-1',
          name: 'COC',
          ffbbClubCode: 'pdl0044999',
          createdAt: 'x',
        });
      }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <ClubFfbbLinkControl
        clubId="club-1"
        club={{ id: 'club-1', name: 'COC', ffbbClubCode: 'pdl0044190', createdAt: 'x' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /modifier le lien/i }));
    const input = screen.getByLabelText(/code club ffbb/i);
    await user.clear(input);
    await user.type(input, 'pdl0044999');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(capturedBody).toEqual({ ffbbClubCode: 'pdl0044999' }));
  });

  it('shows a refused save under the field and keeps it open', async () => {
    server.use(
      http.patch('/api/clubs/club-1/ffbb-link', () =>
        HttpResponse.json({ message: 'invalid' }, { status: 400 }),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <ClubFfbbLinkControl
        clubId="club-1"
        club={{ id: 'club-1', name: 'COC', ffbbClubCode: null, createdAt: 'x' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: /lier ce club à la ffbb/i }));
    await user.type(screen.getByLabelText(/code club ffbb/i), 'nope');
    await user.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(
      await screen.findByText('Certaines informations saisies sont invalides.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/code club ffbb/i)).toHaveValue('nope');
  });
});
