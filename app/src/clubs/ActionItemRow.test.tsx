import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { ActionItem } from '@basketeasy/types/my-dashboard';
import { renderWithProviders } from '../testUtils';
import { ActionItemRow } from './ActionItemRow';

const base: ActionItem = {
  kind: 'MATCH_WITHOUT_CONVOCATIONS',
  clubId: 'club-1',
  clubName: 'COC Basket',
  teamId: 'team-1',
  teamName: 'U15 Filles',
  eventId: 'event-1',
  message: "Match contre l'ES Rezé samedi — personne n'a encore été convoqué.",
};

describe('ActionItemRow', () => {
  it('always renders the server-formed message verbatim', () => {
    renderWithProviders(<ActionItemRow item={base} />);

    expect(screen.getByText(base.message)).toBeInTheDocument();
  });

  it('embeds the convocation modal for MATCH_WITHOUT_CONVOCATIONS', () => {
    renderWithProviders(<ActionItemRow item={base} />);

    expect(screen.getByRole('button', { name: 'Convoquer le groupe' })).toBeInTheDocument();
  });

  it('links to the event page for EVENT_PENDING_RSVPS', () => {
    const item: ActionItem = { ...base, kind: 'EVENT_PENDING_RSVPS', message: '2 en attente' };
    renderWithProviders(<ActionItemRow item={item} />);

    expect(screen.getByRole('link', { name: /voir les réponses/i })).toHaveAttribute(
      'href',
      '/clubs/club-1/teams/team-1/events/event-1',
    );
  });

  it('links to the event page for MATCH_WITHOUT_CONFIRMED_SCORESHEET', () => {
    const item: ActionItem = {
      ...base,
      kind: 'MATCH_WITHOUT_CONFIRMED_SCORESHEET',
      message: 'Feuille non confirmée',
    };
    renderWithProviders(<ActionItemRow item={item} />);

    expect(screen.getByRole('link', { name: /importer la feuille de match/i })).toHaveAttribute(
      'href',
      '/clubs/club-1/teams/team-1/events/event-1',
    );
  });

  it('links to the members Joueurs tab for PLAYERS_WITHOUT_ACCOUNT', () => {
    const item: ActionItem = {
      kind: 'PLAYERS_WITHOUT_ACCOUNT',
      clubId: 'club-1',
      clubName: 'COC Basket',
      teamId: null,
      teamName: null,
      eventId: null,
      message: "Jeanne Martin n'a pas encore de compte Kluvo.",
    };
    renderWithProviders(<ActionItemRow item={item} />);

    expect(screen.getByRole('link', { name: /voir les joueurs/i })).toHaveAttribute(
      'href',
      '/clubs/club-1/members?tab=players',
    );
  });
});
