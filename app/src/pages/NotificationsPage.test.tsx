import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { AppNotification } from '@basketeasy/types/notifications';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { NotificationsPage } from './NotificationsPage';

const unread: AppNotification = {
  id: 'notif-1',
  type: 'EVENT_CONVOCATION',
  title: 'Vous êtes convoqué·e — U15 M',
  body: 'Match contre ASVEL, samedi 12 septembre à 20:30.',
  deepLink: '/clubs/club-1/teams/team-1/events/event-1',
  subjectFirstName: null,
  readAt: null,
  createdAt: new Date().toISOString(),
};

function mockFeed(items: AppNotification[], unreadCount: number) {
  server.use(http.get('/api/me/notifications', () => HttpResponse.json({ items, unreadCount })));
}

describe('NotificationsPage', () => {
  it('has one h1 and counts the unread notifications in its meta line', async () => {
    mockFeed([unread, { ...unread, id: 'notif-2' }], 2);

    renderWithProviders(<NotificationsPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
    expect(await screen.findByText('2 non lues')).toBeInTheDocument();
  });

  it('marks everything read from the header action', async () => {
    mockFeed([unread], 1);
    let called = false;
    server.use(
      http.post('/api/me/notifications/read-all', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<NotificationsPage />);

    expect(await screen.findByText('1 non lue')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));
    await waitFor(() => expect(called).toBe(true));
  });

  it('says everything is read and drops the action when nothing is unread', async () => {
    mockFeed([{ ...unread, readAt: new Date().toISOString() }], 0);

    renderWithProviders(<NotificationsPage />);

    expect(await screen.findByText('Tout est lu')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tout marquer comme lu' })).not.toBeInTheDocument();
  });
});
