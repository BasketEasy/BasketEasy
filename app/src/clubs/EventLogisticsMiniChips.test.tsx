import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventLogisticsMiniChips } from './EventLogisticsMiniChips';

describe('EventLogisticsMiniChips', () => {
  it('renders nothing for a TRAINING event (logistics null)', () => {
    const { container } = render(<EventLogisticsMiniChips logistics={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an assigned chip with the abbreviated name and a check mark', () => {
    render(
      <EventLogisticsMiniChips
        logistics={{
          jerseys: { teamPlayerId: 'tp-1', firstName: 'Léa', lastName: 'Martin' },
          balls: null,
        }}
      />,
    );

    expect(screen.getByText(/Maillots : Léa M\. ✓/)).toBeInTheDocument();
    expect(screen.getByText(/Ballons : non assigné/)).toBeInTheDocument();
  });
});
