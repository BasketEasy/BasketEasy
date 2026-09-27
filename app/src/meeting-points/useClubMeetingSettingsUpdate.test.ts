import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useClubMeetingSettingsUpdate } from './useClubMeetingSettingsUpdate';

describe('useClubMeetingSettingsUpdate', () => {
  it('invalidates team events and team settings, not the rest of the club’s team data', async () => {
    const saved = {
      meetingPoint: { name: 'Parking', address: '1 rue X' },
      arrivalBufferMinutes: 45,
    };
    server.use(http.patch('/api/clubs/club-1/meeting-settings', () => HttpResponse.json(saved)));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const eventsKey = ['clubs', 'club-1', 'teams', 'team-1', 'events', {}];
    const teamSettingsKey = ['clubs', 'club-1', 'teams', 'team-1', 'meeting-settings'];
    const rosterKey = ['clubs', 'club-1', 'teams', 'team-1', 'players', {}];
    const otherClubEventsKey = ['clubs', 'club-2', 'teams', 'team-9', 'events', {}];
    for (const key of [eventsKey, teamSettingsKey, rosterKey, otherClubEventsKey]) {
      queryClient.setQueryData(key, {});
    }
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useClubMeetingSettingsUpdate('club-1'), { wrapper });
    result.current.mutate(saved);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(['clubs', 'club-1', 'meeting-settings'])).toEqual(saved);
    expect(queryClient.getQueryState(eventsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(teamSettingsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(rosterKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(otherClubEventsKey)?.isInvalidated).toBe(false);
  });
});
