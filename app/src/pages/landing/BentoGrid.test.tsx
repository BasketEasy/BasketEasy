import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BentoGrid } from './BentoGrid';
import { BENTO_FEATURES } from './data';

describe('BentoGrid', () => {
  it('renders all 4 feature tiles', () => {
    render(<BentoGrid />);
    for (const feature of BENTO_FEATURES) {
      expect(screen.getByText(feature.title)).toBeInTheDocument();
    }
  });

  it('badges only the not-yet-built features', () => {
    render(<BentoGrid />);
    const badgedTitles = BENTO_FEATURES.filter((f) => f.badge).map((f) => f.title);
    const unbadgedTitles = BENTO_FEATURES.filter((f) => !f.badge).map((f) => f.title);

    expect(screen.getAllByText('Bientôt')).toHaveLength(badgedTitles.length);
    for (const title of unbadgedTitles) {
      const card = screen.getByText(title).closest('[class*="rounded"]');
      expect(card?.textContent).not.toContain('Bientôt');
    }
  });
});
