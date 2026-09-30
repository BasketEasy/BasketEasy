# Screen consistency: Match / entraînement, vue joueur (`/clubs/:clubId/teams/:teamId/events/:eventId`)

Status: plan (screen 11 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: match canvas (https://claude.ai/artifact/VHmwSUJyvYhmHQmTuPi7yo), artboards « Sections repliables » (390) and « Desktop » (1280), read for the player's sections.
Depends on: nothing new (match Parts 2 and 5 are merged; Part 0 of this series is optional here).

Page type: **entity, depth 2**, already on the grammar above the fold (page bar, hero, venue tile,
timeline). What is left is the one thing match Part 5 deferred: « Player view
(`EventDetailPlayerView`): same treatment after the manager view proves out ». Files:
`app/src/clubs/EventDetailPlayerView.tsx`, `app/src/pages/EventDetailPage.tsx`.

## 1. Today

Hero → `EventDecisionBand` (rostered) → « S’y rendre » → `EventAttendanceSection` → « Notes du
coach » → « Vote du match » → « Après la rencontre », all open, one scroll. The manager view already
folds its secondary sections; the two views of the same page now look like two apps.

## 2. Layout after the change

```
EventDetailHero                                  (unchanged)
EventDecisionBand                                (rostered; always open: it is the question)
mobile:  section#logistique « S’y rendre »       (always open)
         SectionAccordion [presences, notes, vote, apres-la-rencontre]
desktop: div.grid.grid-cols-2.items-start.gap-6
           section#logistique | EventAttendanceSection#presences (plain section, no trigger)
         SectionAccordion [notes, vote, apres-la-rencontre]
```

Same breakpoint branch as the manager view (`useIsDesktopViewport()`), same item ids, same
`EVENT_SECTION_SCROLL_MARGIN` on every item.

| Item                 | `id`                 | Condition (unchanged)           | Summary (from data already on the page)                                                               |
| -------------------- | -------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Qui vient ? (mobile) | `presences`          | always                          | `{going} / {answering}` from the `counts` this view already reads, label « {going} présents sur {n} » |
| Notes du coach       | `notes`              | `event.notes`                   | first line of `event.notes`, `truncate`                                                               |
| Vote du match        | `vote`               | `showVote && !isActingForChild` | the manager view's three states (« Ouvre après le match » / « Vote ouvert » / « Résultats »)          |
| Après la rencontre   | `apres-la-rencontre` | MATCH                           | `event.result` → « {us} – {them} » `.tabular`; otherwise none                                         |

- **Open by default**: `presences` on mobile (who else is coming is the second question a player
  opens the page for, `player-journey.md` §3.8); **plus `vote` when `isVoteWindowOpen` and the
  reader can vote** (a ballot they owe must not be behind a fold). Everything else folded.
- **Deep links**: `EventDetailPage` passes `openSection` to the player view too (today only the
  manager view gets it); the same seed-and-add effect opens `?tab=vote`, `?tab=scoresheet`,
  `?tab=effectif`. Extract the manager view's `initialOpen` + effect into a shared hook
  `useEventOpenSections({ eventId, isDesktop, openSection, extra })` in
  `app/src/clubs/useEventSectionAnchor.ts` rather than copying it (both views call it).
- `EventAttendanceSection` gains `headingless` (its `SectionHeading` « Qui vient ? » is the item's
  title on mobile); on desktop it keeps its own heading. The player's copy stays « Qui vient ? » (the
  player's question), not the manager's « Présences »; only the item id is shared.
- A parent acting for a child: unchanged conditions (no vote item), same folds.

## 3. Tests

`EventDetailPlayerView` (new test file or `EventDetailPage.test.tsx`), mirroring the manager view's
Part 5 cases: mobile Présences open, others folded; desktop Logistique + Présences side by side, no
Présences trigger; an open vote window seeds `vote` open; `?tab=vote|scoresheet|effectif` each open
their item; each summary per the table and absent where it says none; each opened section still
reaches `error → loading → empty → data`. Shared hook: unit test for seed, add-on-change, reset on
`eventId` change.

## 4. Screenshots

390 player default (Présences open), 390 with vote open, 1280 player. Fixture:
`scripts/fixtures/match-meeting-point-player.json`.
