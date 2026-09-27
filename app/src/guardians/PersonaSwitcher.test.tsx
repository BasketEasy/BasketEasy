import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyPersonas } from '@basketeasy/types/guardians';
import { renderWithProviders } from '../testUtils';
import { ActingAsContext, type ActingAsContextValue } from './useActingAs';
import { PersonaSwitcher } from './PersonaSwitcher';
import { PersonaSheet } from './PersonaSheet';

const personas: MyPersonas = {
  self: { pendingCount: 1, playerIds: ['me'] },
  children: [
    {
      playerId: 'leo',
      firstName: 'Léo',
      lastName: 'Martin',
      clubId: 'club-1',
      clubName: 'ASBC',
      teams: [{ teamId: 'team-1', teamName: 'U11 M' }],
      pendingCount: 2,
    },
  ],
};

function renderSwitcher(overrides: Partial<ActingAsContextValue> = {}) {
  let chosen: string | null | undefined;
  let open = false;
  const value: ActingAsContextValue = {
    forPlayerId: null,
    persona: null,
    personas,
    isReady: true,
    setForPlayerId: (id) => {
      chosen = id;
    },
    isSwitcherOpen: false,
    setSwitcherOpen: (next) => {
      open = next;
    },
    ...overrides,
  };
  const view = renderWithProviders(
    <ActingAsContext.Provider value={value}>
      <PersonaSwitcher />
      <PersonaSheet />
    </ActingAsContext.Provider>,
  );
  return { view, chosen: () => chosen, isOpen: () => open };
}

describe('PersonaSwitcher', () => {
  it('stays hidden with a single persona', () => {
    renderSwitcher({ personas: { self: { pendingCount: 0, playerIds: [] }, children: [] } });
    expect(screen.queryByRole('button', { name: /changer de profil/i })).not.toBeInTheDocument();
  });

  it('counts only the answers the other personas owe', () => {
    renderSwitcher();
    expect(
      screen.getByRole('button', {
        name: 'Changer de profil, actuellement Moi (2 réponses en attente ailleurs)',
      }),
    ).toBeInTheDocument();
  });

  it('opens the sheet', async () => {
    const user = userEvent.setup();
    const { isOpen } = renderSwitcher();
    await user.click(screen.getByRole('button', { name: /changer de profil/i }));
    expect(isOpen()).toBe(true);
  });
});

describe('PersonaSheet', () => {
  it('lists « Moi » and each child, and switches on a pick', async () => {
    const user = userEvent.setup();
    const { chosen } = renderSwitcher({ isSwitcherOpen: true });

    expect(screen.getByRole('radio', { name: /moi/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('2 à répondre')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /léo martin/i }));

    expect(chosen()).toBe('leo');
  });
});
