import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventTravelModeControl } from './EventTravelModeControl';
import { computedPlan, matchEvent } from './testEvents';

function renderControl(event = matchEvent()) {
  return renderWithProviders(
    <EventTravelModeControl clubId="club-1" teamId="team-1" event={event} />,
  );
}

describe('EventTravelModeControl', () => {
  it('offers both ways with their hours, the group selected by default', () => {
    renderControl();

    expect(screen.getByRole('radiogroup', { name: /Comment venez-vous/ })).toBeInTheDocument();
    const group = screen.getByRole('radio', { name: /Avec le groupe, au RDV/ });
    expect(group).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('19:15 · Parking salle Coubertin')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Directement à la salle/ })).toHaveTextContent(
      '19:45',
    );
    expect(
      screen.getByText('Sans réponse de votre part, vous comptez avec le groupe au RDV.'),
    ).toBeInTheDocument();
  });

  it('marks the RDV « À confirmer » while its hour is unknown', () => {
    renderControl(
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

    expect(screen.getByText('À confirmer')).toBeInTheDocument();
    expect(screen.getByText(/Vous serez prévenu·e dès qu’elle est fixée/)).toBeInTheDocument();
  });

  it('records « Direct »', async () => {
    let body: unknown;
    server.use(
      http.patch(
        '/api/clubs/club-1/teams/team-1/events/event-1/travel-mode',
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json(matchEvent({ myTravelMode: 'DIRECT' }));
        },
      ),
    );
    const user = userEvent.setup();
    renderControl();

    await user.click(screen.getByRole('radio', { name: /Directement à la salle/ }));

    await waitFor(() => expect(body).toEqual({ travelMode: 'DIRECT' }));
  });

  it('says the choice is coming to a player who has not answered Oui', () => {
    renderControl(matchEvent({ myRsvpStatus: 'MAYBE', myTravelMode: null }));

    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.getByText(/apparaît dès que vous répondez Oui/)).toBeInTheDocument();
  });

  it('is absent when no meeting point is configured', () => {
    const { container } = renderControl(
      matchEvent({
        meetingPlan: { ...computedPlan, meetingPoint: null, meetingPointSource: null },
      }),
    );
    expect(container).toBeEmptyDOMElement();
  });
});
