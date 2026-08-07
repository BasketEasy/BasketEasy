# BasketEasy — Brand

## Identity

- **Name:** BasketEasy
- **Tagline (FR):** *La gestion d'équipe, simplifiée.*
- **Landing headline (FR):** *Moins de tableurs, plus de terrain.*
- **Landing subhead (FR):** BasketEasy centralise calendriers, créneaux et feuilles de marque pour les clubs de basket amateurs de Loire-Atlantique. Pensé pour les bénévoles, pas pour les DSI.
- **Footer line:** Données hébergées en France · RGPD

## Positioning

BasketEasy is a companion layer for French amateur basketball clubs, not a replacement for the FFBB's official stack (FBI, e-Marque V2). It sits between the federal system and a club's day-to-day life, solving what neither the federation nor the generic incumbents (Kalisport, AssoConnect, SportEasy) cover well:

- **Multi-club team structures are the norm, not the exception**, in Loire-Atlantique (CTC/ententes) — existing tools assume one club, one roster.
- **Nobody owns basketball-specific team-day tooling** in the French market — incumbents are generic multi-sport administration software.
- **French payment and hosting expectations are non-negotiable** — HelloAsso-style dues collection, France/EU hosting, RGPD-by-default for minors' data.

Launch market: Loire-Atlantique (CD44), ~130 affiliated clubs, ~28,000 licensed players — pilot with 1–2 CD44 clubs before wider Pays de la Loire rollout, mirroring how the regional incumbent (Kalisport) itself grew through the Grand Ouest.

## Visual system

| Token | Value | Use |
|---|---|---|
| Orange primaire | `#D4622A` | primary brand color, CTAs, active states |
| Bleu-vert secondaire | `#1E5F74` | secondary accent, links, info states |
| Crème (fond) | `#FAF5EF` | background |
| Charbon (texte) | `#23201C` | primary text |

- **Titrage (headings):** Barlow Condensed, weight 700–800
- **Texte (body):** Inter, weight 400–600
- **Logomark:** a basketball rendered as a circle with crosshair seams inside a rounded-square orange tile — reads at both app-icon and favicon sizes.

These tokens should be wired into `packages/ui`'s Tailwind theme as the design system matures (see `docs/frontend-stack.md` — shadcn/ui primitives, fully restylable).
