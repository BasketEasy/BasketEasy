# Kluvo — Brand

## Identity

- **Name:** Kluvo
- **Tagline (FR):** _La gestion d'équipe, simplifiée._
- **Landing headline (FR):** _Moins de tableurs, plus de terrain._
- **Landing subhead (FR):** Kluvo centralise calendriers, convocations et présences pour les clubs de basket amateurs — y compris quand une équipe réunit plusieurs clubs. Pensé pour les bénévoles, pas pour les DSI. _(Changed from "résultats" to "convocations": no `Result`/score field exists anywhere in the `Event` data model — see `CLAUDE.md`'s Events module section — so the previous wording claimed a capability that isn't built. `CLAUDE.md` governs what we may claim ships; this doc follows.)_
- **Footer line:** Données hébergées en France · RGPD

The landing page deliberately doesn't name FBI/e-Marque V2/FFBB or lock the pitch to a region — that reads as internal competitive strategy, not a visitor-facing benefit (founder call on PR #21). The one differentiator surfaced above the fold is a plain "Pensé pour les CTC" badge; the fuller strategic framing below still holds internally, it just isn't recited verbatim on the page. The launch market itself (Loire-Atlantique/CD44-first) hasn't changed — only the marketing copy's framing has.

## Positioning

Kluvo is a companion layer for French amateur basketball clubs, not a replacement for the FFBB's official stack (FBI, e-Marque V2). It sits between the federal system and a club's day-to-day life, solving what neither the federation nor the generic incumbents (Kalisport, AssoConnect, SportEasy) cover well:

- **Multi-club team structures are the norm, not the exception**, in Loire-Atlantique (CTC/ententes) — existing tools assume one club, one roster.
- **Nobody owns basketball-specific team-day tooling** in the French market — incumbents are generic multi-sport administration software.
- **French payment and hosting expectations are non-negotiable** — HelloAsso-style dues collection, France/EU hosting, RGPD-by-default for minors' data.

Launch market: Loire-Atlantique (CD44), ~130 affiliated clubs, ~28,000 licensed players — pilot with 1–2 CD44 clubs before wider Pays de la Loire rollout, mirroring how the regional incumbent (Kalisport) itself grew through the Grand Ouest.

## Visual system

| Token                | Value     | Use                                              |
| -------------------- | --------- | ------------------------------------------------ |
| Orange primaire      | `#D4622A` | primary brand color, CTAs, active states         |
| Bleu-vert secondaire | `#1E5F74` | secondary accent, links, info states             |
| Crème                | `#FAF5EF` | elevated-content surface (see `surface-2` below) |
| Charbon (texte)      | `#23201C` | primary text                                     |

- **Titrage (headings):** Big Shoulders Display, weight 700–800
- **Texte (body):** Atkinson Hyperlegible, weight 400–700
- **Logomark:** a basketball rendered as a circle with crosshair seams inside a rounded-square orange tile — reads at both app-icon and favicon sizes.

### Surface ladder

`Crème #FAF5EF` is no longer the page background — it's `surface-2`, one step up from the page itself. The page background is `ground`, a step darker, so elevated content (cards, dialogs, inputs) reads as sitting on top of the page rather than blending into it.

| Token       | Value     | Use                                                                              |
| ----------- | --------- | -------------------------------------------------------------------------------- |
| `sunk`      | `#E9DDCA` | recessed areas (e.g. pressed/inset states)                                       |
| `ground`    | `#EFE4D4` | page background                                                                  |
| `surface-2` | `#FAF5EF` | inputs and other content nested inside a `surface` block (same value as `cream`) |
| `surface`   | `#FFFCF7` | elevated primitives: Card, Dialog, DropdownMenu content                          |

These tokens should be wired into `packages/@basketeasy/ui`'s Tailwind theme as the design system matures (see `docs/frontend-stack.md` — shadcn/ui primitives, fully restylable).
