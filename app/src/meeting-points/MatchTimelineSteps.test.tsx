import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchTimelineSteps } from './MatchTimelineSteps';
import { at, computedPlan } from './testEvents';

function renderSteps(props: Partial<Parameters<typeof MatchTimelineSteps>[0]> = {}) {
  return render(
    <MatchTimelineSteps
      plan={computedPlan}
      location="12 rue du Vigneau, Rezé"
      locationName="Gymnase du Vigneau"
      startsAt={at(20, 30)}
      opponentName="ESB Rezé"
      canManage={false}
      {...props}
    />,
  );
}

describe('MatchTimelineSteps', () => {
  it('names the gym on the arrival step', () => {
    renderSteps();
    expect(screen.getByText('Arrivée · Gymnase du Vigneau')).toBeInTheDocument();
  });

  it('reads « Salle à confirmer » while the venue is unknown, with no directions', () => {
    renderSteps({ location: 'Lieu non communiqué', locationName: null });
    expect(screen.getByText('Arrivée · Salle à confirmer')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Itinéraire vers la salle' })).toBeNull();
  });

  it('shows the venue directions by default and hides them on request', () => {
    const { unmount } = renderSteps();
    expect(screen.getByRole('link', { name: 'Itinéraire vers la salle' })).toBeInTheDocument();
    unmount();
    renderSteps({ showVenueItinerary: false });
    expect(screen.queryByRole('link', { name: 'Itinéraire vers la salle' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Itinéraire vers le RDV' })).toBeInTheDocument();
  });
});
