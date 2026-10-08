#!/usr/bin/env node
// Captures the real-product screenshots the landing page shows, from the
// running app, so they can be regenerated whenever the UI changes.
//
// It needs no backend: each shot names a committed fixture under
// scripts/fixtures/ (the `landing-*.json` set shares one fictional club, the
// « Seniors Filles 1 » entente of ES Erdre Basket and Avenir Basket Sucé), and
// the script starts scripts/mock-api-server.mjs on that fixture, then drives
// the Vite dev server with headless Chromium (Playwright, preinstalled in
// these sandboxes — never `playwright install`). The browser clock is frozen
// at NOW so relative copy (« J-2 », « ce soir », the 14-day agenda window)
// renders the same on every run.
//
// Usage (from the repo root):
//   node scripts/capture-landing-screenshots.mjs [--out <dir>] [--only <name,...>]
//        [--app-url http://localhost:5173] [--mock-port 3100] [--webp]
//
// --out      where the PNGs go (default: scratchpad/landing-shots, gitignored).
// --only     comma-separated shot names (see SHOTS below) to capture a subset.
// --app-url  reuse an already-running Vite dev server instead of starting one.
//            It must proxy /api to --mock-port (VITE_API_PROXY_TARGET).
// --webp     also write a .webp next to each PNG through ImageMagick's
//            `convert` (quality 82), when it is installed.
// --assets   also write the images the landing page imports (shots carrying an
//            `asset` name) to app/src/assets/landing/<asset>.webp, resized
//            (phones 600 px wide, desktops 1280) — the regeneration path for
//            the page's images. Needs ImageMagick's `convert`.
//
// Any /api request the fixture doesn't cover is logged, so a UI change that
// adds a query shows up as a warning instead of a silently empty section.

import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-10-08T10:00:00+02:00'; // Thursday; the match is Saturday 10 Oct.

const PHONE = { width: 390, height: 844, scale: 2 };
const ASSET_DIR = `${REPO}/app/src/assets/landing`;
// Width each landing asset is stored at: a phone frame shows at most ~300 CSS px.
const ASSET_WIDTH = { phone: 600, desktop: 1280 };
const DESKTOP = { width: 1280, height: 800, scale: 1 };

/**
 * One entry per image. `at` is a selector scrolled to the top of the viewport
 * before a viewport-sized capture (the screen as a reader sees it, bottom nav
 * included); `element` captures that element's box instead; `fullPage`
 * captures the whole page. `before` runs after load, to click into a state.
 */
const SHOTS = [
  {
    name: 'player-home-phone',
    asset: 'hero-player-home',
    fixture: 'landing-player-home.json',
    route: '/dashboard',
    viewport: PHONE,
  },
  {
    name: 'match-player-phone',
    fixture: 'landing-match-player.json',
    route: '/clubs/club-1/teams/team-1/events/event-1',
    viewport: PHONE,
  },
  {
    name: 'match-player-rdv-phone',
    asset: 'match-rdv-phone',
    fixture: 'landing-match-player.json',
    route: '/clubs/club-1/teams/team-1/events/event-1',
    viewport: PHONE,
    at: 'h2:has-text("y rendre")',
  },
  {
    name: 'jersey-duty-phone',
    asset: 'jersey-duty-phone',
    fixture: 'landing-match-player.json',
    route: '/clubs/club-1/teams/team-1/events/event-1',
    viewport: PHONE,
    at: 'text=Lavage des maillots',
    offset: 140,
  },
  {
    name: 'match-player-desktop',
    fixture: 'landing-match-player.json',
    route: '/clubs/club-1/teams/team-1/events/event-1',
    viewport: DESKTOP,
  },
  {
    name: 'match-manager-desktop',
    asset: 'coach-match-desktop',
    fixture: 'landing-match-manager.json',
    route: '/clubs/club-1/teams/team-1/events/event-1',
    viewport: DESKTOP,
  },
  {
    name: 'match-manager-phone',
    asset: 'coach-match-phone',
    fixture: 'landing-match-manager.json',
    route: '/clubs/club-1/teams/team-1/events/event-1',
    viewport: PHONE,
  },
  {
    name: 'whatsapp-share-phone',
    fixture: 'landing-match-manager.json',
    route: '/clubs/club-1/teams/team-1/events/event-1?tab=partage',
    viewport: PHONE,
    at: 'button:has-text("Partage WhatsApp")',
  },
  {
    name: 'manager-home-desktop',
    asset: 'hero-manager-home',
    fixture: 'landing-manager-home.json',
    route: '/dashboard',
    viewport: DESKTOP,
  },
  {
    name: 'manager-home-phone',
    fixture: 'landing-manager-home.json',
    route: '/dashboard',
    viewport: PHONE,
  },
  {
    name: 'guest-rsvp-phone',
    asset: 'guest-rsvp-phone',
    fixture: 'landing-guest-rsvp.json',
    route: '/r/Qm4x2vJ9kT0aLw8e',
    viewport: PHONE,
    before: async (page) => {
      await page.getByRole('radio', { name: /Jade L\./ }).click();
    },
  },
  {
    name: 'guest-rsvp-desktop',
    fixture: 'landing-guest-rsvp.json',
    route: '/r/Qm4x2vJ9kT0aLw8e',
    viewport: DESKTOP,
    before: async (page) => {
      await page.getByRole('radio', { name: /Jade L\./ }).click();
    },
  },
  {
    name: 'jersey-rotation-phone',
    fixture: 'landing-jersey-rotation.json',
    route: '/clubs/club-1/teams/team-1?tab=maillots',
    viewport: PHONE,
    at: 'h2:has-text("Lavage des maillots")',
  },
  {
    name: 'jersey-rotation-desktop',
    fixture: 'landing-jersey-rotation.json',
    route: '/clubs/club-1/teams/team-1?tab=maillots',
    viewport: DESKTOP,
  },
  {
    name: 'scoresheet-review-phone',
    fixture: 'landing-scoresheet-stats.json',
    route: '/clubs/club-1/teams/team-1/events/event-past?tab=scoresheet',
    viewport: PHONE,
    at: 'button:has-text("Après la rencontre")',
  },
  {
    name: 'scoresheet-review-desktop',
    fixture: 'landing-scoresheet-stats.json',
    route: '/clubs/club-1/teams/team-1/events/event-past?tab=scoresheet',
    viewport: DESKTOP,
    at: 'button:has-text("Après la rencontre")',
    offset: 96,
  },
  {
    name: 'season-stats-desktop',
    asset: 'season-stats-desktop',
    fixture: 'landing-scoresheet-stats.json',
    route: '/clubs/club-1/teams/team-1?tab=stats',
    viewport: DESKTOP,
    at: 'text=Saison',
    offset: 24,
  },
  {
    name: 'season-stats-phone',
    asset: 'season-stats-phone',
    fixture: 'landing-scoresheet-stats.json',
    route: '/clubs/club-1/teams/team-1?tab=stats',
    viewport: PHONE,
    at: 'text=Calculé sur',
  },
];

function parseArgs(argv) {
  const args = {
    out: 'scratchpad/landing-shots',
    only: null,
    appUrl: null,
    mockPort: 3100,
    webp: false,
    assets: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--only') args.only = argv[++i].split(',');
    else if (argv[i] === '--app-url') args.appUrl = argv[++i];
    else if (argv[i] === '--mock-port') args.mockPort = Number(argv[++i]);
    else if (argv[i] === '--webp') args.webp = true;
    else if (argv[i] === '--assets') args.assets = true;
  }
  return args;
}

// Playwright is installed globally in these sandboxes, not as a workspace
// dependency, so resolve it from the global prefix when a plain import fails.
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const require = createRequire(import.meta.url);
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(require.resolve('playwright', { paths: [globalRoot] }));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startMock(fixture, port) {
  const child = spawn(
    process.execPath,
    [
      `${REPO}/scripts/mock-api-server.mjs`,
      '--port',
      String(port),
      '--fixtures',
      `${REPO}/scripts/fixtures/${fixture}`,
    ],
    { stdio: 'ignore' },
  );
  return child;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise((r) => child.once('exit', r));
}

async function capture(browser, shot, appUrl, outDir) {
  const { width, height, scale } = shot.viewport;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(NOW));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (
      url.pathname.startsWith('/api/') &&
      response.status() >= 400 &&
      url.pathname !== '/api/auth/refresh'
    ) {
      console.warn(
        `  [${shot.name}] ${response.request().method()} ${url.pathname} -> ${response.status()}`,
      );
    }
  });

  await page.goto(`${appUrl}${shot.route}`, { waitUntil: 'networkidle' });
  await page.addStyleTag({
    content:
      '::-webkit-scrollbar { display: none } * { scrollbar-width: none; caret-color: transparent }',
  });
  // A query that retries (a 404 the UI reads as « nothing linked ») keeps a
  // skeleton up for a few seconds after network idle; wait it out.
  await page
    .waitForFunction(() => !document.querySelector('.animate-pulse'), null, { timeout: 20_000 })
    .catch(() => console.warn(`  [${shot.name}] a skeleton was still visible after 20 s`));
  if (shot.before) {
    await shot.before(page);
    await page.waitForLoadState('networkidle');
  }
  if (shot.at) {
    const target = page.locator(shot.at).first();
    await target.waitFor({ timeout: 10_000 });
    // Scroll the anchor to the top, leaving room for the sticky header(s).
    await target.evaluate(
      (el, offset) => {
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset);
      },
      shot.offset ?? (width < 768 ? 112 : 96),
    );
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await sleep(400);

  const path = `${outDir}/${shot.name}.png`;
  if (shot.element) {
    await page.locator(shot.element).first().screenshot({ path, animations: 'disabled' });
  } else {
    await page.screenshot({ path, fullPage: Boolean(shot.fullPage), animations: 'disabled' });
  }
  await context.close();
  return path;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(REPO, args.out);
  mkdirSync(outDir, { recursive: true });
  const shots = args.only ? SHOTS.filter((s) => args.only.includes(s.name)) : SHOTS;
  if (shots.length === 0) throw new Error(`No shot matches --only ${args.only}`);

  let vite = null;
  let appUrl = args.appUrl;
  if (!appUrl) {
    appUrl = 'http://localhost:5173';
    vite = spawn(
      'pnpm',
      ['--filter', '@basketeasy/app', 'exec', 'vite', '--port', '5173', '--strictPort'],
      {
        cwd: REPO,
        env: { ...process.env, VITE_API_PROXY_TARGET: `http://localhost:${args.mockPort}` },
        stdio: 'ignore',
      },
    );
  }
  await waitForHttp(appUrl);

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  const hasConvert = existsSync('/usr/bin/convert');
  if ((args.webp || args.assets) && !hasConvert) {
    console.warn('ImageMagick `convert` not found: skipping --webp/--assets.');
  }
  if (args.assets) mkdirSync(ASSET_DIR, { recursive: true });

  let mock = null;
  let mockFixture = null;
  const failed = [];
  try {
    for (const shot of shots) {
      if (shot.fixture !== mockFixture) {
        await stop(mock);
        mock = startMock(shot.fixture, args.mockPort);
        mockFixture = shot.fixture;
        await waitForHttp(`http://localhost:${args.mockPort}/api/health`);
      }
      try {
        const path = await capture(browser, shot, appUrl, outDir);
        if (args.webp && hasConvert) {
          execSync(`convert "${path}" -quality 82 "${path.replace(/\.png$/, '.webp')}"`);
        }
        if (args.assets && hasConvert && shot.asset) {
          const width = shot.viewport === PHONE ? ASSET_WIDTH.phone : ASSET_WIDTH.desktop;
          execSync(
            `convert "${path}" -resize ${width}x -strip -quality 80 "${ASSET_DIR}/${shot.asset}.webp"`,
          );
        }
        console.log(`captured ${shot.name}`);
      } catch (err) {
        failed.push(shot.name);
        console.error(`FAILED ${shot.name}: ${err.message.split('\n')[0]}`);
      }
    }
  } finally {
    await browser.close();
    await stop(mock);
    if (vite) vite.kill();
  }
  console.log(`\n${shots.length - failed.length} screenshot(s) in ${outDir}`);
  if (failed.length > 0) {
    console.error(`Failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
