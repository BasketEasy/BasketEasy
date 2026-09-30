# Screen consistency: Notifications (`/notifications`)

Status: plan (screen 6 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Notifications » (390).
Depends on: Part 0 (`PageHeader`).

Page type: **tab root** (a personal collection; reached from the header bell at any depth, so there
is no single « back » target and no page bar). Files: `app/src/pages/NotificationsPage.tsx`,
`app/src/notifications/NotificationList.tsx` (row look only).

## 1. Today

The page has **no `h1`**: its title is a `SectionHeading` (an `h2` with the court line), with a
comment explaining the `flex-1` needed for the rule to fill. « Tout marquer comme lu » sits beside
it. The list is in a `Card variant="flush"` capped at `max-w-2xl`.

## 2. Changes

- `PageHeader title="Notifications"`, meta « {n} non lue(s) » while unread > 0, « Tout est lu »
  otherwise, `actions` = the mark-all button. The button keeps its label at every width (it is the page's only action;
  rule 6 applies to secondary actions) but moves to `size="sm" variant="outline"` with `CheckIcon`.
  The `max-w-2xl` wrapper stays (width is composition) and now wraps the header too.
- Delete the `SectionHeading`-as-title block and its two comments; `SectionHeading`'s `count` is no
  longer used here (the count is in the meta, spoken as text).
- `NotificationList` rows (`density="comfortable"` only): lead with an `IconBadge` per type (the icon the
  `type` already selects), unread dot as `Text as="span" tone="brand" aria-hidden` + `bg-current`
  (the timeline dot recipe), so the bell dropdown (`density="compact"`) keeps its tighter row. Row
  text stays `label sm` title + `meta xs` body + `meta xs` relative date.

## 3. Tests

`NotificationsPage` test (new if absent): one `h1`; meta shows the unread count; « Tout marquer comme
lu » only when unread > 0 and calls the mutation; `NotificationList` comfortable density renders the icon
badge, compact density doesn't; read-on-click unchanged.

## 4. Screenshots

390 and 1280 with unread and all-read. Fixture: `scripts/fixtures/notifications.json`.
