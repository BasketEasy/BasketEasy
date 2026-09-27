import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import { EventMeetingRows } from './EventMeetingRows';
import { at, computedPlan, matchEvent } from './testEvents';

function renderRows(event = matchEvent(), canManage = false) {
  return renderWithProviders(
    <EventMeetingRows clubId="club-1" teamId="team-1" event={event} canManage={canManage} />,
  );
}

describe('EventMeetingRows', () => {
  it('shows the meeting time and place, and the arrival time', () => {
    renderRows();

    expect(screen.getByText('RDV 19:15 · Parking salle Coubertin')).toBeInTheDocument();
    expect(screen.getByText('Trajet estimé 23 min · 12 rue Coubertin, Nantes')).toBeInTheDocument();
    expect(screen.getByText('Arrivée à la salle · 19:45')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Itinéraire vers le point de rendez-vous' }),
    ).toHaveAttribute('href', expect.stringContaining('12%20rue%20Coubertin'));
    expect(screen.queryByRole('button', { name: 'Ajuster' })).not.toBeInTheDocument();
  });

  it('says « à confirmer » while no travel time is known', () => {
    renderRows(
      matchEvent({
        meetingPlan: {
          ...computedPlan,
          travelMinutes: null,
          travelMinutesSource: null,
          meetsAt: null,
          meetsAtSource: null,
        },
      }),
    );

    expect(screen.getByText('RDV à confirmer · Parking salle Coubertin')).toBeInTheDocument();
    expect(screen.getByText(/Temps de trajet en cours de calcul/)).toBeInTheDocument();
  });

  it('credits the coach for a fixed time', () => {
    renderRows(
      matchEvent({
        meetingPlan: { ...computedPlan, meetsAt: at(18, 45), meetsAtSource: 'OVERRIDE' },
      }),
    );

    expect(screen.getByText('RDV 18:45 · Parking salle Coubertin')).toBeInTheDocument();
    expect(screen.getByText(/Horaire fixé par le coach/)).toBeInTheDocument();
  });

  it('keeps only the arrival row without a meeting point', () => {
    renderRows(
      matchEvent({
        meetingPlan: {
          ...computedPlan,
          meetingPoint: null,
          meetingPointSource: null,
          meetsAt: null,
        },
      }),
      true,
    );

    expect(screen.queryByText(/^RDV/)).not.toBeInTheDocument();
    expect(screen.getByText('Arrivée à la salle · 19:45')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter un RDV' })).toBeInTheDocument();
  });

  it('renders nothing for a training', () => {
    const { container } = renderRows(matchEvent({ type: 'TRAINING', meetingPlan: null }));
    expect(container).toBeEmptyDOMElement();
  });

  it('offers « Ajuster » to a manager', () => {
    renderRows(matchEvent(), true);
    expect(screen.getByRole('button', { name: 'Ajuster' })).toBeInTheDocument();
  });
});
