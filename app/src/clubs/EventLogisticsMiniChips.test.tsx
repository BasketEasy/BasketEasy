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

  const holder = { teamPlayerId: 'tp-1', firstName: 'Emma', lastName: 'Moreau' };
  const noLogistics = { jerseys: null, balls: null };

  it('reads « Vous lavez les maillots » when the reader holds the wash', () => {
    render(
      <EventLogisticsMiniChips
        eventType="MATCH"
        logistics={noLogistics}
        jerseyDuty={{ holder, status: 'ACCEPTED', broughtBy: null, isMine: true }}
      />,
    );
    expect(screen.getByText('Vous lavez les maillots')).toBeInTheDocument();
  });

  it('names the holder of the wash, or says it is unassigned', () => {
    const { rerender } = render(
      <EventLogisticsMiniChips
        eventType="MATCH"
        logistics={noLogistics}
        jerseyDuty={{ holder, status: 'ASSIGNED', broughtBy: null, isMine: false }}
      />,
    );
    expect(screen.getByText('Lavage : Emma M. ✓')).toBeInTheDocument();

    rerender(
      <EventLogisticsMiniChips
        eventType="MATCH"
        logistics={noLogistics}
        jerseyDuty={{ holder: null, status: 'UNASSIGNED', broughtBy: null, isMine: false }}
      />,
    );
    expect(screen.getByText('Lavage : non assigné')).toBeInTheDocument();
    expect(screen.queryByText(/Maillots :/)).not.toBeInTheDocument();
  });
});
