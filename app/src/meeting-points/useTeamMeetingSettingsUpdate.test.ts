import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useTeamMeetingSettingsUpdate } from './useTeamMeetingSettingsUpdate';

describe('useTeamMeetingSettingsUpdate', () => {
  it('stores the new settings and invalidates every event of the team', async () => {
    const saved = {
      meetingPoint: { name: 'Parking', address: '1 rue X' },
      arrivalBufferMinutes: null,
      clubDefaults: { clubName: 'BC', meetingPoint: null, arrivalBufferMinutes: 45 },
    };
    server.use(
      http.patch('/api/clubs/club-1/teams/team-1/meeting-settings', () => HttpResponse.json(saved)),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const listKey = ['clubs', 'club-1', 'teams', 'team-1', 'events', {}];
    const eventKey = ['clubs', 'club-1', 'teams', 'team-1', 'events', 'event-1'];
    queryClient.setQueryData(listKey, { items: [] });
    queryClient.setQueryData(eventKey, { id: 'event-1' });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useTeamMeetingSettingsUpdate('club-1', 'team-1'), {
      wrapper,
    });
    result.current.mutate({ meetingPoint: saved.meetingPoint, arrivalBufferMinutes: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      queryClient.getQueryData(['clubs', 'club-1', 'teams', 'team-1', 'meeting-settings']),
    ).toEqual(saved);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(eventKey)?.isInvalidated).toBe(true);
  });
});
