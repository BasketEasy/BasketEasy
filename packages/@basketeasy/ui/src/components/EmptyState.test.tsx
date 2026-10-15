import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState title="Aucun joueur" description="Ajoutez votre premier joueur à l'effectif." />,
    );
    expect(screen.getByText('Aucun joueur')).toBeInTheDocument();
    expect(screen.getByText("Ajoutez votre premier joueur à l'effectif.")).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(<EmptyState title="Aucun joueur" action={<Button>Ajouter un joueur</Button>} />);
    expect(screen.getByRole('button', { name: 'Ajouter un joueur' })).toBeInTheDocument();
  });

  it('does not render an action element when action is omitted', () => {
    render(<EmptyState title="Aucun joueur" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="Aucun joueur" icon={<svg data-testid="empty-icon" />} />);
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
  });
});
