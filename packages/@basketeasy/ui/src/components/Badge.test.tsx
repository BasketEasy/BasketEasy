import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Actif</Badge>);
    expect(screen.getByText('Actif')).toBeInTheDocument();
  });

  it('applies the outline variant class', () => {
    render(<Badge variant="outline">Inactif</Badge>);
    expect(screen.getByText('Inactif')).toHaveClass('border');
  });
});
