import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventVenueBadge } from './EventVenueBadge';

describe('EventVenueBadge', () => {
  it('shows Domicile for HOME', () => {
    render(<EventVenueBadge venue="HOME" />);
    expect(screen.getByText('Domicile')).toBeInTheDocument();
  });

  it('shows Extérieur for AWAY', () => {
    render(<EventVenueBadge venue="AWAY" />);
    expect(screen.getByText('Extérieur')).toBeInTheDocument();
  });
});
