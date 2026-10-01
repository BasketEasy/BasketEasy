import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../testUtils';
import { ForbiddenPage } from './ForbiddenPage';

describe('ForbiddenPage', () => {
  it('renders one h1 and a link back to the dashboard', () => {
    renderWithProviders(<ForbiddenPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Accès non autorisé' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour au tableau de bord' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });
});
