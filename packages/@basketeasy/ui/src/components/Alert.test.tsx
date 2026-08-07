import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Alert, AlertDescription, AlertTitle } from './Alert';

describe('Alert', () => {
  it('renders title and description', () => {
    render(
      <Alert>
        <AlertTitle>Créneau annulé</AlertTitle>
        <AlertDescription>La salle est indisponible ce soir.</AlertDescription>
      </Alert>,
    );
    expect(screen.getByText('Créneau annulé')).toBeInTheDocument();
    expect(screen.getByText('La salle est indisponible ce soir.')).toBeInTheDocument();
  });

  it('has role alert', () => {
    render(<Alert>Message</Alert>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('applies the destructive variant class', () => {
    render(<Alert variant="destructive">Erreur</Alert>);
    expect(screen.getByRole('alert')).toHaveClass('border-red-600');
  });
});
