import { useLocation } from 'react-router-dom';

export type TeamOrigin =
  { from: 'members'; clubId: string } | { from: 'my-teams' } | { from: 'dashboard' };

const FALLBACK = { to: '/my-teams', label: '← Mes équipes' } as const;

/**
 * Resolves where "back" should go from a team page. The link used to be
 * hardcoded to /my-teams regardless of entry path, so a club admin who
 * arrived via Effectif → Équipes → Voir was sent to a page they had never
 * visited, losing their table position and filters. State is absent on a
 * direct link or a refresh, hence the fallback.
 */
export function useBackLink(): { to: string; label: string } {
  const origin = (useLocation().state as { origin?: TeamOrigin } | null)?.origin;
  if (!origin) return { ...FALLBACK };
  if (origin.from === 'members') {
    return { to: `/clubs/${origin.clubId}/members?tab=teams`, label: '← Effectif du club' };
  }
  if (origin.from === 'dashboard') return { to: '/dashboard', label: '← Tableau de bord' };
  return { ...FALLBACK };
}
