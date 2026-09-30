import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import { EventMatchTimeline } from './EventMatchTimeline';
import { at, computedPlan, matchEvent } from './testEvents';

function renderTimeline(event = matchEvent(), canManage = false) {
  return renderWithProviders(
    <EventMatchTimeline
      clubId="club-1"
      teamId="team-1"
      event={event}
      plan={event.meetingPlan!}
      canManage={canManage}
    />,
  );
}

describe('EventMatchTimeline', () => {
  it('lays the match day out as three hours: RDV, arrival, tip-off', () => {
    renderTimeline();

    const steps = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining('19:15RDV · Parking salle Coubertin'),
      expect.stringContaining('19:45Arrivée · Salle des Sports, Rezé'),
      expect.stringContaining('20:30Coup d’envoi'),
    ]);
    expect(screen.getByText('Trajet estimé 23 min en voiture')).toBeInTheDocument();
    expect(screen.getByText('45 min avant le coup d’envoi')).toBeInTheDocument();
    expect(screen.getByText('vs Rezé BC')).toBeInTheDocument();
  });

  it('names the gym when a manager gave one', () => {
    renderTimeline(matchEvent({ locationName: 'Salle Coubertin' }));
    expect(screen.getByText('Arrivée · Salle Coubertin')).toBeInTheDocument();
  });

  it('says « Salle à confirmer » while the venue is unknown, with no button', () => {
    renderTimeline(matchEvent({ location: 'Lieu non communiqué' }), true);

    expect(screen.getByText('Arrivée · Salle à confirmer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lieu/i })).not.toBeInTheDocument();
  });

  it('gives a player directions to the RDV, leaving the gym’s to the hero', () => {
    renderTimeline();

    expect(screen.getByRole('link', { name: 'Itinéraire vers le RDV' })).toHaveAttribute(
      'href',
      expect.stringContaining('12%20rue%20Coubertin'),
    );
    expect(
      screen.queryByRole('link', { name: 'Itinéraire vers la salle' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajuster le RDV' })).not.toBeInTheDocument();
  });

  it('shows a manager where the RDV comes from, and the adjust action', () => {
    renderTimeline(matchEvent(), true);

    expect(screen.getByText('Déroulé du match')).toBeInTheDocument();
    expect(screen.getByText('RDV du club')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajuster le RDV' })).toBeInTheDocument();
  });

  it('credits the coach for a fixed hour', () => {
    renderTimeline(
      matchEvent({
        meetingPlan: { ...computedPlan, meetsAt: at(18, 45), meetsAtSource: 'OVERRIDE' },
      }),
    );

    expect(screen.getByText('18:45')).toBeInTheDocument();
    expect(screen.getByText('Horaire fixé par le coach')).toBeInTheDocument();
  });

  it('says « à confirmer » while no travel time is known', () => {
    renderTimeline(
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

    expect(screen.getByText('--:--')).toBeInTheDocument();
    expect(screen.getByText('Horaire à confirmer')).toBeInTheDocument();
  });

  it('drops the RDV step without a meeting point', () => {
    renderTimeline(
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

    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Ajouter un RDV' })).toBeInTheDocument();
  });
});
