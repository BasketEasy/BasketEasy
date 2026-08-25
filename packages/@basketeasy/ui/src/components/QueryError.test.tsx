import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QueryError } from './QueryError';

describe('QueryError', () => {
  it('renders as an alert with the default French copy', () => {
    render(<QueryError />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Chargement impossible');
    expect(alert).toHaveTextContent('Les données n’ont pas pu être récupérées.');
  });

  it('renders custom title and description when provided', () => {
    render(<QueryError title="Équipe introuvable" description="Détail personnalisé." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Équipe introuvable');
    expect(screen.getByRole('alert')).toHaveTextContent('Détail personnalisé.');
  });

  it('does not render a retry button when onRetry is absent', () => {
    render(<QueryError />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<QueryError onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables the retry button and shows a busy state while retrying', () => {
    render(<QueryError onRetry={() => {}} isRetrying />);
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeDisabled();
  });
});
