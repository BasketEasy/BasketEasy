# BasketEasy — Full Feature Set to Lead the Loire-Atlantique Market

*Based on `market-research.md`, revised against real build constraints (no FBI/e-Marque API access, gym booking owned by city councils).*

---

## P0 — Table Stakes

- **France/EU hosting, RGPD-compliant by default** — non-negotiable for handling minors' data; matches Kalisport's own core selling point.
- **HelloAsso-style payment collection** — free/tip-based dues collection, not card-only Stripe checkout. French treasurers expect this rail.
- **Basic team-day tools** — calendar, convocations (call-ups), RSVP.

---

## P1 — Differentiators (the actual whitespace)

- **Multi-club team support (CTC/entente)** — a single team can pull players, staff, and admin rights from 2–3 different clubs; rosters and permissions need to model this natively, not bolt it on.
- **Internal créneaux scheduling** — visibility into which team/club has which slot when, conflict flags when two internal bookings overlap. Scoped to coordination only — gym allocation itself stays with the mairie.
- **Post-game scoresheet capture (AI-assisted)** — photo/scan of the official *feuille de marque* at game end, parsed by an AI model to auto-populate match details, box score, and per-player stats into the DB. Sidesteps the lack of e-Marque API access while still getting structured match data.
- **Fair playing-time tracking** — automatic minutes-per-player tracking against team rules (mandatory minutes for younger categories), surfaced to coaches and parents, fed by the scoresheet capture above.

---

## P2 — Leadership Features

- **Volunteer role management** — track who holds président/trésorier/other board roles per club (and per CTC), flag vacancies, lower the barrier to stepping into unfilled roles. Targets the #1 national concern (43% decline in volunteers).
- **Subsidy (subvention) paperwork assistant** — templated, pre-filled annual grant applications for municipal/departmental subsidies, pulling from data already in the system (licensee counts, team counts, activity reports).
- **Cross-club/CTC admin dashboard** — governance view for CTC coordinators spanning multiple clubs' boards, one place to manage decisions instead of fragmented email threads.
- **Mixed payment support** — cash/cheque logging alongside HelloAsso online payments, since grassroots dues collection is still mixed-mode.
- **Parent/player self-service** — playing-time visibility and stats for parents, built on top of scoresheet-capture data.
- **Regional network effects** — once one CD44 club or CTC adopts it, make it trivial for neighboring clubs (opponents, CTC partners) to join and share fixtures/results, mirroring how Kalisport spread through the Grand Ouest.
- **Multi-sport extensibility (optional, later)** — Kalisport and SportEasy both win partly by covering every sport a club runs. Not a beachhead priority.

---

## Later / Deprioritized

- **Chat/messaging** — useful eventually, not needed for the first wedge; RSVP + calendar covers the core loop for now.

---

## Cut — Not Pursuing (blocked or already covered elsewhere)

- **FFBB license number field per player** — redundant without FBI API access, which the federation won't grant easily.
- **Medical certificate / questionnaire de santé tracking** — dropped.
- **e-Marque V2 bridge (direct import/export)** — same blocker as FBI: no API access. The scoresheet-capture feature above is the workaround.
- **Referee assignment & compliance** — already handled on the FFBB side.
- **Gym-slot negotiation workflow** — gym allocation itself is the city council's job, not ours; scope stays at internal visibility only.

---

## Explicitly Out of Scope

Already commoditized by Kalisport/AssoConnect/SportEasy — don't over-invest here:

- Generic club website builders
- General accounting/bookkeeping suites
- Multi-sport administration beyond basketball (unless pursuing P2 extensibility later)

---

## Go-to-Market Note

Pilot with 1–2 CD44-affiliated clubs (e.g. a mid-size club like COC Basket, or a CTC grouping) before wider Pays de la Loire rollout — mirrors Kalisport's own regional-first growth pattern in the Grand Ouest.
