# Screen consistency: Réponse invité (`/r/:token`)

Status: plan (screen 12 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Réponse invité (/r/:token) » (390).
Depends on: Part 0 (`PageHero`).

Page type: **standalone** (public, no chrome, opened from a WhatsApp group). Files:
`app/src/guest-rsvp/GuestRsvpPage.tsx`, `GuestEventCard.tsx` (header row only),
`GuestRosterPicker.tsx` (untouched).

## 1. Today

Wordmark as `Text variant="display"`, then a loose `h1` team name + club meta, then either the roster
picker or a row « {name} · Ce n’est pas moi ? » and the event cards. The match timeline inside
`GuestEventCard` is already the match page's (match Part 2 kept its « Itinéraire vers la salle »).

## 2. Changes

- The wordmark stays; the team block becomes `PageHero eyebrow={clubName} title={teamName}
meta="Répondez pour les 14 prochains jours"` (the window the server applies), no `aside`.
- The identity row becomes a `Card variant="inset"`: `Avatar` initials, « Vous répondez pour » meta
  over the name label, « Ce n’est pas moi ? » ghost `sm` on the right. Same handlers.
- `GuestEventCard`'s header row takes the list-card shape (rule 8): `TimeBlock` + title + venue meta,
  RSVP buttons underneath (already the three separate buttons filled by answer). No change to the
  timeline, travel-mode control or answer mutation.
- The `PageContainer size="md"` wrapper's extra `py-6` inner `div` goes (the container already pads).
- Empty / expired-link / error branches unchanged in content, rendered under the wordmark without
  the hero (there is no team to name).

## 3. Tests

`GuestRsvpPage.test.tsx`: `h1` = team name; identity card with the reset button; events render and
answer as today; 404 copy unchanged; « Itinéraire vers la salle » still present on a match.

## 4. Screenshots

390 and 1280: picker state, identified state with a match and a training. Fixture:
`scripts/fixtures/guest-rsvp.json`.
