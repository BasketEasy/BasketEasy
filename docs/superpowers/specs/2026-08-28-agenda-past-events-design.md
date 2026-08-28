# Past events visible in the Événements agenda view

Status: draft (loop 0)
Date: 2026-08-28

## Why

The Événements tab's default Agenda view (`TeamEventsAgenda`, backed by `TeamDetailPage.tsx`'s
`agendaEvents` fetch) only ever queries events from the start of today onward (`agendaFrom`,
`from: agendaFrom` with no `to`). A training or match that already happened simply never
appears there — reported as a bug ("I don't see events anterior to the current date").

The Liste (table) view already supports arbitrary `from`/`to` filters and either sort order, so
a user _can_ see past events today — but only by knowing to switch views and set a date filter
manually. That's not discoverable, and it's not what "Agenda" reads as: a team's day-to-day
calendar should let you look backward as naturally as forward.

## Scope

**In scope:**

- A second segmented toggle, **"À venir / Passés"**, shown only when `eventsViewMode ===
'agenda'`, directly below the existing Agenda/Liste toggle — same row style as the Liste
  view's filter row that already appears conditionally in that spot.
- Reuses the existing local `ViewModeToggle` component verbatim (no new primitive, no new
  Parquet token — it already carries `bg-blue-green` / `shadow-segment-active` / `focusRing`
  correctly for this exact kind of toggle).
- New `agendaPeriod: 'upcoming' | 'past'` state, defaulting to `'upcoming'`, following the same
  toggle-flips-the-other-value pattern as `eventsViewMode`/`toggleEventsViewMode`.
- The agenda fetch branches on `agendaPeriod` using the _same_ `agendaFrom` cutoff (today at
  00:00) as the single boundary, rather than introducing a second date constant:
  - `upcoming` (default, unchanged behavior): `from: agendaFrom, sortOrder: 'asc'`.
  - `past`: `to: agendaFrom, sortOrder: 'desc'` (most recent past event first — a "what just
    happened" list reads naturally newest-first, unlike the forward-looking list).
- `agendaPeriod` resets to `'upcoming'` whenever `toggleEventsViewMode` fires (switching to
  Liste and back to Agenda always re-lands on "À venir"), same pattern already used to reset
  the Liste view's own filters.
- `TeamEventsAgenda`'s day-grouping needs no logic change — it preserves array order when
  grouping, so a `desc`-sorted list renders most-recent-day-first with no re-sort; only its
  doc comment ("already sorted ascending") needs loosening to "already sorted in the requested
  direction."
- Empty state: extend the existing agenda empty-state branch with an `agendaPeriod === 'past'`
  case — title "Aucun événement passé", description "Aucun entraînement ni match n'a encore eu
  lieu pour cette équipe." — and hide the "Créer un événement" CTA in that case (creating a
  past event isn't the useful action there), same way it's already hidden for a filtered/empty
  Liste view.
- `LINKING_PAGE_SIZE` (100) cap carries over unchanged for the past fetch — same tolerance
  already accepted for the upcoming fetch; Liste view remains the real paginated escape hatch
  for deep history.

**Boundary rule:** today's events always bucket into "À venir", never "Passés" — an event later
today hasn't happened yet. `to: agendaFrom` (today at 00:00, exclusive of today since `to` is
inclusive-of-day per the existing table filter semantics reused here — see `useEventList`) keeps
this consistent with the existing "today onward" mental model already documented for
`agendaFrom`, so there's no new boundary case to explain to a user.

**Out of scope (explicitly deferred, don't build speculatively):**

- Infinite/paginated scroll-back within the Agenda view — the realistic need this fixes is
  "yesterday's/last week's practice," not deep season history; Liste view's real pagination
  already covers that case.
- Changing the Liste view's own filters/sort defaults — untouched.
- A URL/query-param-persisted period (unlike the `?tab=` convention used for the outer tabs) —
  `agendaPeriod` is ephemeral UI state local to the page, same as `eventsViewMode` today.

## Frontend changes

- `app/src/pages/TeamDetailPage.tsx`:
  - `agendaPeriod` state + reset inside `toggleEventsViewMode`.
  - Second `useEventList` call parameters branch on `agendaPeriod` (or the existing
    `agendaEventsResult` query simply takes `agendaPeriod`-derived `from`/`to`/`sortOrder`
    instead of always `{ from: agendaFrom, sortOrder: 'asc' }`).
  - Render the new `ViewModeToggle` row conditionally under `eventsViewMode === 'agenda'`.
  - Extend the agenda empty-state title/description/action for `agendaPeriod === 'past'`.
- `app/src/clubs/TeamEventsAgenda.tsx`: doc-comment update only (sort-direction wording).

No backend/API/type changes — `useEventList`/`ListEventsParams` already accept `from`, `to`,
and `sortOrder` independently; this is purely a frontend query-parameter and UI change.
