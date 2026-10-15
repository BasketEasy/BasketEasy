import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AvatarGroup } from './AvatarGroup';

const SQUAD = [
  { firstName: 'Camille', lastName: 'Roussel' },
  { firstName: 'Sarah', lastName: 'Diallo' },
  { firstName: 'Maya', lastName: 'Gomez' },
  { firstName: 'Alice', lastName: 'Tran' },
  { firstName: 'Léa', lastName: 'Moreau' },
  { firstName: 'Inès', lastName: 'Berger' },
];

describe('AvatarGroup', () => {
  it('names the people it shows and how many it does not', () => {
    render(<AvatarGroup people={SQUAD} />);

    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Camille Roussel, Sarah Diallo, Maya Gomez, Alice Tran, 2 autres',
    );
  });

  it('collapses everyone past `max` into a single +N chip', () => {
    render(<AvatarGroup people={SQUAD} max={2} />);

    expect(screen.getByText('+4')).toBeInTheDocument();
    expect(screen.getByText('CR')).toBeInTheDocument();
    expect(screen.getByText('SD')).toBeInTheDocument();
    expect(screen.queryByText('MG')).not.toBeInTheDocument();
  });

  it('draws no chip when everyone fits', () => {
    render(<AvatarGroup people={SQUAD.slice(0, 3)} max={4} />);

    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Camille Roussel, Sarah Diallo, Maya Gomez',
    );
  });

  it('says "1 autre" rather than "1 autres" for a single hidden person', () => {
    render(<AvatarGroup people={SQUAD.slice(0, 3)} max={2} />);

    expect(screen.getByRole('img')).toHaveAccessibleName('Camille Roussel, Sarah Diallo, 1 autre');
  });

  it('stays a labelled graphic when there is nobody at all', () => {
    render(<AvatarGroup people={[]} />);

    expect(screen.getByRole('img')).toHaveAccessibleName('Personne');
  });
});
