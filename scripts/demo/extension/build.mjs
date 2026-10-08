#!/usr/bin/env node
// Builds the « Kluvo démo » Chrome extension into dist/kluvo-demo/:
//   node scripts/demo/extension/build.mjs
// Then chrome://extensions → Mode développeur → Charger l'extension non
// empaquetée → dist/kluvo-demo. The roster comes from the demo CSV, so the
// extension and the import file can't drift.

import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
// esbuild ships with Vite; resolve it through the app so no new dependency is needed.
const fromApp = createRequire(join(repo, 'app/package.json'));
const fromVite = createRequire(fromApp.resolve('vite'));
const { build } = await import(fromVite.resolve('esbuild'));

const csv = readFileSync(join(here, '../joueurs-avenir-basket-du-cens.csv'), 'utf-8')
  .trim()
  .split(/\r?\n/);
const rows = csv.slice(1).map((line) => {
  const [licence, nom, prenom, sexe, naissance, type, , equipe] = line.split(',');
  return { licence, nom, prenom, sexe, naissance, type, equipe };
});
writeFileSync(join(here, 'src/licencies.json'), `${JSON.stringify(rows, null, 2)}\n`);

const out = join(here, 'dist/kluvo-demo');
mkdirSync(out, { recursive: true });
await build({
  entryPoints: [join(here, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  outfile: join(out, 'demo.js'),
  tsconfig: join(here, 'tsconfig.json'),
  legalComments: 'none',
});
copyFileSync(join(here, 'manifest.json'), join(out, 'manifest.json'));
const config =
  "// Journées déjà jouées (la suivante est ce week-end) et persona au premier chargement.\nwindow.__KLUVO_DEMO_CONFIG__ = { played: 8, persona: 'coach' };\n";
writeFileSync(join(out, 'config.js'), config);
// The same code as one file, for a DevTools override or snippet where an
// extension can't be installed (a managed work browser).
writeFileSync(
  join(here, 'dist/kluvo-demo-devtools.js'),
  `${config}${readFileSync(join(out, 'demo.js'), 'utf-8')}`,
);
console.log(`Built ${out}`);
