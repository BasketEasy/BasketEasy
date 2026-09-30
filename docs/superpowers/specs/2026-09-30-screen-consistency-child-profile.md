# Screen consistency: Profil enfant (`/children/:playerId`)

Status: plan (screen 8 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Profil enfant » (390).
Depends on: Part 0 (`PageBar`, `PageBackLink`, `PageHero`, `FactTile`).

Page type: **entity, depth 2** (reached from « Mes enfants » on `/account`). File:
`app/src/pages/ChildProfilePage.tsx`.

## 1. Today

An `h1` with the child's name, then three `Card`s with `CardTitle`s (Profil, Licence et équipes,
Parents). No way back on a phone except the « Profil » tab; the error branch hand-builds a card with
a `CardTitle` and a `TextLink` back.

## 2. Changes

```
PageBar to="/account" title="Mon compte"   + PageBackLink (desktop)
PageContainer size="md" top="bar"
  PageHero
    badges: « Mineur·e » soft muted (child.isMinor)
    eyebrow « Enfant suivi »
    title « {firstName} {lastName} »
    meta « {clubName} »
    aside: consent FactTile
  section « Profil »     SectionHeading + Card(ChildProfileForm | the adult / no-birth-date sentence)
  section « Équipes »    SectionHeading + Card flush of link rows (one per child.teams) + meta « La licence et les équipes sont gérées par le club. »
  section « Parents »    SectionHeading + Card flush of person rows (co-guardians) + ConfirmDialog trigger « Ne plus suivre {firstName} » (outline, self-start)
```

- **Consent tile** (`ShieldIcon` or the closest existing icon): `child.consent` → neutral, label
  « Autorisation parentale », detail = today's `consentLine(child.consent)`. `isMinor && !consent` →
  **neutral** too (rule 3: accent is for a fact the reader can fix, and a guardian can't record
  consent from this page), label « Aucune autorisation enregistrée », detail « Le club l’enregistre. ».
  Adult → no tile.
- Team rows link to `/clubs/{child.clubId}/teams/{teamId}?pour={playerId}` (`MyChildProfile`
  carries both ids; `@AllowGuardians` opens the child's team reads to a parent, and `?pour=` makes the
  persona follow, as the notification deep links do). No API change.
- Error branch: `PageHero`-less `PageContainer` with `EmptyState` (« Enfant introuvable » + action
  « Mon compte ») for 404, `QueryError` otherwise; the hand-built card goes. Loading keeps `Loader`.
- `stopError` stays in the `ConfirmDialog` (form-level refusal); success stays a toast + navigate.

## 3. Tests

`ChildProfilePage.test.tsx`: `h1` = child name; back link to `/account`; minor badge; consent tile
per the three cases (with, without, adult); form only for a minor; team rows; stop-following flow
unchanged; 404 → `EmptyState` with a link to `/account`.

## 4. Screenshots

390 and 1280: minor with consent, minor without, adult. Fixtures: `scripts/fixtures/guardian-parent-session.json`
and `guardians.json`, extended with a `GET /me/children/:playerId` body per case.
