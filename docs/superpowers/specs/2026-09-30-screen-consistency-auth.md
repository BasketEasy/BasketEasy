# Screen consistency: auth and invitation pages

Status: plan (screen 13 of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboard « Auth · connexion » (390).
Depends on: nothing (no Part 0 primitive is needed).

Page type: **standalone**. One plan for seven routes because they all become one layout component
(`AuthCard`); a plan per route would repeat the same diff seven times.

| Route                     | Page                 | Content component    |
| ------------------------- | -------------------- | -------------------- |
| `/login`                  | `LoginPage`          | `LoginForm`          |
| `/register`               | `RegisterPage`       | `RegisterForm`       |
| `/forgot-password`        | `ForgotPasswordPage` | `ForgotPasswordForm` |
| `/reset-password/:token`  | `ResetPasswordPage`  | `ResetPasswordForm`  |
| `/verify-email/:token`    | `VerifyEmailPage`    | `VerifyEmailCard`    |
| `/invite/:token`          | `InviteAcceptPage`   | `InviteAcceptForm`   |
| `/guardian-invite/:token` | `GuardianInvitePage` | `GuardianInviteCard` |

## 1. Today

Each page is `PageContainer size="md" centered` around a component that builds its own `Card` +
`CardHeader` + `CardTitle` (« Se connecter », « Rejoindre {club} », « Invitation invalide », …).
There is **no `h1`** on any of them (the title is `CardTitle`, an `h3`) and **no brand** on screen:
a visitor who opens an invite link from an e-mail sees a form with nothing saying « Kluvo ».

## 2. Changes

- New `app/src/auth/AuthCard.tsx`:

  ```tsx
  <AuthCard eyebrow="La gestion d’équipe, simplifiée." title="Se connecter" footer={<…/>}>
    …fields…
  </AuthCard>
  ```

  Renders the wordmark (`Text as="span" variant="display" size="…" tone="brand" className="uppercase
text-center"`, the same element `GuestRsvpPage` uses; `Link` to `/` only on the three
  `PublicOnlyRoute` pages, plain text on the inbox-opened ones so a mid-recovery visitor isn't sent
  away), then `Card className="flex flex-col gap-4 p-6"` holding `Text variant="eyebrow"`{eyebrow}
  (optional), `Heading as="h1"`{title}, optional `description` (`Text variant="meta"`), `children`;
  then `footer` under the card, centred (`Text variant="meta"` with its `TextLink`s, e.g. « Pas
  encore de compte ? Créer un compte »).

- Each content component drops `Card`/`CardHeader`/`CardTitle` and renders inside `AuthCard`. Every
  branch keeps its own title (« Invitation invalide », « Adresse confirmée », …) as the `h1`, so each
  state still has exactly one.
- Eyebrow: the tagline (`docs/brand.md`) on login and register; the club name on
  `InviteAcceptForm` (« Rejoindre » stays the title) and `GuardianInviteCard`; none elsewhere.
- Behaviour is untouched: react-hook-form + zod, `setError('root')` + `Alert` (not toast, CLAUDE.md
  « Notifications on the frontend »), the 204-whatever-the-address copy on forgot-password.
- `AdminLoginForm` is **not** migrated (back-office chrome, see the back-office plan).

## 3. Tests

Each form's existing test keeps passing (they query by role/label). Add to each page test: exactly one
`h1` per branch; the wordmark is present; on `/login` the wordmark links to `/`, on
`/reset-password/:token` it does not. `AuthCard.test.tsx` for the slots.

## 4. Screenshots

390 and 1280: login, register, forgot (before/after submit), reset, verify (success + expired),
invite (valid + invalid), guardian invite. Fixtures: `player-invite.json`, `guardians.json`.
