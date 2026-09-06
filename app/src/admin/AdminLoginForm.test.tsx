import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { AdminLoginForm } from './AdminLoginForm';
import { clearPlatformSession } from './platformSession';

afterEach(() => clearPlatformSession());

describe('AdminLoginForm', () => {
  it('rejects a code that is not six digits before sending anything', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminLoginForm />);

    await user.type(screen.getByLabelText('Code de vérification'), '123');
    await user.click(screen.getByRole('button', { name: 'Entrer' }));

    expect(await screen.findByText('Code à 6 chiffres')).toBeInTheDocument();
  });

  it('reports an invalid code inline and clears the field for another attempt', async () => {
    // setError('root') + Alert, not toast(): the trigger stays on screen, and
    // this is the convention every other auth form here already follows.
    server.use(
      http.post('/api/admin/login', () =>
        HttpResponse.json({ message: 'Code invalide' }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<AdminLoginForm />);

    const field = screen.getByLabelText('Code de vérification');
    await user.type(field, '000000');
    await user.click(screen.getByRole('button', { name: 'Entrer' }));

    expect(await screen.findByText('Code invalide.')).toBeInTheDocument();
    await waitFor(() => expect(field).toHaveValue(''));
  });

  it('says the back-office is not enabled when the deployment has no secret', async () => {
    server.use(http.post('/api/admin/login', () => HttpResponse.json({}, { status: 503 })));
    const user = userEvent.setup();
    renderWithProviders(<AdminLoginForm />);

    await user.type(screen.getByLabelText('Code de vérification'), '123456');
    await user.click(screen.getByRole('button', { name: 'Entrer' }));

    expect(
      await screen.findByText("Le back-office n'est pas activé sur ce déploiement."),
    ).toBeInTheDocument();
  });
});
