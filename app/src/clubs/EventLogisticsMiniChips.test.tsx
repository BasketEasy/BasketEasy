import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventLogisticsMiniChips } from './EventLogisticsMiniChips';

describe('EventLogisticsMiniChips', () => {
  it('renders an assigned chip with the abbreviated name and a check mark, labeled "Maillots" for a MATCH event', () => {
    render(
      <EventLogisticsMiniChips
        eventType="MATCH"
        logistics={{
          jerseys: { teamPlayerId: 'tp-1', firstName: 'Léa', lastName: 'Martin' },
          balls: null,
        }}
      />,
    );

    expect(screen.getByText(/Maillots : Léa M\. ✓/)).toBeInTheDocument();
    expect(screen.getByText(/Ballons : non assigné/)).toBeInTheDocument();
  });

  it('labels the jersey slot "Chasubles" for a TRAINING event, with the same "Ballons" copy', () => {
    render(
      <EventLogisticsMiniChips
        eventType="TRAINING"
        logistics={{
          jerseys: { teamPlayerId: 'tp-1', firstName: 'Léa', lastName: 'Martin' },
          balls: null,
        }}
      />,
    );

    expect(screen.getByText(/Chasubles : Léa M\. ✓/)).toBeInTheDocument();
    expect(screen.getByText(/Ballons : non assigné/)).toBeInTheDocument();
  });
});
