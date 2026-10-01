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
});
