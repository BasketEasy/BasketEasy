# Match page revamp: implementation plan

**Status:** plan, not built. **Date:** 2026-09-30.

Design canvas: https://claude.ai/artifact/VHmwSUJyvYhmHQmTuPi7yo (mobile row + desktop artboard). Venue editing rules: [`2026-09-30-manual-match-venue-design.md`](./2026-09-30-manual-match-venue-design.md).

Five parts, each its own PR, in this order. Parts 1–2 are independent of the venue backend; Part 3 depends on Part 4's API.

## Part 1: responsive modals (sheet on mobile, dialog on desktop)

Every modal opens as a bottom sheet below `sm` and as the centred dialog from `sm` up. Today only `AdminActionDialog` does this, by hand (`isDesktop ? 'dialog' : 'sheet'`).

- `packages/@basketeasy/ui/src/components/Dialog.tsx`: add a `responsive` placement and make it the default. Pure CSS, no JS media query: sheet classes by default, `sm:` classes for the centred card (`sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border`). Add a grab handle (`aria-hidden`) shown only below `sm`. Keep `dialog` and `sheet` as explicit opt-outs.
- Drop the hand-rolled branch in `app/src/admin/actions/AdminActionDialog.tsx`; `PersonaSheet` keeps `variant="sheet"` (a sheet on desktop too).
- CLAUDE.md, « Modals vs. inline editing » bullet: one line saying modals are sheets on mobile by default.
- Tests: `Dialog.test.tsx` asserts the default placement's classes; screenshot one existing dialog (`EventEditModal`) at 390 and 1280.

## Part 2: match page header and timeline

`EventDetailHero` becomes the canvas's header; `MatchTimelineSteps` gets the canvas's look.

- **Header (`app/src/clubs/EventDetailHero.tsx`)**
  - Badges row first (type, `EventVenueBadge`, « Importé » when `isImported`, « Heure à confirmer »), then eyebrow (competition label when known), then the `<h1>` opponent line, then the date/time as `Text variant="meta"` with `.tabular`.
  - New location block (`EventHeroLocation`, same file or sibling): pin `IconBadge`, `locationName ?? location` on the label line, address on the meta line. `Itinéraire` below it (hidden for `UNKNOWN_EVENT_LOCATION`). Manager action slot, filled in Part 3.
  - Desktop (`sm:` and up): the location block moves to the right of the title stack at a fixed width, action buttons side by side.
  - Keeps being shared by player and manager views. `TimeBlock` leaves the hero; it stays on list cards. Check it has no other reason to be here before removing (`EventDetailHero.test.tsx`).
- **Timeline (`app/src/meeting-points/MatchTimelineSteps.tsx`)**: time column in Big Shoulders at 22px, structure colour for RDV and arrival, brand for tip-off; dot + vertical rule (`Divider tone="structure"`) instead of the current layout; « Ajuster le RDV » stays at the card foot. The arrival step shows `locationName ?? location`, « Salle à confirmer » when unknown, and no action button. Same component on the guest page (`app/src/guest-rsvp/`), so screenshot both.
- Any colour, size or spacing the canvas uses that has no token goes into `tailwind-preset.cjs` first (CLAUDE.md token rule).
- Tests: update `EventDetailHero.test.tsx` and `MatchTimelineSteps` tests for the new structure; screenshots at 390 and 1280, player and manager.

## Part 3: venue editing UI

Frontend half of the venue spec, on top of Parts 1, 2 and 4.

- Header location block, `canManage` only: unknown venue → gold alert block with primary « Ajouter le lieu »; known → icon-only « Modifier le lieu » (mobile), labelled button (desktop).
- `app/src/clubs/EventVenueDialog.tsx`: react-hook-form + zod, name + address, shared schema with `EventEditModal`. Imported-match note, notify note + « Enregistrer et prévenir » when a known venue changes.
- `TeamFfbbLinkList`: « N matchs sans lieu » card from `FfbbImportResult.missingVenue`.
- Tests and screenshots per the venue spec.

## Part 4: venue backend

As specified in the venue spec: `Event.locationName` migration, `UpdateEventDto`, `EVENT_VENUE_CHANGED` + copy, FFBB import clearing `locationName` and returning `missingVenue`, `@basketeasy/types` first. Can land before Part 2.

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
