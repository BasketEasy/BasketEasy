import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/health', () =>
    HttpResponse.json({
      status: 'ok',
      info: { database: { status: 'up' } },
      details: { database: { status: 'up' } },
    }),
  ),

  // Default: no session (no refresh cookie) — matches a fresh visitor.
  // Individual tests override this with server.use(...) to simulate a
  // restorable session.
  http.post('/api/auth/refresh', () =>
    HttpResponse.json({ message: 'Missing refresh token' }, { status: 401 }),
  ),

  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 200 })),

  // Default: an empty, fully-read notification feed. Mounted on every
  // protected page (the header bell polls it, and AccountPage's preferences
  // card reads the unread count), so most tests rely on this default rather
  // than stubbing it; notification-focused tests override it with
  // server.use(...).
  http.get('/api/me/notifications', () => HttpResponse.json({ items: [], unreadCount: 0 })),
  http.patch(
    '/api/me/notifications/:notificationId/read',
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.post('/api/me/notifications/read-all', () => new HttpResponse(null, { status: 204 })),

  // Default: nobody to act for — no child linked and no « Moi » persona. The
  // account page reads it for « Mes enfants » / « Accès parents »; guardian
  // tests override it with server.use(...).
  http.get('/api/me/personas', () => HttpResponse.json({ self: null, children: [] })),

  // Default: no VAPID key configured, matching a deployment with no push
  // credentials — NotificationPreferencesCard then hides its push control
  // rather than offering a subscription nothing could deliver to.
  http.get('/api/me/push-subscriptions/public-key', () => HttpResponse.json({ publicKey: null })),

  // The account-security endpoints all answer 204 with no body, whether or
  // not the address exists — see server/src/auth/auth.controller.ts.
  http.post('/api/auth/verify-email/request', () => new HttpResponse(null, { status: 204 })),
  http.post('/api/auth/verify-email/confirm', () => new HttpResponse(null, { status: 204 })),
  http.post('/api/auth/password-reset/request', () => new HttpResponse(null, { status: 204 })),
  http.post('/api/auth/password-reset/confirm', () => new HttpResponse(null, { status: 204 })),

  // Default: no clubs. Tests exercising the nav's per-club links override
  // this with server.use(...).
  http.get('/api/clubs', () => HttpResponse.json([])),

  // Default: an unnamed club. MembersPage always queries this for its
  // "Effectif · {club name}" heading; club-name-focused tests override it
  // with server.use(...).
  http.get('/api/clubs/:clubId', ({ params }) =>
    HttpResponse.json({ id: params.clubId, name: '', ffbbClubCode: null, createdAt: 'x' }),
  ),

  // Default: no teams for any club. RosterPage always queries this (its
  // Équipes tab), so most tests that don't care about teams rely on this
  // default rather than stubbing it individually; team-focused tests
  // override it with server.use(...).
  http.get('/api/clubs/:clubId/teams', () =>
    HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
  ),

  // Default: no events for any team. TeamDetailPage always queries this;
  // event-focused tests override it with server.use(...).
  http.get('/api/clubs/:clubId/teams/:teamId/events', () =>
    HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
  ),

  // Default: no team admins for any team. TeamDetailPage always queries this;
  // team-admin-focused tests override it with server.use(...).
  http.get('/api/clubs/:clubId/teams/:teamId/admins', () => HttpResponse.json([])),

  // Default: no eligible team-admin candidates. TeamDetailPage always queries
  // this to populate the "Ajouter un administrateur" dropdown; team-admin-add
  // focused tests override it with server.use(...).
  http.get('/api/clubs/:clubId/teams/:teamId/admins/eligible', () => HttpResponse.json([])),

  // Default: no FFBB links for any team. TeamDetailPage always queries this
  // (TeamFfbbLinkList); FFBB-focused tests override it with server.use(...).
  http.get('/api/clubs/:clubId/teams/:teamId/ffbb-links', () => HttpResponse.json([])),

  // Default: no meeting point anywhere, the default 45-minute buffer.
  // ClubMeetingPointSettings (MembersPage) and TeamMeetingPointSettings
  // (TeamDetailPage) query these for every admin/manager render.
  http.get('/api/clubs/:clubId/meeting-settings', () =>
    HttpResponse.json({ meetingPoint: null, arrivalBufferMinutes: 45 }),
  ),
  http.get('/api/clubs/:clubId/teams/:teamId/meeting-settings', () =>
    HttpResponse.json({
      meetingPoint: null,
      arrivalBufferMinutes: null,
      clubDefaults: { clubName: '', meetingPoint: null, arrivalBufferMinutes: 45 },
    }),
  ),

  // Default: no FFBB link, matching the ffbb-links default above — renders
  // PouleResultsPanel's empty state (no error code). Poule-focused tests
  // override it with server.use(...).
  http.get('/api/clubs/:clubId/teams/:teamId/ffbb-poule-results', () =>
    HttpResponse.json({ message: 'No FFBB link on this team' }, { status: 404 }),
  ),

  // Default: no votes cast. MatchWinnersCard auto-fetches this for every
  // past MATCH event once its vote window has closed, so any agenda/table
  // view rendering such an event queries it even when the test isn't
  // exercising voting; vote-focused tests override it with server.use(...).
  http.get('/api/clubs/:clubId/teams/:teamId/events/:eventId/votes', () =>
    HttpResponse.json({
      best: [],
      worst: [],
      totalVoters: 0,
      votesCast: 0,
      myVote: { best: null, worst: null },
    }),
  ),

  // Default: no personal teams. MyTeamsPage always queries this; tests
  // exercising it override with server.use(...).
  http.get('/api/me/teams', () => HttpResponse.json([])),

  // Default: empty dashboard summary. DashboardPage always queries this;
  // dashboard-focused tests override it with server.use(...).
  http.get('/api/me/dashboard', () => HttpResponse.json({ totalPlayers: 0, upcomingEvents: [] })),

  // Back-office defaults. The step-up POST succeeds so a test that only cares
  // about what is *behind* the TOTP gate doesn't have to stub it; the reads
  // default to empty so a page under test renders its empty branch unless it
  // overrides them with server.use(...).
  http.post('/api/admin/login', () =>
    HttpResponse.json({
      platformAccessToken: 'platform-token',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      role: 'DATA_OFFICER',
    }),
  ),
  http.get('/api/admin/retention/runs', () => HttpResponse.json([])),
  http.get('/api/admin/users', () =>
    HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 25 }),
  ),
];
