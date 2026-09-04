#!/usr/bin/env node
// Minimal standalone HTTP server that stands in for the NestJS API when
// there's no live Postgres/Docker to run the real backend against (see
// CLAUDE.md's "Screenshots" convention). Serves the same default shapes as
// app/src/mocks/handlers.ts (MSW, used by Vitest) so a screen renders its
// empty/default state out of the box; pass --fixtures to override specific
// routes with scenario-specific data for a screenshot.
//
// Usage:
//   node scripts/mock-api-server.mjs [--port 3000] [--fixtures ./fixtures.json]
//
// Then point Vite's dev server proxy at it (default target is already
// http://localhost:3000, see app/vite.config.ts) and drive it with Playwright.
//
// Reusable fixtures for common scenarios (an authenticated admin session, a
// populated roster, etc.) live under scripts/fixtures/ — check there before
// hand-rolling a new fixtures file. `authenticated-admin-session.json` is the
// base session/club bootstrap most authenticated-screen screenshots need;
// copy it as a starting point for a new scenario-specific fixture (this
// server loads exactly one --fixtures file, so a scenario file repeats the
// session block rather than composing several files).
//
// Fixtures file format — a flat JSON object keyed by "METHOD /path", path
// matched literally (including any resolved ids), e.g.:
//   {
//     "GET /api/clubs/club-1": { "id": "club-1", "name": "ASC Nantes", "ffbbClubCode": null, "createdAt": "2026-01-01" },
//     "GET /api/clubs/club-1/teams": { "items": [{ "id": "team-1", "name": "Seniors M" }], "total": 1, "page": 1, "pageSize": 25 }
//   }
// A fixture entry's value may also be { "status": 404, "body": { ... } } to
// mock an error response.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

function parseArgs(argv) {
  const args = { port: 3000, fixtures: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') args.port = Number(argv[++i]);
    else if (argv[i] === '--fixtures') args.fixtures = argv[++i];
  }
  return args;
}

function loadFixtures(path) {
  if (!path) return {};
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// Express-style path matcher: '/api/clubs/:clubId/teams/:teamId' -> regex + param names.
function compile(pattern) {
  const paramNames = [];
  const regex = new RegExp(
    '^' +
      pattern
        .split('/')
        .map((segment) => {
          if (segment.startsWith(':')) {
            paramNames.push(segment.slice(1));
            return '([^/]+)';
          }
          return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/') +
      '$',
  );
  return { regex, paramNames };
}

const routeDefs = [
  [
    'GET',
    '/api/health',
    () => ({
      status: 'ok',
      info: { database: { status: 'up' } },
      details: { database: { status: 'up' } },
    }),
  ],
  [
    'POST',
    '/api/auth/refresh',
    () => ({ status: 401, body: { message: 'Missing refresh token' } }),
  ],
  ['POST', '/api/auth/logout', () => ({ status: 200, body: null })],
  ['GET', '/api/clubs', () => []],
  [
    'GET',
    '/api/clubs/:clubId',
    (p) => ({ id: p.clubId, name: '', ffbbClubCode: null, createdAt: '2026-01-01T00:00:00.000Z' }),
  ],
  ['GET', '/api/clubs/:clubId/teams', () => ({ items: [], total: 0, page: 1, pageSize: 25 })],
  [
    'GET',
    '/api/clubs/:clubId/teams/:teamId/events',
    () => ({ items: [], total: 0, page: 1, pageSize: 25 }),
  ],
  ['GET', '/api/clubs/:clubId/teams/:teamId/admins', () => []],
  ['GET', '/api/clubs/:clubId/teams/:teamId/admins/eligible', () => []],
  ['GET', '/api/clubs/:clubId/teams/:teamId/ffbb-links', () => []],
  [
    'GET',
    '/api/clubs/:clubId/teams/:teamId/ffbb-poule-results',
    () => ({ status: 404, body: { message: 'No FFBB link on this team' } }),
  ],
  [
    'GET',
    '/api/clubs/:clubId/teams/:teamId/events/:eventId/votes',
    () => ({
      best: [],
      worst: [],
      totalVoters: 0,
      votesCast: 0,
      myVote: { best: null, worst: null },
    }),
  ],
  ['GET', '/api/me/teams', () => []],
  ['GET', '/api/me/dashboard', () => ({ totalPlayers: 0, upcomingEvents: [] })],
  // Polled on every protected page by the header bell, so it needs a default
  // even for screenshots that aren't about notifications.
  ['GET', '/api/me/notifications', () => ({ items: [], unreadCount: 0 })],
  ['PATCH', '/api/me/notifications/:notificationId/read', () => ({ status: 204, body: null })],
  ['POST', '/api/me/notifications/read-all', () => ({ status: 204, body: null })],
  // Null key = no VAPID configured, which is what a screenshot run has:
  // NotificationPreferencesCard then hides its push control.
  ['GET', '/api/me/push-subscriptions/public-key', () => ({ publicKey: null })],
  ['POST', '/api/auth/verify-email/request', () => ({ status: 204, body: null })],
  ['POST', '/api/auth/verify-email/confirm', () => ({ status: 204, body: null })],
  ['POST', '/api/auth/password-reset/request', () => ({ status: 204, body: null })],
  ['POST', '/api/auth/password-reset/confirm', () => ({ status: 204, body: null })],
].map(([method, pattern, handler]) => ({ method, handler, ...compile(pattern) }));

function send(res, status, body) {
  if (body === null || body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function main() {
  const { port, fixtures: fixturesPath } = parseArgs(process.argv.slice(2));
  const fixtures = loadFixtures(fixturesPath);

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const key = `${req.method} ${url.pathname}`;

    if (key in fixtures) {
      const entry = fixtures[key];
      const hasEnvelope =
        entry && typeof entry === 'object' && 'status' in entry && 'body' in entry;
      return send(res, hasEnvelope ? entry.status : 200, hasEnvelope ? entry.body : entry);
    }

    for (const route of routeDefs) {
      if (route.method !== req.method) continue;
      const match = route.regex.exec(url.pathname);
      if (!match) continue;
      const params = Object.fromEntries(route.paramNames.map((name, i) => [name, match[i + 1]]));
      const result = route.handler(params, url.searchParams);
      const hasEnvelope =
        result && typeof result === 'object' && 'status' in result && 'body' in result;
      return send(res, hasEnvelope ? result.status : 200, hasEnvelope ? result.body : result);
    }

    send(res, 404, { message: `No mock route for ${key}` });
  });

  server.listen(port, () => {
    console.log(`mock-api-server listening on http://localhost:${port}`);
    if (fixturesPath)
      console.log(`  fixtures: ${fixturesPath} (${Object.keys(fixtures).length} override(s))`);
  });
}

main();
