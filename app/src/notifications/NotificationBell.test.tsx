import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../testUtils';
import { NotificationBell } from './NotificationBell';

const convocation = {
  id: 'notif-1',
  type: 'EVENT_CONVOCATION' as const,
  title: 'Vous êtes convoqué·e — U15 M',
  body: 'Match contre ASVEL, samedi 12 septembre à 20:30.',
  deepLink: '/clubs/club-1/teams/team-1/events/event-1',
  readAt: null,
  createdAt: new Date().toISOString(),
};

function mockNotifications(items: (typeof convocation)[], unreadCount: number) {
  server.use(http.get('/api/me/notifications', () => HttpResponse.json({ items, unreadCount })));
}

describe('NotificationBell', () => {
  it('folds the unread count into the trigger’s accessible name', async () => {
    mockNotifications([convocation], 3);

    renderWithProviders(<NotificationBell />);

    // The pip itself is aria-hidden, so the number has to reach assistive
    // tech through the button's name — not as loose text inside it.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Notifications (3 non lues)' }),
      ).toBeInTheDocument(),
    );
  });

  it('names the trigger plainly when nothing is unread', async () => {
    mockNotifications([], 0);

    renderWithProviders(<NotificationBell />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument(),
    );
  });

  it('lists notifications as links to their deep link', async () => {
    mockNotifications([convocation], 1);
    const user = userEvent.setup();

    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));

    const link = await screen.findByRole('link', {
      name: 'Vous êtes convoqué·e — U15 M (non lue)',
    });
    expect(link).toHaveAttribute('href', '/clubs/club-1/teams/team-1/events/event-1');
  });

  it('marks a notification read when it is followed', async () => {
    mockNotifications([convocation], 1);
    const readCalls: string[] = [];
    server.use(
      http.patch('/api/me/notifications/:notificationId/read', ({ params }) => {
        readCalls.push(String(params.notificationId));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();

    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: /Notifications/ }));
    await user.click(await screen.findByRole('link', { name: /Vous êtes convoqué·e/ }));

    await waitFor(() => expect(readCalls).toEqual(['notif-1']));
  });

  it('offers "tout marquer comme lu" only while something is unread', async () => {
    mockNotifications([{ ...convocation, readAt: new Date().toISOString() }], 0);
    const user = userEvent.setup();

    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));

    expect(screen.queryByRole('button', { name: /Tout marquer comme lu/ })).not.toBeInTheDocument();
  });

  it('shows an error branch, not an empty state, when the feed fails to load', async () => {
    server.use(
      http.get('/api/me/notifications', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();

    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));

    // Telling a player their convocations don't exist when they merely
    // failed to load is the specific failure this branch prevents.
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Notifications indisponibles/)).toBeInTheDocument();
    expect(screen.queryByText('Aucune notification')).not.toBeInTheDocument();
  });

  it('shows the empty state when there is genuinely nothing', async () => {
    mockNotifications([], 0);
    const user = userEvent.setup();

    renderWithProviders(<NotificationBell />);
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));

    expect(await screen.findByText('Aucune notification')).toBeInTheDocument();
  });
});
