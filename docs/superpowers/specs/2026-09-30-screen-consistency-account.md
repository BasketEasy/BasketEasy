# Screen consistency: Mon compte (`/account`)

Status: plan (screen 7 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Mon compte » (390).
Depends on: Part 0 (`PageHeader`).

Page type: **tab root** (« Profil »). Files: `app/src/pages/AccountPage.tsx`,
`app/src/notifications/NotificationPreferencesCard.tsx`, `app/src/guardians/MyChildrenCard.tsx`,
`app/src/guardians/ParentAccessCard.tsx`.

## 1. Today

No page title: the first thing is a `Card` whose `CardTitle` is « Mon compte », then four more cards
each with a `CardTitle` (Notifications, Mes enfants, Accès parents, Club actif), then a card holding
« Créer un club » and « Se déconnecter ». Six cards, one visual weight, on the page a phone user
opens most to switch club or log out.

## 2. Changes

```
PageHeader  title « Mon compte »  meta = user.email (break-all)
section « Profil »                 SectionHeading + Card(AccountProfileForm)       always open
SectionAccordion
  notifications  « Notifications »   summary: « E-mail activé » | « E-mail désactivé » (user.emailNotificationsEnabled)
  enfants        « Mes enfants »     summary: children first names joined « , »     (personas, loaded)   only if children
  parents        « Accès parents »   no summary (its query lives inside)                                 only if own playerIds
  club           « Club actif »      summary: active club name (adminClubs + activeClubId, loaded)      only if adminClubs
div.flex.flex-wrap.gap-2           « Créer un club » (outline, if showCreateClub) · « Se déconnecter » (outline)
```

- Each of the three cards (`NotificationPreferencesCard`, `MyChildrenCard`, `ParentAccessCard`)
  loses its `Card`/`CardHeader`/`CardTitle` shell behind `headingless` (the name used across these
  plans), rendering its content only; the accordion item is the card. `ParentAccessCard`'s two
  `CardTitle` branches (loading / data) collapse into the single item title.
- « Club actif »: the `RadioCardGroup` moves into the item unchanged, with its meta line.
- Open state: all folded (`useState<string[]>([])`). `/account#notifications` is not introduced;
  nothing links there today. **Exception:** when `usePushSubscription` reports a subscription error,
  seed `notifications` open so the error is not hidden behind a fold.
- The last card becomes a plain action row (no card): two outline buttons are not a surface.
- Mobile only in the canvas; desktop is the same single column (`PageContainer size="md"`
  unchanged).

## 3. Tests

`AccountPage.test.tsx`: one `h1`; profile form visible without interaction; each accordion item
present only under its condition, folded, with its summary; opening « Club actif » and picking a club
still calls `setActiveClubId`; logout still works. Card components: `headingless` renders no heading.

## 4. Screenshots

390 and 1280, a parent-admin (all four items), and a plain player (notifications only). Fixtures:
`authenticated-admin-session.json`, `guardian-parent-session.json`.
