import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventTravelModeControl } from './EventTravelModeControl';
import { computedPlan, matchEvent } from './testEvents';

describe('EventTravelModeControl', () => {
  it('offers both ways, with the meeting point selected by default', () => {
    renderWithProviders(
      <EventTravelModeControl clubId="club-1" teamId="team-1" event={matchEvent()} />,
    );

    expect(screen.getByRole('radiogroup', { name: /Comment venez-vous/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Au rendez-vous/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('19:15 · Parking salle Coubertin')).toBeInTheDocument();
    expect(screen.getByText('Arrivée 19:45')).toBeInTheDocument();
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
    renderWithProviders(
      <EventTravelModeControl clubId="club-1" teamId="team-1" event={matchEvent()} />,
    );

    await user.click(screen.getByRole('radio', { name: /Direct à la salle/ }));

    await waitFor(() => expect(body).toEqual({ travelMode: 'DIRECT' }));
  });

  it('is absent for a player who is not coming', () => {
    const { container } = renderWithProviders(
      <EventTravelModeControl
        clubId="club-1"
        teamId="team-1"
        event={matchEvent({ myRsvpStatus: 'MAYBE', myTravelMode: null })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('is absent when no meeting point is configured', () => {
    renderWithProviders(
      <EventTravelModeControl
        clubId="club-1"
        teamId="team-1"
        event={matchEvent({
          meetingPlan: { ...computedPlan, meetingPoint: null, meetingPointSource: null },
        })}
      />,
    );
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});
