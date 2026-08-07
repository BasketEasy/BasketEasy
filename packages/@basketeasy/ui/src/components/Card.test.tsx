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
});
