#!/usr/bin/env node
// Stand-in for competitions.ffbb.com, for the demo club « Avenir Basket du
// Cens » (fictional). The real server keeps running FfbbPageScrapeProvider
// unchanged; only FFBB_BASE_URL points here instead of FFBB, so linking the
// team, importing its schedule and reading the poule's standings all go
// through the same parsing code as production, and the imported matches are
// real Event rows in the database.
//
// Usage:
//   node scripts/demo/fake-ffbb-server.mjs [--port 4010] [--anchor 2026-10-17] [--played 3]
//   FFBB_BASE_URL=http://localhost:4010 pnpm dev:server
//
// --anchor  the Saturday of the team's next match weekend (default: next Saturday)
// --played  how many journées are already played before it (default: 3)
// --no-results  serve every match as not played yet. The import only reads
//           the venue of a match that isn't played, so the first import runs
//           with this flag (every match gets its gym), the next one without it
//           (played matches are left untouched, results and standings appear).
//
// Dates are computed from --anchor, so the demo season is always "now",
// whenever it is filmed. Pass the same --anchor on every run, or a re-import
// moves every match.
//
// --dump-overrides <dir> writes, instead of serving, the JSON bodies of the
// Kluvo API routes that trigger an FFBB scrape, for Chrome DevTools "Override
// content" when the demo runs against a deployment whose env can't be
// changed. See scripts/demo/README.md.
//
// The page shape mirrors what the provider parses (a Next.js RSC payload in
// `self.__next_f.push` chunks, see server/src/ffbb/ffbb-page-scrape.provider.ts):
// a team page with `dataEngagement.idPoule` and a `data` array of rencontres,
// a poule page with a `poules` array of rencontres + classements.

import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LIGUE = 'pdl';
const COMITE = '0044';
const CLUB_CODE = 'pdl0044958';
const ENGAGEMENT_ID = '200000006107744';
const COMPETITION_CODE = 'DF1';
const PHASE_ID = '200000002871455';
const POULE_ID = '200000003390218';
const COMPETITION_LABEL = 'Départementale Féminine 1 · Poule A';

const TEAM_PATH = `ligues/${LIGUE}/comites/${COMITE}/clubs/${CLUB_CODE}/equipes/${ENGAGEMENT_ID}`;
const COMPETITION_PATH = `ligues/${LIGUE}/comites/${COMITE}/competitions/${COMPETITION_CODE}`;

// Fictional clubs in real Loire-Atlantique towns. `kickoff` is the home
// side's usual slot: day offset from the journée's Saturday, then the time.
const TEAMS = [
  {
    id: ENGAGEMENT_ID,
    nom: 'Avenir Basket du Cens',
    salle: { libelle: 'Salle des Prés du Cens', codePostal: '44700', ville: 'Orvault' },
    kickoff: [0, '20:30'],
    strength: 7,
  },
  {
    id: '200000006107801',
    nom: 'Hérons Basket Carquefou',
    salle: { libelle: 'Gymnase des Hérons', codePostal: '44470', ville: 'Carquefou' },
    kickoff: [0, '20:00'],
    strength: 8,
  },
  {
    id: '200000006107802',
    nom: 'Rives de Sèvre Basket 2',
    salle: { libelle: 'Salle de la Sèvre', codePostal: '44120', ville: 'Vertou' },
    kickoff: [1, '15:30'],
    strength: 6,
  },
  {
    id: '200000006107803',
    nom: 'Trentemoult Rezé BC',
    salle: { libelle: 'Gymnase du Port', codePostal: '44400', ville: 'Rezé' },
    kickoff: [0, '18:30'],
    strength: 5,
  },
  {
    id: '200000006107804',
    nom: 'Bois-Cesbron Basket Saint-Herblain',
    salle: { libelle: 'Salle du Bois-Cesbron', codePostal: '44800', ville: 'Saint-Herblain' },
    kickoff: [0, '20:30'],
    strength: 6,
  },
  {
    id: '200000006107805',
    nom: "Sautron Val d'Ouest Basket",
    salle: { libelle: 'Salle de la Forêt', codePostal: '44880', ville: 'Sautron' },
    kickoff: [1, '10:30'],
    strength: 4,
  },
  {
    id: '200000006107806',
    nom: 'Coteaux de Goulaine BC',
    salle: { libelle: 'Salle des Coteaux', codePostal: '44115', ville: 'Basse-Goulaine' },
    kickoff: [0, '19:00'],
    strength: 5,
  },
  {
    id: '200000006107807',
    nom: 'Entente Treillières-Grandchamp',
    salle: { libelle: 'Complexe des Landes', codePostal: '44119', ville: 'Treillières' },
    kickoff: [0, '20:30'],
    strength: 7,
  },
  {
    id: '200000006107808',
    nom: 'Estuaire Basket La Montagne',
    salle: { libelle: "Salle de l'Estuaire", codePostal: '44620', ville: 'La Montagne' },
    kickoff: [1, '15:30'],
    strength: 3,
  },
  {
    id: '200000006107809',
    nom: 'Sainte-Luce Loire Basket',
    salle: {
      libelle: 'Gymnase des Bords de Loire',
      codePostal: '44980',
      ville: 'Sainte-Luce-sur-Loire',
    },
    kickoff: [0, '18:00'],
    strength: 6,
  },
];

// Our side's results, in order, for the journées already played: a team
// that wins more than it loses, without running away with the poule.
const OUR_MARGINS = [9, -4, 13, 6, -11, 17, 2, -6, 8];
// The last journées' kick-off time isn't published yet, the way FFBB shows
// a late-season fixture (00:00:00, rendered « horaire à confirmer »).
const UNCONFIRMED_LAST_JOURNEES = 3;
const JOURNEES = (TEAMS.length - 1) * 2;
// Winter break: no game for two weekends after the first leg.
const BREAK_AFTER_JOURNEE = TEAMS.length - 1;
const BREAK_WEEKS = 2;

function parseArgs(argv) {
  const args = { port: 4010, anchor: null, played: 3, noResults: false, dumpOverrides: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') args.port = Number(argv[++i]);
    else if (argv[i] === '--anchor') args.anchor = argv[++i];
    else if (argv[i] === '--played') args.played = Number(argv[++i]);
    else if (argv[i] === '--no-results') args.noResults = true;
    else if (argv[i] === '--dump-overrides') args.dumpOverrides = argv[++i];
  }
  return args;
}

function nextSaturday(from = new Date()) {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const days = (6 - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function parseAnchor(value) {
  if (!value) return nextSaturday();
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCDay() !== 6) {
    throw new Error(`--anchor must be a Saturday (YYYY-MM-DD), got "${value}"`);
  }
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const isoDate = (d) => d.toISOString().slice(0, 10);

// Deterministic, so a re-run serves the same scores.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Circle-method round robin: 9 rounds, every pair once; the return leg swaps home and away. */
function roundRobin(n) {
  const ids = [...Array(n).keys()];
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i];
      const b = ids[n - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop());
  }
  return [...rounds, ...rounds.map((pairs) => pairs.map(([a, b]) => [b, a]))];
}

function buildSeason({ anchor, played, noResults }) {
  const random = mulberry32(44700);
  const firstSaturday = addDays(anchor, -7 * played);
  const rounds = roundRobin(TEAMS.length);
  const rencontres = [];
  let ourPlayed = 0;
  let seq = 1;

  rounds.forEach((pairs, index) => {
    const journee = index + 1;
    const weeks = index + (journee > BREAK_AFTER_JOURNEE ? BREAK_WEEKS : 0);
    const saturday = addDays(firstSaturday, 7 * weeks);
    const isPlayed = !noResults && journee <= played;
    const unconfirmed = journee > JOURNEES - UNCONFIRMED_LAST_JOURNEES;

    for (const [h, a] of pairs) {
      const home = TEAMS[h];
      const away = TEAMS[a];
      const [dayOffset, time] = home.kickoff;
      const day = isoDate(addDays(saturday, dayOffset));
      const id = `2000000${String(18_400_000 + seq++).padStart(8, '0')}`;

      let scoreHome = '';
      let scoreAway = '';
      if (isPlayed) {
        const base = 48 + Math.round(random() * 18);
        let margin;
        if (h === 0 || a === 0) {
          const ours = OUR_MARGINS[ourPlayed++ % OUR_MARGINS.length];
          margin = h === 0 ? ours : -ours;
        } else {
          margin = Math.round((home.strength - away.strength) * 3 + 3 + (random() - 0.5) * 24);
          if (margin === 0) margin = 1;
        }
        scoreHome = String(margin > 0 ? base + margin : base);
        scoreAway = String(margin > 0 ? base : base - margin);
      }

      rencontres.push({
        id,
        numeroJournee: String(journee),
        date_rencontre: `${day}T${unconfirmed ? '00:00' : time}:00`,
        joue: isPlayed,
        resultatEquipe1: scoreHome,
        resultatEquipe2: scoreAway,
        idEngagementEquipe1: { id: home.id, nom: home.nom },
        idEngagementEquipe2: { id: away.id, nom: away.nom },
        idPoule: { id: POULE_ID, nom: 'Poule A' },
        competitionId: { id: PHASE_ID, code: COMPETITION_CODE },
        libelleCompetition: COMPETITION_LABEL,
        salle: home.salle,
        lien: `/${COMPETITION_PATH}/match/${id}`,
      });
    }
  });

  return rencontres;
}

function buildStandings(rencontres) {
  const rows = new Map(
    TEAMS.map((t) => [t.id, { team: t, played: 0, won: 0, lost: 0, diff: 0, scored: 0 }]),
  );
  for (const r of rencontres) {
    if (!r.joue) continue;
    const home = rows.get(r.idEngagementEquipe1.id);
    const away = rows.get(r.idEngagementEquipe2.id);
    const sh = Number(r.resultatEquipe1);
    const sa = Number(r.resultatEquipe2);
    for (const [row, own, other] of [
      [home, sh, sa],
      [away, sa, sh],
    ]) {
      row.played += 1;
      row.scored += own;
      row.diff += own - other;
      if (own > other) row.won += 1;
      else row.lost += 1;
    }
  }
  // FFBB scoring: 2 points a win, 1 a loss.
  return [...rows.values()]
    .map((row) => ({ ...row, points: row.won * 2 + row.lost }))
    .sort((a, b) => b.points - a.points || b.diff - a.diff || b.scored - a.scored);
}

function toClassements(standings) {
  return standings.map((row, index) => ({
    id: `cl-${row.team.id}`,
    idEngagement: { id: row.team.id, nom: row.team.nom },
    position: String(index + 1),
    matchJoues: String(row.played),
    gagnes: String(row.won),
    perdus: String(row.lost),
    points: String(row.points),
  }));
}

function rscPage(payload) {
  const chunk = `1:${JSON.stringify(payload)}`;
  return [
    '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>FFBB Compétitions</title></head><body>',
    `<script>self.__next_f.push([0])</script>`,
    `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`,
    '</body></html>',
  ].join('');
}

function teamPage(rencontres) {
  const ours = rencontres.filter(
    (r) => r.idEngagementEquipe1.id === ENGAGEMENT_ID || r.idEngagementEquipe2.id === ENGAGEMENT_ID,
  );
  return rscPage({
    dataEngagement: {
      id: ENGAGEMENT_ID,
      nom: TEAMS[0].nom,
      idPoule: { id: POULE_ID, nom: 'Poule A' },
    },
    // FFBB's team rows don't carry idPoule; only dataEngagement does.
    data: ours.map(({ idPoule: _idPoule, ...rest }) => rest),
  });
}

function poulePage(rencontres) {
  return rscPage({
    poules: [
      {
        id: POULE_ID,
        nom: 'Poule A',
        rencontres,
        classements: toClassements(buildStandings(rencontres)),
      },
    ],
  });
}

function matchPage(rencontre) {
  const { libelle, codePostal, ville } = rencontre.salle;
  return rscPage({
    informations: [
      {
        type: 'salle',
        informations: [
          { type: 'text', label: 'Nom', value: libelle },
          { type: 'address', label: 'Adresse', value: `${codePostal} ${ville}` },
        ],
      },
    ],
  });
}

/** The bodies Kluvo's own API would answer once the scrape went through, for DevTools overrides. */
function dumpOverrides(dir, rencontres) {
  mkdirSync(dir, { recursive: true });
  const ours = rencontres.filter(
    (r) => r.idEngagementEquipe1.id === ENGAGEMENT_ID || r.idEngagementEquipe2.id === ENGAGEMENT_ID,
  );
  const byJournee = new Map();
  for (const r of rencontres) {
    if (!r.joue) continue;
    const list = byJournee.get(Number(r.numeroJournee)) ?? [];
    list.push({
      homeLabel: r.idEngagementEquipe1.nom,
      awayLabel: r.idEngagementEquipe2.nom,
      homeScore: Number(r.resultatEquipe1),
      awayScore: Number(r.resultatEquipe2),
      involvesOurTeam:
        r.idEngagementEquipe1.id === ENGAGEMENT_ID || r.idEngagementEquipe2.id === ENGAGEMENT_ID,
    });
    byJournee.set(Number(r.numeroJournee), list);
  }
  const files = {
    // One body for GET and POST: DevTools overrides match by URL, and the
    // frontend ignores the POST's body (it only refetches the GET).
    'ffbb-links.json': [{ id: 'demo-ffbb-link', ffbbEngagementLabel: COMPETITION_LABEL }],
    'ffbb-import.json': {
      created: ours.length,
      updated: 0,
      unchanged: 0,
      missingVenue: [],
      missingVenueTotal: 0,
    },
    'ffbb-poule-results.json': {
      competitionLabel: COMPETITION_LABEL,
      standings: buildStandings(rencontres).map((row) => ({
        teamLabel: row.team.nom,
        played: row.played,
        won: row.won,
        lost: row.lost,
        points: row.points,
        isOurTeam: row.team.id === ENGAGEMENT_ID,
      })),
      matchdays: [...byJournee.entries()]
        .sort(([a], [b]) => b - a)
        .map(([journee, results]) => ({ matchdayLabel: `Journée ${journee}`, results })),
    },
  };
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), `${JSON.stringify(body, null, 2)}\n`);
  }
  console.log(`Wrote ${Object.keys(files).length} override bodies to ${dir}`);
}

function serve(port, rencontres) {
  const byId = new Map(rencontres.map((r) => [r.id, r]));
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/^\/+|\/+$/g, '');
    let html = null;
    if (path === TEAM_PATH) {
      html = teamPage(rencontres);
    } else if (
      path === COMPETITION_PATH &&
      url.searchParams.get('phase') === PHASE_ID &&
      url.searchParams.get('poule') === POULE_ID
    ) {
      html = poulePage(rencontres);
    } else if (path.startsWith(`${COMPETITION_PATH}/match/`)) {
      const rencontre = byId.get(path.split('/').pop());
      if (rencontre) html = matchPage(rencontre);
    }
    console.log(
      `${new Date().toISOString()} ${req.method} /${path}${url.search} -> ${html ? 200 : 404}`,
    );
    res.writeHead(html ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html ?? 'Not found');
  });
  server.listen(port, () => {
    console.log(`Fake FFBB listening on http://localhost:${port}`);
    console.log(`Team URL to paste in Kluvo: https://competitions.ffbb.com/${TEAM_PATH}`);
  });
}

const args = parseArgs(process.argv.slice(2));
const anchor = parseAnchor(args.anchor);
const rencontres = buildSeason({ anchor, played: args.played, noResults: args.noResults });
console.log(
  `Season: ${JOURNEES} journées, ${args.noResults ? 0 : args.played} played, ` +
    `next match the weekend of ${isoDate(anchor)}`,
);
if (args.dumpOverrides) dumpOverrides(args.dumpOverrides, rencontres);
else serve(args.port, rencontres);
