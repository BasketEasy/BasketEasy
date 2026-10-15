import { describe, expect, it } from 'vitest';
import { List } from '@basketeasy/ui/list';
import { screen } from '@testing-library/react';
import type { AppNotification } from '@basketeasy/types/notifications';
import { renderWithProviders } from '../testUtils';
import { NotificationItem } from './NotificationItem';

const notification: AppNotification = {
  id: 'n1',
  type: 'EVENT_CONVOCATION',
  title: 'Léo est convoqué·e — U11 M',
  body: 'Léo est convoqué·e pour le match…',
  deepLink: '/clubs/club-1/teams/team-1/events/event-1?pour=leo',
  subjectFirstName: 'Léo',
  readAt: null,
  createdAt: new Date().toISOString(),
};

describe('NotificationItem', () => {
  it('tags a notification about a child with the child’s name', () => {
    renderWithProviders(
      <List>
        <NotificationItem notification={notification} onRead={() => undefined} />
      </List>,
    );

    expect(screen.getByText('Léo', { selector: 'span, div' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Pour Léo : Léo est convoqué·e — U11 M (non lue)' }),
    ).toHaveAttribute('href', '/clubs/club-1/teams/team-1/events/event-1?pour=leo');
  });

  it('has no tag on a notification about the reader', () => {
    renderWithProviders(
      <List>
        <NotificationItem
          notification={{ ...notification, subjectFirstName: null, title: 'Vous êtes convoqué·e' }}
          onRead={() => undefined}
        />
      </List>,
    );

    expect(
      screen.getByRole('link', { name: 'Vous êtes convoqué·e (non lue)' }),
    ).toBeInTheDocument();
  });

  it('leads with a type icon at comfortable density only', () => {
    const comfortable = renderWithProviders(
      <NotificationItem notification={notification} onRead={() => undefined} />,
    );
    expect(comfortable.container.querySelector('svg')).not.toBeNull();
    comfortable.unmount();

    const compact = renderWithProviders(
      <NotificationItem notification={notification} onRead={() => undefined} density="compact" />,
    );
    expect(compact.container.querySelector('svg')).toBeNull();
  });

  it('gives the jersey duty types their own icon', () => {
    const iconOf = (type: AppNotification['type']) => {
      const view = renderWithProviders(
        <NotificationItem notification={{ ...notification, type }} onRead={() => undefined} />,
      );
      const markup = view.container.querySelector('svg')?.innerHTML;
      view.unmount();
      return markup;
    };

    const assigned = iconOf('JERSEY_DUTY_ASSIGNED');
    const swap = iconOf('JERSEY_SWAP_REQUESTED');
    expect(assigned).toBeTruthy();
    expect(swap).toBeTruthy();
    expect(assigned).not.toBe(swap);
    expect(assigned).not.toBe(iconOf('EVENT_CONVOCATION'));
  });
});
