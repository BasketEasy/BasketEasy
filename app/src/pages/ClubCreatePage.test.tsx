import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import { ClubCreatePage } from './ClubCreatePage';

describe('ClubCreatePage', () => {
  it('opens on an h1 with a way back to the account page', () => {
    renderWithProviders(<ClubCreatePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Créer un club' })).toBeInTheDocument();
    expect(screen.getByText('Vous en serez le premier administrateur.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour à Mon compte' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(screen.getByRole('link', { name: 'Mon compte' })).toHaveAttribute('href', '/account');
  });
});
