import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../testUtils';
import { AdminShell } from './AdminShell';
import { clearPlatformSession, startPlatformSession } from './platformSession';

function renderShell(role: 'SUPPORT' | 'DATA_OFFICER') {
  startPlatformSession('platform-token', new Date(Date.now() + 15 * 60 * 1000).toISOString(), role);
  return renderWithProviders(<AdminShell />, { route: '/admin/clubs' });
}

describe('AdminShell', () => {
  afterEach(() => clearPlatformSession());

  it('offers a DATA_OFFICER every section, the audit log included', () => {
    renderShell('DATA_OFFICER');

    const nav = within(screen.getByRole('navigation', { name: 'Back-office' }));
    expect(nav.getByRole('link', { name: 'Utilisateurs' })).toHaveAttribute('href', '/admin/users');
    expect(nav.getByRole('link', { name: 'Journal d’audit' })).toBeInTheDocument();
  });

  it('hides the DATA_OFFICER-only audit log from SUPPORT', () => {
    renderShell('SUPPORT');

    const nav = within(screen.getByRole('navigation', { name: 'Back-office' }));
    expect(nav.getByRole('link', { name: 'Clubs' })).toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'Journal d’audit' })).not.toBeInTheDocument();
  });
});
