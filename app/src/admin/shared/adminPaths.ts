/**
 * Every back-office route that shows one record. The only place these paths
 * are spelled, so a link and the route it opens can't drift apart.
 */
export const adminPaths = {
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
} as const;
