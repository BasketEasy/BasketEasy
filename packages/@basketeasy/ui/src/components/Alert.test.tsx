import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert, AlertDescription } from './Alert';

describe('Alert', () => {
  it('renders its description', () => {
    render(
      <Alert>
        <AlertDescription>La salle est indisponible ce soir.</AlertDescription>
      </Alert>,
    );
    expect(screen.getByText('La salle est indisponible ce soir.')).toBeInTheDocument();
  });

  it('has role alert', () => {
    render(<Alert>Message</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('applies the destructive variant class', () => {
    render(<Alert variant="destructive">Erreur</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('border-error');
  });

  it('fills the critical variant', () => {
    render(<Alert variant="critical">Lecture seule</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('bg-error', 'text-cream');
  });

  it('tints the warning variant', () => {
    render(<Alert variant="warning">3 matchs sans lieu</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('border-gold', 'bg-gold-tint');
  });
});
