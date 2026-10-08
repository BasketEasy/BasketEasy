// The demo club, generated from "now" and a seed: same data on every load,
// a season that is always current. Nothing here talks to the network.
//
// Fictional on purpose: « Avenir Basket du Cens » (Orvault, 44) and its
// Régionale Féminine 1 poule are invented, in real Pays de la Loire towns.

import type {
  Gender,
  Team,
  TeamCategory,
  TeamMemberRole,
  TeamPlayer,
} from '@basketeasy/types/teams';
import type { Player } from '@basketeasy/types/players';
import type { EventRsvpStatus, EventType, EventVenue } from '@basketeasy/types/events';
import type { EventTravelMode, MeetingPoint } from '@basketeasy/types/meeting-points';
import type { ClubRole } from '@basketeasy/types/club-members';
import { isMinorBirthDate } from '@basketeasy/types/parental-consent';
import licencies from './licencies.json';
import { DAY, HOUR, atParis, iso, parisDayStart, parisParts, parisWeekday } from './time';

export interface DemoConfig {
  /** Journées already played when the page loads (the next one is this weekend). */
  played: number;
}

export type PersonaKey = 'coach' | 'joueuse';

// --- Deterministic randomness and ids ------------------------------------

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A uniform number in [0, 1) that only depends on `key`. */
export function rand(key: string): number {
  let t = hash(key) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A stable UUID-looking id, so the address bar reads like production. */
export function uid(key: string): string {
  const hex = [0, 1, 2, 3].map((i) => hash(`${key}#${i}`).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function token(key: string, length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from({ length }, (_, i) => alphabet[hash(`${key}:${i}`) % alphabet.length]).join('');
}

// --- Club ---------------------------------------------------------------

export const CLUB = {
  id: uid('club'),
  name: 'Avenir Basket du Cens',
  ffbbClubCode: 'pdl0044958',
  createdAt: '2025-08-25T18:42:00.000Z',
};

export const HOME_GYM = {
  name: 'Salle des Prés du Cens',
  address: 'Rue des Prés du Cens, 44700 Orvault',
};

export const CLUB_MEETING_POINT: MeetingPoint = {
  name: 'Parking de la Salle des Prés du Cens',
  address: HOME_GYM.address,
};
export const ARRIVAL_BUFFER = 45;

export const COMPETITION_LABEL = 'Régionale Féminine 1 · Poule B';
export const GUEST_TOKEN = token('guest-link');

// --- People -------------------------------------------------------------

export interface DemoUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  clubRole: ClubRole | null;
  joinedAt: string;
}

export interface DemoPlayer extends Player {
  teamName: string | null;
}

export interface DemoTeam {
  team: Team;
  roster: TeamPlayer[];
  adminUserIds: string[];
  /** [weekday 0-6, hour, minute] training slots. */
  trainings: [number, number, number][];
  isShowcase: boolean;
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '');

const MAIL_DOMAINS = ['gmail.com', 'orange.fr', 'free.fr', 'laposte.net', 'hotmail.fr', 'sfr.fr'];
const emailOf = (first: string, last: string) =>
  `${slug(first)}.${slug(last)}@${MAIL_DOMAINS[hash(first + last) % MAIL_DOMAINS.length]}`;

interface CsvRow {
  licence: string;
  nom: string;
  prenom: string;
  sexe: string;
  naissance: string;
  type: string;
  equipe: string;
}

const TEAM_DEFS: {
  name: string;
  category: TeamCategory;
  gender: Gender;
  trainings: [number, number, number][];
  coach?: string;
}[] = [
  {
    name: 'Seniors Filles 1',
    category: 'SENIORS',
    gender: 'WOMEN',
    trainings: [
      [2, 20, 0],
      [4, 20, 0],
    ],
    coach: 'Cadiou',
  },
  {
    name: 'Seniors Filles 2',
    category: 'SENIORS',
    gender: 'WOMEN',
    trainings: [
      [1, 20, 30],
      [3, 20, 30],
    ],
  },
  {
    name: 'Seniors Garçons 1',
    category: 'SENIORS',
    gender: 'MEN',
    trainings: [
      [3, 21, 0],
      [5, 20, 30],
    ],
    coach: 'Garnier',
  },
  { name: 'Seniors Garçons 2', category: 'SENIORS', gender: 'MEN', trainings: [[1, 21, 0]] },
  {
    name: 'U18 Garçons',
    category: 'U18',
    gender: 'MEN',
    trainings: [
      [2, 18, 30],
      [5, 18, 30],
    ],
  },
  {
    name: 'U15 Filles',
    category: 'U15',
    gender: 'WOMEN',
    trainings: [
      [1, 18, 0],
      [3, 17, 0],
    ],
  },
  {
    name: 'U13 Garçons',
    category: 'U13',
    gender: 'MEN',
    trainings: [
      [3, 14, 0],
      [5, 17, 30],
    ],
  },
  {
    name: 'U11 Mixte',
    category: 'U11',
    gender: 'MEN',
    trainings: [
      [3, 15, 30],
      [6, 10, 0],
    ],
  },
];

/** Showcase roster: jersey number, scoring weight, account or not. */
export const SF1_PROFILES: Record<string, { jersey: number; weight: number; account: boolean }> = {
  'Moreau Léa': { jersey: 4, weight: 12, account: true },
  'Bernard Chloé': { jersey: 5, weight: 7, account: true },
  'Roux Camille': { jersey: 6, weight: 4, account: false },
  'Traoré Inès': { jersey: 7, weight: 16, account: true },
  'Lambert Manon': { jersey: 8, weight: 6, account: true },
  'Fontaine Emma': { jersey: 9, weight: 9, account: true },
  'Guérin Jade': { jersey: 10, weight: 8, account: true },
  'Le Gall Clara': { jersey: 11, weight: 5, account: true },
  'Marchand Sarah': { jersey: 12, weight: 4, account: false },
  'Petit Zoé': { jersey: 13, weight: 3, account: false },
  'Perrin Maëlys': { jersey: 14, weight: 3, account: false },
  'Diallo Amina': { jersey: 15, weight: 11, account: true },
};

const OTHER_ACCOUNTS = new Set([
  'Le Floch Thomas',
  'Mercier Hugo',
  'Kouassi Yanis',
  'Le Roux Pauline',
  'Morvan Anaïs',
  'Guillou Nicolas',
]);

const STAFF: { nom: string; prenom: string; role: ClubRole; email: string; joined: string }[] = [
  {
    nom: 'Cadiou',
    prenom: 'Hélène',
    role: 'ADMIN',
    email: 'helene.cadiou@abcens.fr',
    joined: '2025-08-25T18:42:00.000Z',
  },
  {
    nom: 'Le Bihan',
    prenom: 'Patrick',
    role: 'ADMIN',
    email: 'president@abcens.fr',
    joined: '2025-08-26T07:15:00.000Z',
  },
  {
    nom: 'Moreau',
    prenom: 'Sophie',
    role: 'MEMBER',
    email: 'tresorerie@abcens.fr',
    joined: '2025-08-27T19:03:00.000Z',
  },
  {
    nom: 'Garnier',
    prenom: 'Frédéric',
    role: 'MEMBER',
    email: 'frederic.garnier@abcens.fr',
    joined: '2025-08-28T20:31:00.000Z',
  },
];

function parseFrDate(value: string): string {
  const [d, m, y] = value.split('/');
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

// --- Opponents ----------------------------------------------------------

export interface Opponent {
  id: string;
  name: string;
  gym: string;
  address: string;
  travelMinutes: number;
  /** [day offset from Saturday, hour, minute] of their home games. */
  slot: [number, number, number];
  strength: number;
}

export const OPPONENTS: Opponent[] = [
  {
    name: 'Angers Doutre Basket',
    gym: 'Gymnase de la Doutre',
    address: '49100 Angers',
    travelMinutes: 65,
    slot: [0, 20, 30],
    strength: 9,
  },
  {
    name: 'Mauges Sèvre Basket',
    gym: 'Salle du Val de Sèvre',
    address: '49300 Cholet',
    travelMinutes: 60,
    slot: [1, 15, 30],
    strength: 5,
  },
  {
    name: 'Le Mans Sablons BC',
    gym: 'Gymnase des Sablons',
    address: '72100 Le Mans',
    travelMinutes: 115,
    slot: [0, 20, 0],
    strength: 8,
  },
  {
    name: 'Laval Saint-Nicolas Basket',
    gym: 'Salle Saint-Nicolas',
    address: '53000 Laval',
    travelMinutes: 95,
    slot: [0, 20, 30],
    strength: 4,
  },
  {
    name: 'Yon Bocage Basket',
    gym: 'Complexe du Bocage',
    address: '85000 La Roche-sur-Yon',
    travelMinutes: 70,
    slot: [1, 15, 30],
    strength: 7,
  },
  {
    name: 'Penhoët Basket Saint-Nazaire',
    gym: 'Salle de Penhoët',
    address: '44600 Saint-Nazaire',
    travelMinutes: 50,
    slot: [0, 19, 0],
    strength: 6,
  },
  {
    name: 'Saumur Nantilly BC',
    gym: 'Gymnase de Nantilly',
    address: '49400 Saumur',
    travelMinutes: 105,
    slot: [1, 15, 0],
    strength: 3,
  },
  {
    name: 'Sud Mayenne BC Château-Gontier',
    gym: 'Salle du Bellay',
    address: '53200 Château-Gontier-sur-Mayenne',
    travelMinutes: 80,
    slot: [0, 20, 30],
    strength: 5,
  },
  {
    name: 'Challans Marais Basket',
    gym: 'Salle du Marais',
    address: '85300 Challans',
    travelMinutes: 60,
    slot: [0, 20, 0],
    strength: 2,
  },
  {
    name: 'Sablé Vègre Basket',
    gym: 'Gymnase de la Vègre',
    address: '72300 Sablé-sur-Sarthe',
    travelMinutes: 100,
    slot: [1, 10, 30],
    strength: 1,
  },
  {
    name: "Guérande Presqu'île Basket",
    gym: 'Salle de Kerbiniou',
    address: '44350 Guérande',
    travelMinutes: 55,
    slot: [0, 18, 30],
    strength: 6,
  },
].map((o) => ({ ...o, id: uid(`opp-${o.name}`), slot: o.slot as [number, number, number] }));

// Our margin per journée: a team that wins most, loses a few, leads the poule.
// Losses fall on J3, J5, J10, J15 and J19, so the latest journée of every
// offered setting (4, 6, 8, 12 played) is a win to celebrate on screen.
const OUR_MARGINS = [12, 9, -4, 15, -6, 7, 21, 11, 3, -2, 8, 14, 6, 10, -7, 4, 13, 9, -3, 16, 5, 8];
const JOURNEES = 22;
/** Breaks (one or two weekends off) after these journées — only applied to the future. */
const BREAKS_AFTER: Record<number, number> = { 9: 2, 14: 1, 18: 1 };

// --- Events -------------------------------------------------------------

export interface RsvpBase {
  status: EventRsvpStatus | null;
  respondedAt: number | null;
  travelMode: EventTravelMode | null;
  viaLink: boolean;
}

export interface DemoEvent {
  id: string;
  teamId: string;
  type: EventType;
  startsAt: number;
  location: string;
  locationName: string | null;
  opponentName: string | null;
  opponentId: string | null;
  venue: EventVenue | null;
  recurrenceId: string | null;
  createdAt: number;
  isImported: boolean;
  timeConfirmed: boolean;
  notes: string | null;
  journee: number | null;
  travelMinutes: number | null;
}

export interface StatLine {
  teamPlayerId: string;
  jerseyNumber: number;
  points: number;
  fouls: number;
  freeThrowPoints: number;
  twoPointPoints: number;
  threePointPoints: number;
}

export interface PouleMatch {
  journee: number;
  homeId: string;
  awayId: string;
  homeScore: number | null;
  awayScore: number | null;
}

export interface World {
  now: number;
  config: DemoConfig;
  seasonYear: number;
  users: DemoUser[];
  players: DemoPlayer[];
  teams: DemoTeam[];
  showcase: DemoTeam;
  events: DemoEvent[];
  rsvps: Map<string, Map<string, RsvpBase>>;
  convocations: Map<string, Map<string, number>>;
  results: Map<string, { ourScore: number; theirScore: number }>;
  statLines: Map<string, StatLine[]>;
  /** BEST votes per match: voter teamPlayerId → voted teamPlayerId. */
  votes: Map<string, Map<string, string>>;
  /** Past matches' jersey wash holder (teamPlayerId). */
  jerseyHolders: Map<string, string>;
  ballsHolders: Map<string, string>;
  pouleMatches: PouleMatch[];
  /** Our matches in order, J1 → J22. */
  matches: DemoEvent[];
  nextMatch: DemoEvent;
  lastMatch: DemoEvent | null;
  personas: Record<PersonaKey, { userId: string; playerId: string; teamPlayerId: string }>;
  guardians: Map<
    string,
    {
      userId: string;
      firstName: string;
      lastName: string;
      email: string;
      linkedAt: string;
      consentGivenAt: string | null;
    }[]
  >;
}

function nameKey(p: { lastName: string; firstName: string }): string {
  return `${p.lastName} ${p.firstName}`;
}

/** Circle-method round robin over n teams; the return leg swaps home/away. */
function roundRobin(n: number): [number, number][][] {
  const ids = [...Array(n).keys()];
  const rounds: [number, number][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i];
      const b = ids[n - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    ids.splice(1, 0, ids.pop() as number);
  }
  return [...rounds, ...rounds.map((pairs) => pairs.map(([a, b]) => [b, a] as [number, number]))];
}

export function buildWorld(now: number, config: DemoConfig): World {
  const played = Math.max(1, Math.min(JOURNEES - 1, config.played));

  // People ----------------------------------------------------------------
  const users: DemoUser[] = [];
  const userByName = new Map<string, DemoUser>();
  for (const s of STAFF) {
    const u: DemoUser = {
      id: uid(`user-${s.prenom}-${s.nom}`),
      email: s.email,
      firstName: s.prenom,
      lastName: s.nom,
      clubRole: s.role,
      joinedAt: s.joined,
    };
    users.push(u);
    userByName.set(`${s.nom} ${s.prenom}`, u);
  }

  const rows = licencies as CsvRow[];
  const players: DemoPlayer[] = [];
  const importedAt = Date.parse('2025-08-25T19:05:00.000Z');
  rows.forEach((row, index) => {
    const key = `${row.nom} ${row.prenom}`;
    const isCoach = row.type === 'T';
    const isStaffOnly = row.type === 'AS';
    if (isStaffOnly) return;
    const profile = SF1_PROFILES[key];
    const hasAccount = (profile?.account ?? false) || OTHER_ACCOUNTS.has(key) || isCoach;
    let userId: string | null = null;
    if (hasAccount) {
      let u = userByName.get(key);
      if (!u) {
        u = {
          id: uid(`user-${key}`),
          email: emailOf(row.prenom, row.nom),
          firstName: row.prenom,
          lastName: row.nom,
          clubRole: 'MEMBER',
          joinedAt: iso(importedAt + (index + 3) * DAY + (hash(key) % (12 * HOUR))),
        };
        users.push(u);
        userByName.set(key, u);
      }
      userId = u.id;
    }
    const birthDate = parseFrDate(row.naissance);
    const isMinor = isMinorBirthDate(birthDate, new Date(now));
    const consentMissing = isMinor && (key === 'Even Marius' || key === 'Pineau Ambre');
    players.push({
      id: uid(`player-${key}`),
      clubId: CLUB.id,
      firstName: row.prenom,
      lastName: row.nom,
      userId,
      nationalId: null,
      licenseNumber: row.licence,
      birthDate,
      gender: row.sexe === 'F' ? 'WOMEN' : 'MEN',
      licenseType: row.type,
      isMinor,
      parentalConsentGivenAt:
        isMinor && !consentMissing ? iso(importedAt + 2 * DAY + (hash(key) % (5 * DAY))) : null,
      guardianCount: isMinor && !consentMissing ? 1 : 0,
      createdAt: iso(importedAt + index * 1000),
      teamName: isCoach
        ? key === 'Cadiou Hélène'
          ? 'Seniors Filles 1'
          : 'Seniors Garçons 1'
        : row.equipe,
    });
  });

  const guardians: World['guardians'] = new Map();
  const PARENT_FIRST = [
    'Céline',
    'Stéphane',
    'Aurélie',
    'David',
    'Sandrine',
    'Christophe',
    'Émilie',
    'Laurent',
    'Virginie',
    'Olivier',
  ];
  for (const p of players) {
    if (!p.isMinor || p.guardianCount === 0) continue;
    const first = PARENT_FIRST[hash(p.id) % PARENT_FIRST.length];
    guardians.set(p.id, [
      {
        userId: uid(`parent-${p.id}`),
        firstName: first,
        lastName: p.lastName,
        email: emailOf(first, p.lastName),
        linkedAt: p.parentalConsentGivenAt ?? p.createdAt,
        consentGivenAt: p.parentalConsentGivenAt,
      },
    ]);
  }

  // Teams -----------------------------------------------------------------
  const teams: DemoTeam[] = TEAM_DEFS.map((def) => {
    const teamId = uid(`team-${def.name}`);
    const createdAt = '2025-08-26T08:10:00.000Z';
    const members = players.filter((p) => p.teamName === def.name);
    const roster: TeamPlayer[] = members.map((p) => {
      const role: TeamMemberRole = p.licenseType === 'T' ? 'COACH' : 'PLAYER';
      return {
        id: uid(`tp-${teamId}-${p.id}`),
        teamId,
        playerId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        clubId: CLUB.id,
        role,
        jerseyDutyExempt: role === 'COACH',
        createdAt: iso(Date.parse(createdAt) + 2 * DAY),
      };
    });
    roster.sort((a, b) => Number(a.role === 'PLAYER') - Number(b.role === 'PLAYER'));
    const coach = def.coach ? users.find((u) => u.lastName === def.coach) : undefined;
    return {
      team: {
        id: teamId,
        name: def.name,
        category: def.category,
        gender: def.gender,
        createdAt,
        jerseyRotationEnabled: def.name === 'Seniors Filles 1',
      },
      roster,
      adminUserIds: coach ? [coach.id] : [],
      trainings: def.trainings,
      isShowcase: def.name === 'Seniors Filles 1',
    };
  });
  const showcase = teams[0];
  const tpOf = (lastFirst: string) => {
    const tp = showcase.roster.find((r) => nameKey(r) === lastFirst);
    if (!tp) throw new Error(`no roster entry ${lastFirst}`);
    return tp;
  };
  const coachTp = tpOf('Cadiou Hélène');
  const leaTp = tpOf('Moreau Léa');
  const sf1Players = showcase.roster.filter((r) => r.role === 'PLAYER');
  const jerseyOf = (tpId: string) => {
    const tp = showcase.roster.find((r) => r.id === tpId);
    return tp ? (SF1_PROFILES[nameKey(tp)]?.jersey ?? 0) : 0;
  };

  // Season calendar ------------------------------------------------------
  const today = parisDayStart(now);
  const weekday = parisWeekday(now);
  const thisSaturday = parisDayStart(today, (6 - weekday + 7) % 7);
  const saturdayOf = (j: number): number => {
    const next = played + 1;
    let weeks = j - next;
    if (j > next) {
      for (const [after, gap] of Object.entries(BREAKS_AFTER)) {
        if (Number(after) >= next && Number(after) < j) weeks += gap;
      }
    }
    return parisDayStart(thisSaturday, weeks * 7);
  };
  const firstSaturday = saturdayOf(1);
  const p1 = parisParts(firstSaturday);
  const seasonYear = p1.month >= 8 ? p1.year : p1.year - 1;

  const poule: { id: string; name: string; strength: number }[] = [
    { id: 'us', name: CLUB.name, strength: 9 },
    ...OPPONENTS.map((o) => ({ id: o.id, name: o.name, strength: o.strength })),
  ];
  const rounds = roundRobin(poule.length);
  const pouleMatches: PouleMatch[] = [];
  const events: DemoEvent[] = [];
  const matches: DemoEvent[] = [];
  let ourIndex = 0;

  // Target records at `played` journées: a believable spread under us, the
  // strongest sides closest, nobody above. The only freedom is who beats
  // whom among the other eleven, so winners are picked to hit the targets.
  const ourWins = OUR_MARGINS.slice(0, played).filter((m) => m > 0).length;
  const others = poule.slice(1).sort((x, y) => y.strength - x.strength);
  const totalOtherWins = (poule.length / 2) * played - ourWins;
  const mean = totalOtherWins / others.length;
  // A strict lead when the season leaves room for a spread under it; early
  // on, the best sides can only be level with us.
  const cap = Math.min(played, ourWins - 1 - mean >= 1 ? ourWins - 1 : ourWins);
  const spread = Math.max(0, Math.min(cap - mean, mean));
  const target = new Map<string, number>();
  others.forEach((t, i) => {
    const k = 1 - (2 * i) / (others.length - 1);
    target.set(t.id, Math.max(0, Math.min(cap, Math.round(mean + spread * k))));
  });
  let gap = totalOtherWins - [...target.values()].reduce((a, b) => a + b, 0);
  for (let guard = 0; gap !== 0 && guard < 200; guard++) {
    const order = gap > 0 ? others : [...others].reverse();
    for (const t of order) {
      const v = target.get(t.id) as number;
      if (gap > 0 && v < cap) {
        target.set(t.id, v + 1);
        gap--;
      } else if (gap < 0 && v > 0) {
        target.set(t.id, v - 1);
        gap++;
      }
      if (gap === 0) break;
    }
  }
  const wins = new Map<string, number>();
  const games = new Map<string, number>();
  const tally = (id: string, won: boolean) => {
    games.set(id, (games.get(id) ?? 0) + 1);
    if (won) wins.set(id, (wins.get(id) ?? 0) + 1);
  };
  const need = (id: string) => {
    const remaining = played - (games.get(id) ?? 0);
    return ((target.get(id) ?? 0) - (wins.get(id) ?? 0)) / Math.max(1, remaining);
  };

  rounds.forEach((pairs, r) => {
    const journee = r + 1;
    const saturday = saturdayOf(journee);
    const isPlayed = journee <= played;
    for (const [h, a] of pairs) {
      const home = poule[h];
      const away = poule[a];
      let homeScore: number | null = null;
      let awayScore: number | null = null;
      if (isPlayed) {
        const base = 56 + Math.round(rand(`base-${journee}-${h}-${a}`) * 16);
        let margin: number;
        if (h === 0 || a === 0) {
          const ours = OUR_MARGINS[ourIndex];
          margin = h === 0 ? ours : -ours;
        } else {
          const nh = need(home.id) + home.strength * 0.01 + rand(`n-${journee}-${h}`) * 0.001;
          const na = need(away.id) + away.strength * 0.01 + rand(`n-${journee}-${a}`) * 0.001;
          const size =
            2 +
            Math.round(
              Math.abs(home.strength - away.strength) * 1.5 + rand(`m-${journee}-${h}-${a}`) * 12,
            );
          margin = nh >= na ? size : -size;
        }
        tally(home.id, margin > 0);
        tally(away.id, margin < 0);
        homeScore = margin > 0 ? base + margin : base;
        awayScore = margin > 0 ? base : base - margin;
      }
      pouleMatches.push({ journee, homeId: home.id, awayId: away.id, homeScore, awayScore });

      if (h === 0 || a === 0) {
        const isHome = h === 0;
        const opponent = OPPONENTS.find((o) => o.id === (isHome ? away.id : home.id)) as Opponent;
        const [dayOffset, hour, minute] = isHome ? [0, 20, 30] : opponent.slot;
        // FFBB hasn't published the last journées' time yet (« horaire à confirmer »).
        const unconfirmed = journee > JOURNEES - 3;
        const event: DemoEvent = {
          id: uid(`match-${journee}`),
          teamId: showcase.team.id,
          type: 'MATCH',
          startsAt: atParis(saturday, dayOffset, hour, minute),
          location: isHome ? HOME_GYM.address : opponent.address,
          locationName: isHome ? HOME_GYM.name : opponent.gym,
          opponentName: opponent.name,
          opponentId: opponent.id,
          venue: isHome ? 'HOME' : 'AWAY',
          recurrenceId: null,
          createdAt: Date.parse('2025-08-30T09:12:00.000Z'),
          isImported: true,
          timeConfirmed: !unconfirmed,
          notes: null,
          journee,
          travelMinutes: isHome ? null : opponent.travelMinutes,
        };
        events.push(event);
        matches.push(event);
        ourIndex += 1;
      }
    }
  });

  repairStandings(pouleMatches, played, cap < ourWins);

  // Trainings ------------------------------------------------------------
  const seasonStart = parisDayStart(firstSaturday, -26);
  const seasonEnd = parisDayStart(saturdayOf(JOURNEES), 56);
  for (const t of teams) {
    for (const [wd, hour, minute] of t.trainings) {
      const recurrenceId = uid(`series-${t.team.id}-${wd}`);
      const firstDay = parisDayStart(seasonStart, (wd - parisWeekday(seasonStart) + 7) % 7);
      for (let day = firstDay; day < seasonEnd; day = parisDayStart(day, 7)) {
        const startsAt = atParis(day, 0, hour, minute);
        events.push({
          id: uid(`training-${t.team.id}-${startsAt}`),
          teamId: t.team.id,
          type: 'TRAINING',
          startsAt,
          location: HOME_GYM.address,
          locationName: HOME_GYM.name,
          opponentName: null,
          opponentId: null,
          venue: null,
          recurrenceId,
          createdAt: Date.parse('2025-08-28T20:40:00.000Z'),
          isImported: false,
          timeConfirmed: true,
          notes: null,
          journee: null,
          travelMinutes: null,
        });
      }
    }
  }
  events.sort((a, b) => a.startsAt - b.startsAt);

  const nextMatch = matches.find((m) => m.startsAt > now) ?? matches[matches.length - 1];
  const pastMatches = matches.filter((m) => m.startsAt + 2 * HOUR < now);
  const lastMatch = pastMatches[pastMatches.length - 1] ?? null;

  // Results, from the repaired poule --------------------------------------
  const results: World['results'] = new Map();
  for (const m of matches) {
    const pm = pouleMatches.find(
      (x) => x.journee === m.journee && (x.homeId === 'us' || x.awayId === 'us'),
    ) as PouleMatch;
    if (pm.homeScore === null || pm.awayScore === null || m.startsAt > now) continue;
    const ourScore = pm.homeId === 'us' ? pm.homeScore : pm.awayScore;
    const theirScore = pm.homeId === 'us' ? pm.awayScore : pm.homeScore;
    results.set(m.id, { ourScore, theirScore });
  }

  // RSVPs and convocations -------------------------------------------------
  const rsvps: World['rsvps'] = new Map();
  const convocations: World['convocations'] = new Map();
  const statLines: World['statLines'] = new Map();
  const votes: World['votes'] = new Map();
  const jerseyHolders: World['jerseyHolders'] = new Map();
  const ballsHolders: World['ballsHolders'] = new Map();

  for (const e of events) {
    const team = teams.find((t) => t.team.id === e.teamId) as DemoTeam;
    const map = new Map<string, RsvpBase>();
    const isPast = e.startsAt < now;
    const daysAhead = (e.startsAt - now) / DAY;
    if (e.type === 'TRAINING') {
      for (const tp of team.roster) {
        const r = rand(`rsvp-${e.id}-${tp.id}`);
        const answerChance = isPast ? 0.95 : daysAhead < 3 ? 0.6 : daysAhead < 8 ? 0.25 : 0.04;
        if (r > answerChance || (!isPast && tp.id === leaTp.id && daysAhead < 8)) continue;
        const s = rand(`status-${e.id}-${tp.id}`);
        const status: EventRsvpStatus = s < 0.8 ? 'GOING' : s < 0.9 ? 'NOT_GOING' : 'MAYBE';
        map.set(tp.id, {
          status,
          respondedAt: e.startsAt - (1 + Math.floor(rand(`at-${e.id}-${tp.id}`) * 70)) * HOUR,
          travelMode: null,
          viaLink: rand(`via-${e.id}-${tp.id}`) < 0.15,
        });
      }
      rsvps.set(e.id, map);
      continue;
    }

    // Our matches.
    const journee = e.journee as number;
    const conv = new Map<string, number>();
    const convokedAt = e.startsAt - 6 * DAY + 19 * HOUR;
    const isNext = e.id === nextMatch.id;
    const isConvokedYet = isPast || isNext;
    if (isConvokedYet) {
      // Ten players a match; two sit out, rotating (never Léa, the persona).
      const benchable = sf1Players.filter((p) => p.id !== leaTp.id);
      const out = isNext
        ? [tpOf('Petit Zoé').id, tpOf('Perrin Maëlys').id]
        : [
            benchable[(journee * 2) % benchable.length].id,
            benchable[(journee * 2 + 5) % benchable.length].id,
          ];
      for (const tp of showcase.roster) {
        if (out.includes(tp.id)) continue;
        conv.set(tp.id, isNext ? now - 2 * DAY - 3 * HOUR : convokedAt);
      }
    }
    convocations.set(e.id, conv);

    const away = e.venue === 'AWAY';
    for (const tp of showcase.roster) {
      const convoked = conv.has(tp.id);
      const mode = (): EventTravelMode | null =>
        away ? (rand(`tm-${e.id}-${tp.id}`) < 0.75 ? 'MEETING_POINT' : 'DIRECT') : null;
      if (isPast) {
        if (convoked) {
          map.set(tp.id, {
            status: 'GOING',
            respondedAt: convokedAt + (2 + Math.floor(rand(`ra-${e.id}-${tp.id}`) * 40)) * HOUR,
            travelMode: mode(),
            viaLink: rand(`vl-${e.id}-${tp.id}`) < 0.2,
          });
        } else if (rand(`nc-${e.id}-${tp.id}`) < 0.6) {
          map.set(tp.id, {
            status: rand(`ncs-${e.id}-${tp.id}`) < 0.5 ? 'GOING' : 'NOT_GOING',
            respondedAt: convokedAt - 2 * DAY,
            travelMode: null,
            viaLink: false,
          });
        }
      } else if (isNext) {
        const plan: Record<string, EventRsvpStatus | null> = {
          'Traoré Inès': 'GOING',
          'Diallo Amina': 'GOING',
          'Fontaine Emma': 'GOING',
          'Bernard Chloé': 'GOING',
          'Lambert Manon': 'GOING',
          'Marchand Sarah': 'GOING',
          'Guérin Jade': 'MAYBE',
          'Roux Camille': 'NOT_GOING',
          'Cadiou Hélène': 'GOING',
          'Le Gall Clara': null,
          'Moreau Léa': null,
        };
        const status = plan[nameKey(tp)] ?? null;
        if (!status) continue;
        map.set(tp.id, {
          status,
          respondedAt: now - (4 + Math.floor(rand(`nr-${tp.id}`) * 40)) * HOUR,
          travelMode: status === 'GOING' ? mode() : null,
          viaLink: nameKey(tp) === 'Marchand Sarah' || nameKey(tp) === 'Roux Camille',
        });
      } else if (rand(`fut-${e.id}-${tp.id}`) < 0.08) {
        map.set(tp.id, {
          status: 'GOING',
          respondedAt: now - 20 * HOUR,
          travelMode: null,
          viaLink: false,
        });
      }
    }
    rsvps.set(e.id, map);

    const result = results.get(e.id);
    if (result) {
      const scorers = sf1Players.filter((p) => conv.has(p.id));
      statLines.set(e.id, distributePoints(e.id, result.ourScore, scorers, jerseyOf));
      // MVP votes: most of the players who played vote, mostly for the top scorers.
      const lines = [...(statLines.get(e.id) as StatLine[])].sort((a, b) => b.points - a.points);
      const ballot = new Map<string, string>();
      for (const voter of scorers) {
        const isLatest = lastMatch && e.id === lastMatch.id;
        if (voter.id === leaTp.id && isLatest) continue;
        if (rand(`vote-${e.id}-${voter.id}`) > 0.85) continue;
        const pick = rand(`pick-${e.id}-${voter.id}`);
        const candidates = lines.filter((l) => l.teamPlayerId !== voter.id);
        const choice = candidates[pick < 0.6 ? 0 : pick < 0.85 ? 1 : 2] ?? candidates[0];
        ballot.set(voter.id, choice.teamPlayerId);
      }
      votes.set(e.id, ballot);
    }
  }

  // Jersey wash: every past match had a holder, rotating; Léa hasn't had a
  // turn yet, so she is the next match's suggestion.
  const rotation = [
    'Traoré Inès',
    'Fontaine Emma',
    'Bernard Chloé',
    'Diallo Amina',
    'Guérin Jade',
    'Lambert Manon',
    'Le Gall Clara',
    'Roux Camille',
    'Marchand Sarah',
    'Petit Zoé',
    'Perrin Maëlys',
  ];
  matches
    .filter((m) => m.startsAt < now)
    .forEach((m, i) => jerseyHolders.set(m.id, tpOf(rotation[i % rotation.length]).id));
  matches.forEach((m, i) => {
    if (m.startsAt < now || m.id === nextMatch.id) {
      ballsHolders.set(m.id, tpOf(['Le Gall Clara', 'Bernard Chloé', 'Guérin Jade'][i % 3]).id);
    }
  });

  const helene = userByName.get('Cadiou Hélène') as DemoUser;
  const lea = userByName.get('Moreau Léa') as DemoUser;
  return {
    now,
    config: { played },
    seasonYear,
    users,
    players,
    teams,
    showcase,
    events,
    rsvps,
    convocations,
    results,
    statLines,
    votes,
    jerseyHolders,
    ballsHolders,
    pouleMatches,
    matches,
    nextMatch,
    lastMatch,
    guardians,
    personas: {
      coach: { userId: helene.id, playerId: coachTp.playerId, teamPlayerId: coachTp.id },
      joueuse: { userId: lea.id, playerId: leaTp.playerId, teamPlayerId: leaTp.id },
    },
  };
}

/**
 * Safety net under the target records (the sides that beat us got wins the
 * targets didn't plan for): any team above us, or level with us when the
 * lead is meant to be strict, gives up one of its wins against a third
 * team. Early-season ties stay; the standings put us first among equals and
 * show no point difference to contradict it.
 */
function repairStandings(matches: PouleMatch[], played: number, strict: boolean): void {
  const pointsOf = () => {
    const pts = new Map<string, number>();
    for (const m of matches) {
      if (m.journee > played || m.homeScore === null || m.awayScore === null) continue;
      const homeWon = m.homeScore > m.awayScore;
      pts.set(m.homeId, (pts.get(m.homeId) ?? 0) + (homeWon ? 2 : 1));
      pts.set(m.awayId, (pts.get(m.awayId) ?? 0) + (homeWon ? 1 : 2));
    }
    return pts;
  };
  const winsOf = (teamId: string) =>
    matches.filter(
      (m) =>
        m.journee <= played &&
        m.homeScore !== null &&
        m.awayScore !== null &&
        m.homeId !== 'us' &&
        m.awayId !== 'us' &&
        ((m.homeId === teamId && m.homeScore > m.awayScore) ||
          (m.awayId === teamId && m.awayScore > m.homeScore)),
    );
  const loserOf = (m: PouleMatch, winnerId: string) =>
    m.homeId === winnerId ? m.awayId : m.homeId;
  const flip = (m: PouleMatch) => {
    [m.homeScore, m.awayScore] = [m.awayScore, m.homeScore];
  };

  // Nobody above us.
  for (let guard = 0; guard < 400; guard++) {
    const pts = pointsOf();
    const ours = pts.get('us') ?? 0;
    const rival = [...pts.entries()].find(
      ([id, p]) => id !== 'us' && (strict ? p >= ours : p > ours),
    );
    if (!rival) break;
    const m = winsOf(rival[0]).sort(
      (a, b) => (pts.get(loserOf(a, rival[0])) ?? 0) - (pts.get(loserOf(b, rival[0])) ?? 0),
    )[0];
    if (!m) break;
    flip(m);
  }
  // Then break ties where a flip can't lift anyone to our level.
}

/** Splits our score over the players who played, as made baskets. */
function distributePoints(
  eventId: string,
  total: number,
  scorers: TeamPlayer[],
  jerseyOf: (tpId: string) => number,
): StatLine[] {
  const weights = scorers.map((p) => {
    const w = SF1_PROFILES[`${p.lastName} ${p.firstName}`]?.weight ?? 3;
    return w * (0.55 + rand(`w-${eventId}-${p.id}`) * 0.9);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  const points = weights.map((w) => Math.floor((w / sum) * total));
  let rest = total - points.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % points.length, rest--) points[i] += 1;
  return scorers.map((p, i) => {
    const pts = points[i];
    let three = Math.floor((pts * (0.15 + rand(`3-${eventId}-${p.id}`) * 0.25)) / 3) * 3;
    let ft = Math.min(pts - three, Math.floor(rand(`ft-${eventId}-${p.id}`) * 6));
    if ((pts - three - ft) % 2 !== 0) ft = ft > 0 ? ft - 1 : ft + 1;
    if (pts - three - ft < 0) {
      three = 0;
      ft = pts % 2;
    }
    return {
      teamPlayerId: p.id,
      jerseyNumber: jerseyOf(p.id),
      points: pts,
      fouls: Math.floor(rand(`f-${eventId}-${p.id}`) * 4.6),
      freeThrowPoints: ft,
      twoPointPoints: pts - three - ft,
      threePointPoints: three,
    };
  });
}
