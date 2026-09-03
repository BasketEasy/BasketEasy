import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatTile } from './StatTile';
import { UsersIcon } from './icons/UsersIcon';

describe('StatTile', () => {
  it('renders the label, the value and the caller-supplied icon', () => {
    const { container } = render(
      <StatTile
        icon={<UsersIcon className="h-4 w-4" data-testid="icon" />}
        label="Joueurs au total"
        value={58}
      />,
    );

    expect(screen.getByText('Joueurs au total')).toBeInTheDocument();
    expect(screen.getByText('58')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="icon"]')).toBeInTheDocument();
  });

  it('renders a zero, which is a real answer, not an empty one', () => {
    render(<StatTile icon={null} label="Clubs administrés" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('sits on a raised card at md and steps down to an inset one at sm', () => {
    const { container: md } = render(<StatTile icon={null} label="Équipes gérées" value={2} />);
    expect(md.firstElementChild).toHaveClass('bg-surface');

    // A small tile is always nested inside an already-raised card, so it has
    // to step down the surface ladder rather than share its parent's ground.
    const { container: sm } = render(
      <StatTile icon={null} label="Matches joués" value={12} size="sm" />,
    );
    expect(sm.firstElementChild).toHaveClass('bg-surface-2');
  });
});
