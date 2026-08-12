import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CTCComparison } from './CTCComparison';

describe('CTCComparison', () => {
  it('renders the section headline', () => {
    render(<CTCComparison />);
    expect(
      screen.getByRole('heading', { name: 'Une équipe, plusieurs clubs ? Enfin un seul outil.' }),
    ).toBeInTheDocument();
  });

  it('renders the static before/after copy (jsdom defaults to reduced motion)', () => {
    render(<CTCComparison />);
    expect(screen.getByText('AIL de Goulaine — effectif Excel')).toBeInTheDocument();
    expect(
      screen.getByText('Une seule liste, alimentée automatiquement par les trois clubs.'),
    ).toBeInTheDocument();
  });

  it('has a #ctc-comparison anchor for the hero CTA to scroll to', () => {
    const { container } = render(<CTCComparison />);
    expect(container.querySelector('#ctc-comparison')).not.toBeNull();
  });
});
