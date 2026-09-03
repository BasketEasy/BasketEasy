import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimeBlock } from './TimeBlock';

describe('TimeBlock', () => {
  it('renders the time-of-day over an abbreviated type label', () => {
    render(<TimeBlock type="TRAINING" startsAt="2026-08-12T18:00:00.000Z" timeConfirmed />);

    expect(screen.getByText('18:00')).toBeInTheDocument();
    // Abbreviated because the column is 80-96px wide; every other surface
    // spells "Entraînement" out.
    expect(screen.getByText('Entraîn.')).toBeInTheDocument();
  });

  it('replaces the numeral with "à confirmer" rather than printing a placeholder kickoff', () => {
    render(<TimeBlock type="MATCH" startsAt="2026-08-12T00:00:00.000Z" timeConfirmed={false} />);

    expect(screen.getByText('à confirmer')).toBeInTheDocument();
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();
    expect(screen.getByText('Match')).toBeInTheDocument();
  });

  it('fills solid for a MATCH and steps down to a bordered surface for a TRAINING', () => {
    const { container: match } = render(
      <TimeBlock type="MATCH" startsAt="2026-08-12T20:00:00.000Z" timeConfirmed />,
    );
    expect(match.firstElementChild).toHaveClass('bg-blue-green');

    const { container: training } = render(
      <TimeBlock type="TRAINING" startsAt="2026-08-12T18:00:00.000Z" timeConfirmed />,
    );
    expect(training.firstElementChild).toHaveClass('bg-surface-2');
  });

  it('keeps an unconfirmed label full-width so it wraps instead of being clipped', () => {
    render(<TimeBlock type="MATCH" startsAt="2026-08-12T00:00:00.000Z" timeConfirmed={false} />);

    // The bug this guards: shrink-to-fit made the two-word label overflow the
    // narrow column and render as a fragment ("ONFIRME").
    expect(screen.getByText('à confirmer')).toHaveClass('w-full', 'break-words');
  });

  it('sets the digits in tabular numerals so a column of times lines up', () => {
    render(<TimeBlock type="MATCH" startsAt="2026-08-12T20:30:00.000Z" timeConfirmed />);
    expect(screen.getByText('20:30')).toHaveClass('tabular');
  });
});
