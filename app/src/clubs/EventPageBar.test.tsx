import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import { EventBackLink, EventPageBar } from './EventPageBar';

describe('EventPageBar', () => {
  it('names the team in the back link and points at the team page', () => {
    renderWithProviders(
      <EventPageBar to="/clubs/c/teams/t?tab=events" state={null} teamName="U15 Filles" />,
    );
    expect(screen.getByRole('link', { name: 'Retour à U15 Filles' })).toHaveAttribute(
      'href',
      '/clubs/c/teams/t?tab=events',
    );
  });

  it('gives the desktop link the team name as its label', () => {
    renderWithProviders(
      <EventBackLink to="/clubs/c/teams/t?tab=events" state={null} teamName="U15 Filles" />,
    );
    expect(screen.getByRole('link', { name: 'U15 Filles' })).toBeInTheDocument();
  });
});
