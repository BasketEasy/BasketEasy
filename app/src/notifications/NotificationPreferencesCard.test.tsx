import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import { NotificationPreferencesCard } from './NotificationPreferencesCard';

describe('NotificationPreferencesCard', () => {
  it('renders the controls without a heading of its own', () => {
    renderWithProviders(<NotificationPreferencesCard />);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voir mes notifications/i })).toBeInTheDocument();
  });
});
