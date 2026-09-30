# Match page revamp: implementation plan

**Status:** plan, not built. **Date:** 2026-09-30.

Design canvas: https://claude.ai/artifact/VHmwSUJyvYhmHQmTuPi7yo. Its source is committed at [`assets/2026-09-30-match-page-revamp/`](./assets/2026-09-30-match-page-revamp/) (one `.dc.html` per artboard, open in a browser). Venue editing rules: [`2026-09-30-manual-match-venue-design.md`](./2026-09-30-manual-match-venue-design.md).

Five parts, each its own PR, in this order. Parts 1–2 are independent of the venue backend; Part 3 depends on Part 4's API.

## Mockups: source of truth for pixel-perfect

The mockups are built from the real tokens and component classes, not an approximation: every value in them comes from `tailwind-preset.cjs` or a component's `cva` classes. Implement each element with the component and props in the table, and the result matches the mockup. Where a mockup value has no row here, it is layout (flex, gap, padding on the Tailwind 4px scale: `gap: 14px` = `gap-3.5`) and stays caller-side.

| Mockup class                                    | Component and props                                                                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `.card.card-raised`                             | `Card` (default `raised`) + caller padding `p-4` (mobile) / `p-6` (desktop hero)                                |
| `.card.card-flush`                              | `Card variant="flush"`                                                                                          |
| `.card.card-inset`                              | `Card variant="inset"`                                                                                          |
| `.card-inset.card-tone-accent`                  | `Card variant="inset" tone="accent"`                                                                            |
| `.card-inset.card-tone-structure`               | `Card variant="inset" tone="structure"`                                                                         |
| `.btn.btn-default.btn-default-size`             | `Button` (default variant and size)                                                                             |
| `.btn.btn-outline.btn-sm`                       | `Button variant="outline" size="sm"`                                                                            |
| `.btn.btn-ghost.btn-icon`                       | `Button variant="ghost" size="icon"` + `aria-label`                                                             |
| `.btn-outline.btn-icon` at 36px                 | `Button variant="outline" size="sm"` with `aria-label`, square (`w-9 px-0`)                                     |
| `.badge.badge-soft-structure`                   | `Badge variant="soft" tone="structure"` (`EventVenueBadge` for Domicile/Extérieur)                              |
| `.badge.badge-soft-accent`                      | `Badge variant="soft" tone="accent"`                                                                            |
| `.badge.badge-soft-muted`                       | `Badge variant="soft" tone="muted"`                                                                             |
| `.badge.badge-outline-neutral`                  | `Badge variant="outline" tone="neutral"`                                                                        |
| `.icon-badge` / `.icon-badge-accent`            | `IconBadge` / `IconBadge tone="accent"` (**new tone**: `bg-gold-tint text-gold-text`)                           |
| `.section-heading`                              | `SectionHeading as="h2"`                                                                                        |
| `.heading.heading-4xl` / `-5xl`                 | `Heading as="h1" size="4xl"` (mobile), `sm:text-5xl` from `sm` up                                               |
| `.t-eyebrow`                                    | `Text variant="eyebrow"`                                                                                        |
| `.t-label.t-sm`                                 | `Text variant="label" size="sm"`                                                                                |
| `.t-sm.tone-secondary`                          | `Text variant="meta"`                                                                                           |
| `.t-xs.tone-secondary`                          | `Text variant="meta" size="xs"`                                                                                 |
| `.t-display-2xl.tone-structure` / `.tone-brand` | `Text variant="display" size="2xl" tone="structure" / "brand"` + `.tabular`                                     |
| timeline dot                                    | `Text as="span" tone={tone} aria-hidden` + `block h-3 w-3 rounded-full bg-current mt-2.5` (colour stays a tone) |
| `.rail`                                         | `Divider orientation="vertical" tone="structure" weight="rule"` + `my-1 flex-1`                                 |
| `.label` + `.input`                             | `FormField` / `Label` + `Input`                                                                                 |
| `.sheet`, `.sheet-handle`, `.dialog-close`      | `DialogContent` default placement below `sm` (Part 1)                                                           |
| `.dialog-title` / `.dialog-desc`                | `DialogTitle` / `DialogDescription`                                                                             |
| `.toast`                                        | `toast()` success                                                                                               |
| `.app-top`, `.tabbar`                           | existing `AppHeader` (`MobileTopBar`) and `AppBottomNav`, unchanged                                             |
| `.page-bar`                                     | **new** `EventPageBar` (Part 2)                                                                                 |

Rules for the implementer:

- Measure against the mockup at 390 px and 1280 px, same content. A difference is a bug in the implementation, unless the table above says the mockup is wrong.
- If the mockup needs a value that isn't a token yet, add the token (`tailwind-preset.cjs`) or the variant (component `cva`), never an arbitrary value at the call site. Two known additions: `IconBadge tone="accent"` and `Dialog`'s default responsive placement with handle.
- Screenshots of the implementation go in the PR next to the matching artboard.

## Part 1: responsive modals (sheet on mobile, dialog on desktop)

Every modal opens as a bottom sheet below `sm` and as the centred dialog from `sm` up. Today only `AdminActionDialog` does this, by hand (`isDesktop ? 'dialog' : 'sheet'`).

- `packages/@basketeasy/ui/src/components/Dialog.tsx`: add a `responsive` placement and make it the default. Pure CSS, no JS media query: sheet classes by default, `sm:` classes for the centred card (`sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border`). Add a grab handle (`aria-hidden`) shown only below `sm`. Keep `dialog` and `sheet` as explicit opt-outs.
- Drop the hand-rolled branch in `app/src/admin/actions/AdminActionDialog.tsx`; `PersonaSheet` keeps `variant="sheet"` (a sheet on desktop too).
- CLAUDE.md, « Modals vs. inline editing » bullet: one line saying modals are sheets on mobile by default.
- Tests: `Dialog.test.tsx` asserts the default placement's classes; screenshot one existing dialog (`EventEditModal`) at 390 and 1280.

## Part 2: match page header and timeline

`EventDetailHero` becomes the canvas's header; `MatchTimelineSteps` gets the canvas's look.

- **Page bar (new `EventPageBar`, `app/src/clubs/`)**: replaces the ghost « ← {team} » button at the top of `EventDetailPage`. Mobile: 48 px bar under `AppHeader`, `bg-surface border-b border-border`, sticky at `top-14`, ghost icon back button (`aria-label="Retour à {team}"`) + team name as `Text variant="label"`. Desktop: the ghost back link stays inline above the hero (artboard « Desktop »). Same origin-aware `navState` as today. Page content then starts at `pt-4` on mobile.
- **Header (`app/src/clubs/EventDetailHero.tsx`)**, artboards « Après · lieu connu » and « Desktop »:
  - Badges row (`EventVenueBadge`, « Importé » `outline neutral` when `isImported`, « Heure à confirmer »), then team name as `Text variant="eyebrow"`, then `<h1>` « vs {opponent} » (« Entraînement » for a TRAINING), then `Text variant="meta"` « {formatEventDayFull} · {time} » with `.tabular` (« heure à confirmer » when not confirmed).
  - New location block (`EventHeroLocation`): `Card variant="inset"`, `IconBadge` pin, `locationName ?? location` label, address meta, then `Itinéraire` (`Button variant="outline" size="sm"`, hidden for `UNKNOWN_EVENT_LOCATION`). Manager edit slot filled in Part 3.
  - Desktop (`sm:` and up): hero row, location block `w-80` on the right, Itinéraire + Modifier side by side.
  - `TimeBlock` and the team avatar leave the hero (they stay on list cards). `EventVenueRow` in `EventLogisticsCard` goes too: the venue now lives in the hero for both types.
- **Timeline (`app/src/meeting-points/MatchTimelineSteps.tsx`)**: three columns per step: time (`w-14`, display 2xl), dot + rail (`w-3`), content (`pt-1`, `pb-4` except last). RDV and arrival in `structure`, tip-off in `brand`. « Ajuster le RDV » stays at the card foot. Arrival step: « Arrivée · {locationName ?? location} », « Salle à confirmer » when unknown, no button. Its « Itinéraire vers la salle » link moves to the hero on the event page but stays on the guest page (prop `showVenueItinerary`, default true). Screenshot both pages.
- Any colour, size or spacing the canvas uses that has no token goes into `tailwind-preset.cjs` first (CLAUDE.md token rule).
- Tests: update `EventDetailHero.test.tsx` and `MatchTimelineSteps` tests for the new structure; screenshots at 390 and 1280, player and manager.

## Part 3: venue editing UI

Frontend half of the venue spec, on top of Parts 1, 2 and 4. Specced as venue [Part 4](./2026-09-30-manual-match-venue-part4-editing-ui.md) and the UI half of venue [Part 3](./2026-09-30-manual-match-venue-part3-import-summary.md).

- Header location block, `canManage` only: unknown venue → gold alert block with primary « Ajouter le lieu »; known → icon-only « Modifier le lieu » (mobile), labelled button (desktop).
- `app/src/clubs/EventVenueDialog.tsx`: react-hook-form + zod, name + address, shared schema with `EventEditModal`. Imported-match note, notify note + « Enregistrer et prévenir » when a known venue changes.
- `TeamFfbbLinkList`: « N matchs sans lieu » card from `FfbbImportResult.missingVenue`.
- Tests and screenshots per the venue spec.

## Part 4: venue backend

As specified in the venue spec: `Event.locationName` migration, `UpdateEventDto`, `EVENT_VENUE_CHANGED` + copy, FFBB import clearing `locationName` and returning `missingVenue`, `@basketeasy/types` first. Can land before Part 2. Specced as venue [Part 1](./2026-09-30-manual-match-venue-part1-backend.md), [Part 2](./2026-09-30-manual-match-venue-part2-notification.md) and the backend half of [Part 3](./2026-09-30-manual-match-venue-part3-import-summary.md).

## Part 5: collapsible sections

The manager's match page stacks seven sections; most visits need two. Sections become an accordion.

- Use Radix Accordion (`@radix-ui/react-accordion`, headless, same family as Dialog) wrapped once in `packages/@basketeasy/ui/src/components/SectionAccordion.tsx` (`@basketeasy/ui/section-accordion`), the only importer. Trigger = the `SectionHeading` look + a one-line summary + chevron. Record the choice in `docs/frontend-stack.md`.
- Always open, not collapsible: header, Logistique. Collapsible with a summary: Présences (« 8 / 12 »), Partage WhatsApp (« 1 message à partager »), Notes du coach, Vote du match, Après la rencontre.
- Default open: Présences on mobile. Desktop shows Logistique and Présences side by side (2-col grid), the rest collapsed below.
- `type="multiple"`. Open state kept in the URL hash already used for section anchors (`EVENT_SECTION_IDS`): a deep link or notification to `#presences` opens that section and scrolls to it. No localStorage.
- Summaries come from data the page already loads; don't add a query just to fill a summary line. A section whose summary would need one shows no summary.
- Player view (`EventDetailPlayerView`): same treatment after the manager view proves out; out of scope here.
- Tests: accordion opens from a hash, keyboard (Enter/Space, arrows via Radix), each section's error → loading → empty → data branch still reachable when opened. Screenshots mobile + desktop.

## Order and sizing

| Part                   | Depends on | Size |
| ---------------------- | ---------- | ---- |
| 1 Responsive modals    | –          | S    |
| 4 Venue backend        | –          | M    |
| 2 Header + timeline    | –          | M    |
| 3 Venue UI             | 1, 2, 4    | M    |
| 5 Collapsible sections | 2          | M    |
