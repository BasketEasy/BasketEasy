# Match page revamp: Part 2, page bar, header and timeline

Status: spec (implements « Part 2 » of [`2026-09-30-match-page-revamp-implementation-plan.md`](./2026-09-30-match-page-revamp-implementation-plan.md))
Date: 2026-09-30
Design: [Claude Design canvas](https://claude.ai/artifact/VHmwSUJyvYhmHQmTuPi7yo), artboards « Après · lieu connu » (390), « Après · lieu inconnu » (390) and « Desktop » (1280). Source in [`assets/2026-09-30-match-page-revamp/`](./assets/2026-09-30-match-page-revamp/).

The event page's top: a page bar on mobile, the hero with a location block, and the match timeline's
three-column look. Read-only for everyone; the manager's edit slot is Part 3. Independent of the venue
backend (Part 4) but written to pick up `locationName` if Part 4 is merged first (§1).

## 1. Corrections to the plan that shape this part

- **Mobile is below `md`, not below `sm`.** `MobileTopBar` renders below `DESKTOP_BREAKPOINT_PX`
  (768, Tailwind `md`). The page bar sits under it, so it must switch at the same line or a 700 px
  window shows the desktop header with no back link at all. Every « mobile / desktop » below means
  `< md` / `md+`; the plan's `sm:` classes read `md:`.
- **`locationName` does not exist until Part 4.** The plan's `locationName ?? location` cannot compile
  before the venue backend lands. Part 2 renders through one helper, `heroVenueLines(event)` in
  `app/src/clubs/eventHeroLocation.ts`, returning `{ label, detail }`:
  - before Part 4: `label = event.location`, `detail = « Lieu de la rencontre » | « Lieu de la séance »`
    (today's `EventVenueRow` copy);
  - after Part 4 (whichever PR merges second makes the switch): `label = eventVenueLabel(event)`,
    `detail = event.locationName ? event.location : type copy`.
  - unknown (`isUnknownEventLocation`): `label = UNKNOWN_EVENT_LOCATION`, `detail` = type copy.
- **The sticky page bar breaks every `scroll-mt-20`.** Deep links (`?tab=`, `?partage=`) scroll a block
  to the top; on mobile it would land under 56 px of `MobileTopBar` + 48 px of page bar = 104 px, more
  than `scroll-mt-20` (80 px). Every anchored block (`EventPilotBand`, `EventDecisionBand`,
  `EventAttendanceSection`, the `section`s in both views) moves to `scroll-mt-28 md:scroll-mt-20`,
  held in one exported constant `EVENT_SECTION_SCROLL_MARGIN` in `useEventSectionAnchor.ts` so they
  can't drift.
- **Page padding is a `PageContainer` variant, not a call-site override.** `PageContainer` is
  `py-10 sm:py-16`; the canvas starts content 16 px under the bar on mobile. Add
  `top: { default: '', bar: 'pt-4 sm:pt-4 md:pt-16' }` (the `sm:` repeat is needed: `sm:py-16` would
  otherwise win between 640 and 767). Closed prop API rule.
- **The `h1` size is a `Heading` size, not `sm:text-5xl` at the call site.** Add
  `size: { hero: 'text-4xl md:text-5xl' }` to `Heading`. A responsive font size at a call site is the
  same closed-API break as a colour.
- **Icons**: `ChevronLeftIcon` does not exist in `@basketeasy/ui/icons`. Add
  `@basketeasy/ui/icons/chevron-left` beside `chevron-right` (same shape, `tone` axis, `exports`
  entry). The pin is `MapPinIcon` (`app/src/clubs/eventDetailIcons.tsx`), the route glyph is
  `RouteIcon` (`@basketeasy/ui/icons/route`), both already used by `EventVenueRow`.
- **« Ajuster le RDV » moves to the card foot**, it isn't there today: `EventMatchTimeline` puts it in a
  « Déroulé du match » header row. The canvas has no header row; the label goes, the button (and its
  « Ajouter un RDV » variant when there is no meeting point) moves under the `<ol>`.
- **The arrival step's copy changes shape.** Today « Arrivée à la salle » / « {location} · 45 min avant
  le coup d’envoi ». Canvas: label « Arrivée · {venue label} » / meta « 45 min avant le coup d’envoi »,
  and « Arrivée · Salle à confirmer » when unknown (« Après · lieu connu »; the « lieu inconnu »
  artboard still shows the old copy and is wrong on this line).
- **`IconBadge tone="accent"` and a 36 px icon button are not needed here.** Both only serve the
  manager's edit slot; Part 3 adds them (§6).

## 2. `EventPageBar` (`app/src/clubs/EventPageBar.tsx`)

Props: `{ to: string; state: unknown; teamName: string }`, fed by `EventDetailPage` with today's
`/clubs/${clubId}/teams/${teamId}?tab=events` and `navState`.

- Mobile: `<div className="sticky top-14 z-10 flex h-12 items-center gap-1 border-b border-border bg-surface pl-1 pr-4 md:hidden">`
  (`top-14` = `MobileTopBar`'s `h-14`; `z-10` matches it). Inside: `Button asChild variant="ghost"
size="icon"` wrapping a `Link` with `aria-label="Retour à {teamName}"` and `ChevronLeftIcon`, then
  `Text as="span" variant="label" className="truncate"`{teamName}.
- Desktop: `Button asChild variant="ghost" className="hidden self-start md:inline-flex"` with
  `ChevronLeftIcon` + team name (the « Desktop » artboard's inline link, no `←` character).
- It renders **outside** `PageContainer` (full bleed under the header) for the mobile bar, inside it for
  the desktop link. So `EventDetailPage` returns a fragment: bar, then `PageContainer top="bar"` with the
  desktop link first. Loading/error/empty states keep today's plain `PageContainer` (no team name to
  show yet).
- The `EmptyState` action (« {team.name} ») is unchanged.

## 3. Hero (`app/src/clubs/EventDetailHero.tsx`)

Props become `{ event; teamName; locationSlot?: ReactNode }` (`locationSlot` is Part 3's manager
control, unused here).

```
Card (raised) className="flex flex-col gap-3.5 p-4 md:flex-row md:items-center md:gap-6 md:p-6"
├─ div.flex.min-w-0.flex-1.flex-col.gap-2
│  ├─ badges row (only if any): EventVenueBadge (MATCH with venue) · Badge outline neutral « Importé » (isImported) · Badge outline neutral « Heure à confirmer » (!timeConfirmed)
│  ├─ Text variant="eyebrow" {teamName}
│  ├─ Heading as="h1" size="hero" « vs {opponentName} » | « Entraînement »
│  └─ Text variant="meta" className="tabular" « {formatEventDayFull} · {formatEventTime} » | « {formatEventDayFull} · heure à confirmer »
└─ EventHeroLocation (md:w-80 md:shrink-0)
```

- `TimeBlock` and the team `Avatar` leave the hero. `teamAvatarInitials` then has no importer outside
  tests: delete it and its test cases (dead-code rule), unless another importer exists by then.
- Update `formatEventDayFull`'s doc comment: the time is no longer carried by a `TimeBlock` beside it.
- The page's `<title>`/`aria` naming is unchanged; the `h1` losing the team name is covered by the
  eyebrow right above it.

## 4. `EventHeroLocation` (`app/src/clubs/EventHeroLocation.tsx`)

`Card variant="inset" className="flex flex-col gap-2.5"`:

- Row `flex items-center gap-2.5`: `IconBadge` (structure) with `MapPinIcon size={19}`, then
  `div.flex.min-w-0.flex-1.flex-col.gap-px` with `Text as="span" variant="label" size="sm"
className="break-words"`{label} and `Text as="span" variant="meta" size="xs"`{detail}.
- Under it: `Button asChild variant="outline" size="sm"` → `<a href={eventItineraryHref(event.location)}
target="_blank" rel="noreferrer">` with `RouteIcon` + « Itinéraire ». Full width on mobile
  (`w-full md:w-auto md:flex-1`), hidden when `isUnknownEventLocation(event.location)`.
- From `md` up the action row is `flex gap-2` so Part 3's « Modifier le lieu » sits beside Itinéraire.
- Rendered for both types and both roles.

## 5. Timeline (`app/src/meeting-points/MatchTimelineSteps.tsx`, `EventMatchTimeline.tsx`)

`TimelineStep` becomes three columns, per the canvas:

```
li.flex.gap-3
├─ Text as="span" variant="display" size="2xl" tone={time ? tone : 'secondary'} className="tabular w-14 shrink-0"
├─ div.flex.w-3.shrink-0.flex-col.items-center
│  ├─ Text as="span" tone={tone} aria-hidden className="mt-2.5 block h-3 w-3 rounded-full bg-current"
│  └─ !last && Divider orientation="vertical" tone="structure" weight="rule" className="my-1 flex-1"
└─ div.flex.min-w-0.flex-1.flex-col.gap-1.pt-1 (+ pb-4 unless last)
```

- Tones: RDV and arrival `structure`, tip-off `brand` (as today). The dot takes the step's tone even
  when the time is unknown (`--:--` stays `secondary`).
- `bg-current` paints the dot with the tone's text colour, so no colour is named at the call site.
- Arrival step: label « Arrivée · {venue label} » (« Salle à confirmer » when unknown), meta
  « {arrivalBufferMinutes} min avant le coup d’envoi ». Venue label = the same helper as §1 (after Part
  4, `eventVenueLabel`); `MatchTimelineSteps` gets the event's `locationName` prop once Part 4 exists.
- New prop `showVenueItinerary = true`. `EventMatchTimeline` passes `false` (the hero carries it);
  `GuestEventCard` omits it (guest page keeps « Itinéraire vers la salle », it has no hero). The RDV
  step's « Itinéraire vers le RDV » for non-managers is unchanged on both pages.
- `EventMatchTimeline`: `Card` → `div.flex.flex-col.gap-4.p-4`, `<ol>`, then (manager) `Button
variant="outline" size="sm" className="self-start"` « Ajuster le RDV » / « Ajouter un RDV », then the
  dialog. Update its doc comment (it no longer « replaces the venue row », the hero does).

## 6. `EventLogisticsCard` and what moves out

- Delete `EventVenueRow`. A TRAINING's card is the two kit rows only; a MATCH is unchanged (timeline +
  « Matériel »). Rewrite the component's doc comment: the venue is in the hero for both types.
- Drop now-unused imports there (`MapPinIcon`, `RouteIcon`, `eventItineraryHref`,
  `isUnknownEventLocation`, `IconBadge`) if nothing else in the file uses them.
- Not in this part: `IconBadge tone="accent"`, Button `size="icon-sm"` (`h-9 w-9`, replacing the plan
  table's `w-9 px-0` padding override), the gold unknown-venue block. Part 3 adds all three.

## 7. Tokens

Nothing in the three artboards lacks a token once `Heading size="hero"` and `PageContainer top="bar"`
exist: 48 px = `h-12`, 14 px gaps = `gap-3.5`, 320 px = `w-80`, the dot's 10 px offset = `mt-2.5`.
If measurement finds a value that isn't on the scale, add it to `tailwind-preset.cjs`, never `[…]`.

## 8. Tests and screenshots

- `EventDetailHero.test.tsx`: MATCH → eyebrow team name, `h1` « vs {opponent} », date · time line;
  TRAINING → « Entraînement »; « Importé » only when `isImported`; unconfirmed time → badge and
  « heure à confirmer », never « 00:00 »; no `TimeBlock`.
- `EventHeroLocation.test.tsx`: label/detail per type; Itinéraire href; no Itinéraire for the
  placeholder.
- `EventPageBar.test.tsx`: back link's accessible name and `to`, `state` forwarded.
- `EventMatchTimeline.test.tsx`: arrival « Arrivée · {location} » and « Salle à confirmer »; no venue
  itinerary on the event page; « Ajuster le RDV » still opens the dialog. New
  `MatchTimelineSteps.test.tsx`: `showVenueItinerary` default shows the venue link, `false` hides it,
  RDV link unaffected. `GuestRsvpPage.test.tsx` still finds « Itinéraire vers la salle ».
- `EventLogisticsCard.test.tsx`: TRAINING has no venue row.
- Deep-link test in `EventDetailPage` tests (or `useEventSectionAnchor`'s): anchored blocks carry
  `EVENT_SECTION_SCROLL_MARGIN`.
- Screenshots at 390 and 1280, player and manager, MATCH known, MATCH unknown, TRAINING; plus the guest
  page's timeline at 390. Fixture: extend `scripts/fixtures/match-meeting-point.json` (manager) and
  `match-meeting-point-player.json`; add an imported, unknown-venue match to one of them.
