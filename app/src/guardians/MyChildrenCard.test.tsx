import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import { MyChildrenCard } from './MyChildrenCard';

describe('MyChildrenCard', () => {
  it('renders the child links without a heading of its own', () => {
    renderWithProviders(
      <MyChildrenCard
        personas={[
          {
            playerId: 'child-1',
            firstName: 'Léo',
            lastName: 'Martin',
            clubId: 'club-1',
            clubName: 'ASBC Rezé',
            teams: [{ teamId: 'team-1', teamName: 'U11 M' }],
            pendingCount: 0,
          },
        ]}
      />,
    );

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Léo Martin' })).toHaveAttribute(
      'href',
      '/children/child-1',
    );
  });
});
