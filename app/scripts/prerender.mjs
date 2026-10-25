// Writes the static HTML of every indexable route into dist/, so a crawler
// (and a first paint) gets real content instead of an empty <div id="root">.
// Runs after `vite build` and `vite build --ssr src/prerender.tsx`.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const ssrDir = join(root, 'dist-ssr');

const SITE_URL = 'https://kluvo.net';
// Subset of INDEXABLE in src/seo/routeSeo.ts: /register is left out, it sits behind
// PublicOnlyRoute, which renders nothing until the session restore answers.
const ROUTES = {
  '/': null,
  '/mentions-legales': 'Mentions légales — Kluvo',
  '/confidentialite': 'Politique de confidentialité — Kluvo',
  '/cgu': 'Conditions générales d’utilisation — Kluvo',
};

const { render } = await import(pathToFileURL(join(ssrDir, 'prerender.js')).href);
const shell = await readFile(join(dist, 'index.html'), 'utf8');

if (!shell.includes('<div id="root"></div>')) {
  throw new Error('prerender: empty root placeholder not found in dist/index.html');
}

const paths = Object.keys(ROUTES);

for (const [path, title] of Object.entries(ROUTES)) {
  const html = render(path);
  let page = shell.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
  page = page.replace('__PRERENDERED_PATHS__', JSON.stringify(paths));
  if (title) {
    const escaped = title.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    page = page
      .replace(/<title>[^<]*<\/title>/, `<title>${escaped}</title>`)
      .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${escaped}"`)
      .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${escaped}"`);
  }
  const url = `${SITE_URL}${path === '/' ? '/' : path}`;
  page = page
    .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`);
  const out = path === '/' ? join(dist, 'index.html') : join(dist, path, 'index.html');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, page);
  console.log(`prerendered ${path} (${html.length} bytes)`);
}

await rm(ssrDir, { recursive: true, force: true });
