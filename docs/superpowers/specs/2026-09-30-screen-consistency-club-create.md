# Screen consistency: Créer un club (`/clubs/new`)

Status: plan (screen 10 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Créer un club » (390).
Depends on: Part 0 (`PageBar`, `PageBackLink`, `PageHeader`).

Page type: **task flow, depth 2** (from « Créer un club » on `/account`). Files:
`app/src/pages/ClubCreatePage.tsx`, `app/src/clubs/ClubCreateForm.tsx`.

## 1. Today

The page is `ClubCreateForm` alone: a `Card` whose `CardTitle` « Créer un club » is the only title
(no `h1` on the page), fields, submit. No way back on a phone.

## 2. Changes

- `ClubCreatePage`: `PageBar to="/account" title="Mon compte"` + `PageBackLink`,
  `PageContainer size="md" top="bar"`, then `PageHeader title="Créer un club" meta="Vous en serez le
premier administrateur."`, then the form.
- `ClubCreateForm`: drops `CardHeader`/`CardTitle`; keeps the `Card` + `CardContent` around its
  fields (react-hook-form + zod, `setError` on the FFBB code field, `Alert` for `root`, unchanged).
  The FFBB field gets the same help text as the club page's tile (« Facultatif : le code de la page
  du club sur competitions.ffbb.com. »), so the two places that ask for it say the same thing.
- The unverified-e-mail refusal (`EMAIL_NOT_VERIFIED`, `EmailVerifiedGuard` gates `POST /clubs`)
  keeps its current handling.

## 3. Tests

`ClubCreateForm` / page test: `h1` « Créer un club »; back link to `/account`; submit, field error and
root error unchanged.

## 4. Screenshots

390 and 1280, empty form and with a field error.
