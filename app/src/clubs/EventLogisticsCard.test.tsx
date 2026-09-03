import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { EventConvocationRosterEntry, TeamEvent } from '@basketeasy/types/events';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { EventLogisticsCard } from './EventLogisticsCard';

const roster: EventConvocationRosterEntry[] = [
  {
    teamPlayerId: 'tp-me',
    playerId: 'player-me',
    firstName: 'Lea',
    lastName: 'Bernard',
    role: 'PLAYER',
    convoked: true,
    convokedAt: '2026-01-01T00:00:00.000Z',
    isMe: true,
  },
  {
    teamPlayerId: 'tp-other',
    playerId: 'player-other',
    firstName: 'Nathan',
    lastName: 'Hubert',
    role: 'PLAYER',
    convoked: true,
    convokedAt: '2026-01-01T00:00:00.000Z',
    isMe: false,
  },
];

function baseEvent(overrides: Partial<TeamEvent> = {}): TeamEvent {
  return {
    id: 'event-1',
    teamId: 'team-1',
    type: 'MATCH',
    startsAt: '2026-08-30T18:00:00.000Z',
    location: 'Gymnase A',
    notes: null,
    opponentName: 'ES Rezé',
    venue: 'HOME',
    recurrenceId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    myRsvpStatus: null,
    myConvocation: false,
    rsvpSummary: { rosterSize: 0, convoked: 0, answering: 0, going: 0, maybe: 0, notGoing: 0, pending: 0, isConvocationScoped: false },
    isImported: false,
    timeConfirmed: true,
    logistics: { jerseys: null, balls: null },
    ...overrides,
  };
}

function mockRoster() {
  server.use(
    http.get('/api/clubs/club-1/teams/team-1/events/event-1/convocations', () =>
      HttpResponse.json(roster),
    ),
  );
}

function mockLogisticsPatch() {
  let requestBody: unknown;
  server.use(
    http.patch('/api/clubs/club-1/teams/team-1/events/event-1/logistics', async ({ request }) => {
      requestBody = await request.json();
      return HttpResponse.json(baseEvent());
    }),
  );
  return () => requestBody;
}

describe('EventLogisticsCard', () => {
  it('labels the jersey slot "Maillots" for a MATCH event and "Chasubles" for a TRAINING event', async () => {
    mockRoster();
    const { unmount } = renderWithProviders(
      <EventLogisticsCard
        clubId="club-1"
        teamId="team-1"
        event={baseEvent({ type: 'MATCH' })}
        canManage={false}
        isRostered
      />,
    );
    expect(await screen.findByText('Maillots')).toBeInTheDocument();
    expect(screen.queryByText('Chasubles')).not.toBeInTheDocument();
    unmount();

    renderWithProviders(
      <EventLogisticsCard
        clubId="club-1"
        teamId="team-1"
        event={baseEvent({ type: 'TRAINING' })}
        canManage={false}
        isRostered
      />,
    );
    expect(await screen.findByText('Chasubles')).toBeInTheDocument();
    expect(screen.queryByText('Maillots')).not.toBeInTheDocument();
    // "Ballons" copy is identical for both event types.
    expect(screen.getAllByText('Ballons').length).toBeGreaterThan(0);
  });

  it('shows the unassigned state with a self-assign button for a rostered member', async () => {
    mockRoster();
    const getBody = mockLogisticsPatch();
    const user = userEvent.setup();

    renderWithProviders(
      <EventLogisticsCard
        clubId="club-1"
        teamId="team-1"
        event={baseEvent()}
        canManage={false}
        isRostered
      />,
    );

    await screen.findAllByText('Non assigné');
    const selfAssignButtons = screen.getAllByRole('button', { name: /je m.en occupe/i });
    expect(selfAssignButtons).toHaveLength(2);

    await user.click(selfAssignButtons[0]);

    await waitFor(() => expect(getBody()).toEqual({ field: 'JERSEYS', teamPlayerId: 'tp-me' }));
  });

  it('hides the self-assign button for a non-rostered viewer', async () => {
    mockRoster();

    renderWithProviders(
      <EventLogisticsCard
        clubId="club-1"
        teamId="team-1"
        event={baseEvent()}
        canManage={false}
        isRostered={false}
      />,
    );

    await screen.findAllByText('Non assigné');
    expect(screen.queryByRole('button', { name: /je m.en occupe/i })).not.toBeInTheDocument();
  });

  it('shows "Changer" for the current assignee and lets them clear their own assignment', async () => {
    mockRoster();
    const getBody = mockLogisticsPatch();
    const user = userEvent.setup();

    renderWithProviders(
      <EventLogisticsCard
        clubId="club-1"
        teamId="team-1"
        event={baseEvent({
          logistics: {
            jerseys: { teamPlayerId: 'tp-me', firstName: 'Lea', lastName: 'Bernard' },
            balls: null,
          },
        })}
        canManage={false}
        isRostered
      />,
    );

    const changeButton = await screen.findByRole('button', { name: 'Changer' });
    await user.click(changeButton);

    const select = screen.getByRole('combobox', { name: /assigné/i });
    await user.click(select);
    await user.click(await screen.findByRole('option', { name: 'Non assigné' }));

    await waitFor(() => expect(getBody()).toEqual({ field: 'JERSEYS', teamPlayerId: null }));
  });

  it('hides "Changer" from a non-manager who is not the current assignee', async () => {
    mockRoster();

    renderWithProviders(
      <EventLogisticsCard
        clubId="club-1"
        teamId="team-1"
        event={baseEvent({
          logistics: {
            jerseys: { teamPlayerId: 'tp-other', firstName: 'Nathan', lastName: 'Hubert' },
            balls: null,
          },
        })}
        canManage={false}
        isRostered
      />,
    );

    await screen.findByText('Nathan Hubert');
    expect(screen.queryByRole('button', { name: 'Changer' })).not.toBeInTheDocument();
  });

  it('lets a manager reassign to a teammate who is not the caller', async () => {
    mockRoster();
    const getBody = mockLogisticsPatch();
    const user = userEvent.setup();

    renderWithProviders(
      <EventLogisticsCard
        clubId="club-1"
        teamId="team-1"
        event={baseEvent({
          logistics: {
            jerseys: { teamPlayerId: 'tp-other', firstName: 'Nathan', lastName: 'Hubert' },
            balls: null,
          },
        })}
        canManage
        isRostered={false}
      />,
    );

    await screen.findByText('Nathan Hubert');
    await user.click(screen.getByRole('button', { name: 'Changer' }));

    const select = screen.getByRole('combobox', { name: /assigné/i });
    await user.click(select);
    await user.click(await screen.findByRole('option', { name: 'Lea Bernard' }));

    await waitFor(() => expect(getBody()).toEqual({ field: 'JERSEYS', teamPlayerId: 'tp-me' }));
  });
});
