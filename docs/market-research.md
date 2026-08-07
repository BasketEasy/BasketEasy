# France & Loire-Atlantique — Amateur Basketball Market Research

*Narrowing the target market to France, launch-first in Loire-Atlantique (department 44 / Nantes area).*

---

## 1. Why France Changes the Picture

French amateur basketball is fully federated, and that structure changes the product requirements more than anything else:

- **FFBB → Ligue régionale → Comité départemental → Club.** Every player is a *licencié* registered in the federation's official database, **FBI** (Fichier des Basketteurs Informatisé). A team-org product cannot be a closed silo — clubs already run on a mandatory federal backbone (licensing, official scoresheet) that any new tool has to coexist with.
- **Official electronic scoresheet is mandatory**, not optional: **e-Marque V2**, developed by FFBB, is required for any competitive game and files results directly to the federation.
- **Payment culture differs from the US.** HelloAsso — a free, French, donation/fee platform used by roughly 420,000 associations — is the default rail for membership dues, not Venmo/PayPal/Stripe-first checkout.
- **Gym access differs structurally.** Practice happens almost entirely in municipally-owned *gymnases*, with time slots (*créneaux*) allocated once a year by the town hall (*mairie*) and shared across multiple clubs and sports — not privately booked or club-owned facilities.
- **Medical compliance is a recurring federal requirement**, not something an app manages independently: a *certificat médical* (or a *questionnaire de santé* for renewal) is required to hold a license, valid up to three seasons before a new one is needed.
- **Volunteer shortage is a documented national crisis.** 43% of French sports clubs report a decline in volunteer numbers and 66% report less consistent involvement; president and treasurer positions increasingly go unfilled, with administrative overload cited as a leading driver.

## 2. Loire-Atlantique Snapshot (CD44)

| Metric | Value |
|---|---|
| Clubs affiliated to the Comité Départemental de Loire-Atlantique de Basket-Ball (CD44) | ~130 |
| Licensed players (record, May 2025) | ~28,276 |
| Governing body's own website software | Kalisport (FFBB-recommended) |

Many clubs are grouped into **CTC** (*Coopérations Territoriales de Clubs* / ententes between neighboring clubs) because no single club can field a full team in every age category alone — e.g. CTC Pôle West Nantais and CTC Basse Goulaine–Saint-Sébastien–Vertou. A "team" in Loire-Atlantique frequently spans multiple clubs, multiple boards, and multiple sets of volunteers.

A representative mid-size club for sizing the product around: COC Basket (Couëron) — 422 licensed players, 29 teams from U9 to Seniors.

## 3. France-Specific Problematics

| # | Problematic | Detail |
|---|---|---|
| 1 | Mandatory federal licensing overhead | Every player/coach must be registered in FBI each season |
| 2 | Annual medical clearance bureaucracy | *Certificat médical* / *questionnaire de santé*, expires and must be renewed |
| 3 | Separate mandatory scoresheet system | e-Marque V2 is a distinct login/tool; roster and lineup data has to be re-entered or manually reconciled |
| 4 | Shared municipal gym slots | *Créneaux* allocated by the *mairie*, often insufficient, shared across clubs/sports |
| 5 | Volunteer shortage | President/treasurer roles frequently unfilled |
| 6 | Multi-club team structures (CTC/ententes) | A single team can span 2–3 clubs' rosters, boards, and volunteer pools |
| 7 | RGPD (GDPR) obligations | Stricter default legal expectation for minors' data |
| 8 | Subsidy dependency | Club budgets lean on municipal/departmental *subventions*, itself an administrative burden |
| 9 | Referee shortage & compliance | Volunteer referees face the same medical-clearance bureaucracy |
| 10 | Mixed payment habits | Cash and cheque still common; online payment (mostly HelloAsso) growing but not universal |

## 4. Competitive Landscape

| Product | Focus | Basketball-specific? | FFBB/e-licence integration | Local footprint |
|---|---|---|---|---|
| FFBB stack (FBI, e-Marque V2) | Official licensing, scoresheets, results | Yes | N/A — it's the source of truth | Universal (mandatory) |
| Kalisport | Multi-sport club/committee management | No | FBI V2 import/export connector | Strong in Grand Ouest — CD44's own site runs on it |
| AssoConnect | Association management | No | FFBB-recommended | National, generic |
| SportEasy | Team/club coordination | No (strong in football) | None specific to FFBB | National, French-built |
| HelloAsso | Free membership & payment collection | No | None | Near-universal as a payment rail |
| TeamSnap / Spond / GameChanger (US) | Team management / scorekeeping | GameChanger yes | None | Effectively absent in French amateur basketball |

## 5. Whitespace for a Loire-Atlantique-First Product

1. Nobody in the French market owns basketball-specific team-day tooling.
2. The federal stack (FBI/e-Marque V2) and day-to-day team tools are fully disconnected — a lightweight bridge is a distinctive value proposition nobody currently offers.
3. CTC/entente-style multi-club teams are structurally unaddressed by existing tools.
4. Shared municipal gym-slot visibility is unaddressed everywhere, more structurally important in France than in the US.
5. Kalisport's regional dominance validates that a French-hosted, RGPD-compliant, volunteer-time-saving product does get regional adoption — supporting a Loire-Atlantique-first go-to-market.

## 6. Recommendations

| Priority | Recommendation |
|---|---|
| P0 | Host in France/EU, RGPD-compliant by default |
| P0 | Support HelloAsso-style free/low-fee payment collection |
| P0 | Roster fields aware of FFBB license number and medical-certificate status/expiry |
| P1 | Multi-club ("CTC/entente") team support |
| P1 | Shared gym-slot scheduling designed for municipally-allocated *créneaux* |
| P1 | Fair playing-time tracking and lightweight basketball stats |
| P2 | Import/export bridge with e-Marque V2 results |
| Go-to-market | Pilot with 1–2 CD44-affiliated clubs before wider Pays de la Loire rollout |

*Full sourcing (FFBB, Kalisport, AssoConnect, SportEasy, HelloAsso, CD44, Sénat, sports.gouv.fr) is available in the original research doc kept in project knowledge.*
