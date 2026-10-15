import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './Card';

describe('Card', () => {
  it('renders title, description and content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>AS Basket</CardTitle>
          <CardDescription>Club de Loire-Atlantique</CardDescription>
        </CardHeader>
        <CardContent>42 licenciés</CardContent>
      </Card>,
    );
    expect(screen.getByText('AS Basket')).toBeInTheDocument();
    expect(screen.getByText('Club de Loire-Atlantique')).toBeInTheDocument();
    expect(screen.getByText('42 licenciés')).toBeInTheDocument();
  });

  it('sits on the elevated surface, not the page ground', () => {
    render(<Card data-testid="card">Contenu</Card>);
    expect(screen.getByTestId('card')).toHaveClass('bg-surface');
  });

  it('lets the brand tone override the variant background', () => {
    render(
      <Card variant="panel" tone="brand" data-testid="card">
        Vous êtes convoqué·e
      </Card>,
    );
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('bg-orange-tint');
    expect(card).not.toHaveClass('bg-surface');
    // The panel's own padding and elevation survive the tone.
    expect(card).toHaveClass('p-5', 'shadow-md');
  });
});
