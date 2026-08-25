import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton, SkeletonList } from './Skeleton';

describe('Skeleton', () => {
  it('renders a shimmer block', () => {
    render(<Skeleton data-testid="block" />);
    expect(screen.getByTestId('block')).toHaveClass('animate-pulse', 'bg-sunk');
  });

  it('announces the list as busy exactly once', () => {
    render(<SkeletonList rows={5} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAccessibleName('Chargement…');
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(5);
  });
});
