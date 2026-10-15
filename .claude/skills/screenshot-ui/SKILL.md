---
name: screenshot-ui
description: Render a UI change and capture a screenshot when there's no live Postgres/Docker to run the real BasketEasy app against (the common case in these sandboxes). Use whenever a task adds or modifies a component, layout, style, or visual state and CLAUDE.md's screenshot rule applies.
---

# Screenshot a UI change without a live backend

1. **Start the mock API** in the background:

   ```
   pnpm mock-api
   ```

   Listens on port 3000 (matches `app/vite.config.ts`'s proxy target) and serves the
   same default empty/zero shapes as `app/src/mocks/handlers.ts`.

2. **Need specific data for the scenario** (e.g. a named club, a populated roster, an
   event with RSVPs)? **Check `scripts/fixtures/` first** — committed, reusable fixture
   files for scenarios that come up repeatedly:

   - `authenticated-admin-session.json` — the base session/club bootstrap almost every
     authenticated-screen screenshot needs (`POST /auth/refresh`, `GET /auth/me`,
     `GET /clubs`, `GET /clubs/club-1`). Pass it directly when that's all you need, or
     copy it as the starting point for a new scenario file.
   - `player-invite.json` — an authenticated admin session plus one unlinked player and
     the invite-generation/accept endpoints (roster invite dialog, `/invite/:token`
     accept page).

   Reuse one of these unmodified when it already fits; extend a copy (adding routes,
   changing names) when it's close but not quite right; only write a fresh one from
   scratch when the scenario shares nothing with what's there. A fixtures file is a flat
   JSON object keyed `"METHOD /path": <body>` — path is the literal resolved path, no
   `:param` placeholders:

   ```json
   {
     "GET /api/clubs/club-1": {
       "id": "club-1",
       "name": "ASC Nantes",
       "ffbbClubCode": null,
       "createdAt": "2026-01-01"
     },
     "GET /api/clubs/club-1/teams": {
       "items": [{ "id": "team-1", "name": "Seniors M" }],
       "total": 1,
       "page": 1,
       "pageSize": 25
     }
   }
   ```

   An entry can also be `{ "status": 404, "body": { ... } }` to mock an error. Pass it
   with `pnpm mock-api -- --fixtures scripts/fixtures/<file>.json` (a committed fixture)
   or `pnpm mock-api -- --fixtures ./scratchpad/fixtures.json` (a one-off you don't
   expect to reuse — the server only loads a single `--fixtures` file, so a new
   scenario file repeats the session block rather than composing several). If the
   scenario looks reusable for future screenshots, commit it under `scripts/fixtures/`
   instead of leaving it in scratchpad.

3. **Start the Vite dev server**:

   ```
   pnpm dev:app
   ```

4. **Drive it with Playwright** (preinstalled, `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`
   is already set — don't run `playwright install`). A quick one-off script works fine:

   ```js
   import { chromium } from 'playwright';
   const browser = await chromium.launch();
   const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
   await page.goto('http://localhost:5173/clubs/club-1/teams/team-1');
   await page.screenshot({ path: 'scratchpad/screenshot.png' });
   await browser.close();
   ```

   For an authenticated route, the app needs a session — either seed `POST /api/auth/refresh`
   in your fixtures to return a valid session shape, or navigate through the login form
   first if the mock also stubs `/api/auth/login`.

5. Send the screenshot with `SendUserFile` (or your file-sending tool) — don't just
   describe it in prose.

Full rule and rationale: see CLAUDE.md's "Sandbox migrations" and "Screenshots" bullets.
The mock server itself is `scripts/mock-api-server.mjs` — its header comment has the
authoritative route list and fixture format.
