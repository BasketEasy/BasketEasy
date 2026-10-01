import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import { AuthCard } from './AuthCard';

describe('AuthCard', () => {
  it('renders the wordmark, one h1, the eyebrow, description, children and footer', () => {
    renderWithProviders(
      <AuthCard
        eyebrow="Eyebrow"
        title="Titre"
        description="Description"
        footer={<span>Pied</span>}
      >
        <p>Contenu</p>
      </AuthCard>,
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Titre' })).toBeInTheDocument();
    expect(screen.getByText('Kluvo')).toBeInTheDocument();
    expect(screen.getByText('Eyebrow')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Contenu')).toBeInTheDocument();
    expect(screen.getByText('Pied')).toBeInTheDocument();
  });

  it('keeps the wordmark plain text unless brandLink is set', () => {
    const { unmount } = renderWithProviders(<AuthCard title="Titre" />);
    expect(screen.queryByRole('link', { name: 'Kluvo' })).not.toBeInTheDocument();
    unmount();

    renderWithProviders(<AuthCard title="Titre" brandLink />);
    expect(screen.getByRole('link', { name: 'Kluvo' })).toHaveAttribute('href', '/');
  });
});
