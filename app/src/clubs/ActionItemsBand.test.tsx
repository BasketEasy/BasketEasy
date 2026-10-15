import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { ActionItem } from '@basketeasy/types/my-dashboard';
import { renderWithProviders } from '../testUtils';
import { ActionItemsBand } from './ActionItemsBand';

function item(overrides: Partial<ActionItem>): ActionItem {
  return {
    kind: 'MATCH_WITHOUT_CONVOCATIONS',
    clubId: 'club-1',
    clubName: 'COC Basket',
    teamId: 'team-1',
    teamName: 'U15 Filles',
    eventId: 'event-1',
    message: 'Un message',
    ...overrides,
  };
}

describe('ActionItemsBand', () => {
  it('renders nothing at all for an empty list', () => {
    const { container } = renderWithProviders(<ActionItemsBand items={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the count and one row per item', () => {
    const items = [
      item({ eventId: 'event-1', message: 'Premier message' }),
      item({
        kind: 'PLAYERS_WITHOUT_ACCOUNT',
        eventId: null,
        teamId: null,
        teamName: null,
        message: 'Second message',
      }),
    ];
    renderWithProviders(<ActionItemsBand items={items} />);

    expect(screen.getByRole('heading', { level: 2, name: 'À traiter (2)' })).toBeInTheDocument();
    expect(screen.getByText('Premier message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
  });
});
