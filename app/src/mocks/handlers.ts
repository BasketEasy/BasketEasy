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

  // Default: no clubs. Tests exercising the nav's per-club links override
  // this with server.use(...).
  http.get('/api/clubs', () => HttpResponse.json([])),

  // Default: no teams for any club. RosterPage always queries this (its
  // Équipes tab), so most tests that don't care about teams rely on this
  // default rather than stubbing it individually; team-focused tests
  // override it with server.use(...).
  http.get('/api/clubs/:clubId/teams', () => HttpResponse.json([])),

  // Default: no events for any team. TeamDetailPage always queries this;
  // event-focused tests override it with server.use(...).
  http.get('/api/clubs/:clubId/teams/:teamId/events', () => HttpResponse.json([])),
];
