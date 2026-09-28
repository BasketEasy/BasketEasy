import type { AdminSearchKind } from '@basketeasy/types/platform-admin-search';

/**
 * Every back-office route that shows one record. The only place these paths
 * are spelled, so a link and the route it opens can't drift apart.
 */
export const adminPaths = {
  dashboard: '/admin',
  clubs: '/admin/clubs',
  club: (id: string) => `/admin/clubs/${id}`,
  teams: '/admin/teams',
  team: (id: string) => `/admin/teams/${id}`,
  users: '/admin/users',
  user: (id: string) => `/admin/users/${id}`,
  players: '/admin/players',
  player: (id: string) => `/admin/players/${id}`,
  events: '/admin/events',
  event: (id: string) => `/admin/events/${id}`,
  scoresheets: '/admin/scoresheets',
  retention: '/admin/retention',
  auditLog: '/admin/audit-log',
  search: '/admin/search',
} as const;

/** The record page a search hit opens. */
export function adminPathOf(hit: { kind: AdminSearchKind; id: string }): string {
  switch (hit.kind) {
    case 'club':
      return adminPaths.club(hit.id);
    case 'team':
      return adminPaths.team(hit.id);
    case 'user':
      return adminPaths.user(hit.id);
    case 'player':
      return adminPaths.player(hit.id);
    case 'event':
      return adminPaths.event(hit.id);
  }
}
