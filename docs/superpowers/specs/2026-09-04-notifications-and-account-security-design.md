# Notifications, deep links, e-mail verification and password reset

Status: implemented
Date: 2026-09-04
PR: [#132](https://github.com/BasketEasy/BasketEasy/pull/132)

## Why

Kluvo had no way to reach a user outside the app. A grep for `notif|email|unread|reminder|mail|brevo`
across `server/src` and `app/src` returned only the `User.email` column and form inputs: no mail
module, no notification table, no `unread` concept, and no notion of a confirmed address. Three
concrete gaps followed.

1. **A convocation reached nobody.** `PATCH .../events/:eventId/convocations` wrote
   `EventConvocation` rows and stopped. A manager could call up a roster for Saturday's match and
   the only way a player found out was by opening the app. P0 in `docs/feature-set.md` lists
   "calendrier / convocations / RSVP" as table stakes; the convocation half was a database write with
   no delivery.
2. **A forgotten password was unrecoverable.** There was no reset flow at all — the only way back
   into an account was an admin editing the database by hand.
3. **An address was never proven reachable.** A mistyped e-mail at registration was undetectable,
   which meant nothing could safely be built on top of e-mail reaching a user.

The nearest existing thing was `ActionItem` (`packages/@basketeasy/types/my-dashboard.ts`, built in
`server/src/dashboard/dashboard.service.ts`, rendered by `app/src/clubs/ActionItemsBand.tsx`): a
finished French sentence composed server-side and rendered verbatim, with the deep link rebuilt
client-side. That shape was right; it just wasn't persisted, wasn't per-user, and had no delivery
channel. This cut generalises it.

## Decisions

These were put to the product owner before implementation.

| Question                  | Decision                                                            | Why not the alternative                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-mail delivery           | Brevo behind a `MAIL_CLIENT` seam, logging client with no API key   | A log-only stub ships a flow that never sends in prod; raw SMTP contradicts `docs/backend-stack.md`                                                   |
| Triggers in this cut      | Convocation · event cancelled · scoresheet OCR done/failed          | "New event on my team" was cut: a recurring create materialises up to 104 rows and would need collapsing, for a notification nobody is waiting on     |
| Unverified address blocks | Club creation + the two admin grants                                | Blocking login locks out an invited player who mistyped their address; gating nothing lets an unverified account be handed club-ADMIN by someone else |
| Web push                  | In scope                                                            | —                                                                                                                                                     |
| Preferences               | One `emailNotificationsEnabled` toggle, push opt-in by subscription | A per-type × per-channel matrix is a much bigger UI and a fan-out check on every send, for a product with four notification types                     |

## The decisions worth writing down

### `deepLink` is a frontend-relative path, never an absolute URL

One value serves three consumers: react-router for an in-app click, an `<a href>` in an e-mail, and
`notificationclick` in the service worker. Storing the origin would bake one deploy's hostname into
rows that outlive it — `kluvo.net` today, something else after a domain move, and every
historical notification silently pointing at the wrong place. `MailService.absoluteUrl()` is the
single place the prefix is applied, resolved from `FRONTEND_URL` **per send**.

### `title`/`body` are denormalised, and `type` never drives copy

Following `ActionItem.message`. A notification about an event that has since been deleted or renamed
still reads correctly, and no read path has to join across every domain module that can emit one.
The `NotificationType` enum exists to pick an icon and to let a future preferences screen filter by
category — the client must never re-derive a sentence from it, or the in-app and e-mailed copies
drift the first time one is edited.

### The in-app row is synchronous; delivery is best-effort

`NotificationsService.notify()` awaits exactly one `createMany`, then hands e-mail and push to a
fire-and-forget path. The asymmetry is deliberate:

- A convocation that exists in the database but wasn't e-mailed is **degraded**.
- One that was e-mailed but never stored is a notification the user **can't find again**.
- And every emitter calls `notify()` as a side effect of a mutation the user actually asked for. A
  bounced address or a dead push service must not roll back a call-up a manager already made.

### The convocation endpoint is a full replace, so notifications need a diff

`setEventConvocations` deletes everything not in the submitted list and upserts everything in it — a
manager re-submits the whole list every time they adjust one player. Notifying "the list" would
re-notify the entire call-up on every tweak, which is how a product teaches people to ignore its
notifications. The existing rows are therefore read **before** the transaction and diffed; only
genuinely new convocations are announced.

### Cancellation recipients are read before the delete, and a series sends one notification

`EventConvocation` cascade-deletes with its `Event`: after `deleteMany` there is nothing left to
query. Recipients are gathered first, the same shape the existing `deleteScoresheetObjects` already
uses. And a `THIS_AND_FUTURE`/`ALL` delete can cover up to `MAX_RECURRING_OCCURRENCES` (104) events —
one summary notification per recipient ("12 séances annulées"), never one per occurrence.

Recipients are the **convoked**, not the whole roster: a cancellation is only news to someone who was
expecting to be there.

### Two token tables, not one with a `purpose` column

`EmailVerificationToken` and `PasswordResetToken` look alike and are deliberately kept apart:

- their TTLs differ by an order of magnitude (24h vs 1h);
- consuming a reset revokes every `RefreshToken`, consuming a verification doesn't;
- a shared table turns "consume a token for purpose X" into a runtime check the type system can do.

`consumedAt` rather than deleting the row keeps a _reused_ link distinguishable from an _expired_ one,
so the page can tell the visitor which happened.

### A password reset revokes every session, and does not auto-login

Revoking the whole `RefreshToken` set is what makes this a **recovery** flow rather than a
convenience: the usual reason to reset is that someone else may have the old password, and leaving
their sessions alive would defeat the reset entirely. The success screen deliberately does not sign
the visitor back in — it tells them every session was signed out, which is the reassurance they came
for.

### The reset endpoints are silent about whether an address exists, and so is the UI

`POST /auth/password-reset/request` resolves identically for a known and an unknown address. That
promise has to hold in the copy too: `ForgotPasswordForm`'s confirmation reads "Si un compte Kluvo
existe pour cette adresse…". A confirmation that appeared only for real accounts would reintroduce
exactly the user-enumeration oracle the endpoint avoids being.

### `EmailVerifiedGuard` gates three routes, chosen on one principle

Creating a club, adding a club member, granting a `TeamAdmin` — the actions that hand out authority
over **other people's** data. Everything else (reading, RSVP, roster edits, events) works unverified
on purpose: the most likely person to have an unconfirmed address is a player who just accepted an
invite and mistyped their e-mail, and locking them out of their own team over it is a worse outcome
than the risk being mitigated. The 403 carries `code: 'EMAIL_NOT_VERIFIED'` so the client offers the
resend button rather than a dead end.

### The logging mail client is a feature, not a stub

With no `BREVO_API_KEY`, `MailModule` binds `LogMailClient`, which writes the full message — body
included — to the server log. That is the only way to follow a verification or reset link end to end
without a provider account, which covers local dev, CI, and the sandboxes this repo is usually worked
in. It is why `BREVO_API_KEY` is not boot-validated, matching the existing policy for `REDIS_URL`,
`R2_*` and `GEMINI_API_KEY`.

### Polling, not a real-time transport

The feed polls every 60s. The payload is a handful of rows and the audience is a club volunteer with
one tab open; SSE or a WebSocket would be a connection to manage, a reconnect path to get right, and
a deployment constraint, for a latency improvement nobody in this product notices. Web push covers
the case polling structurally cannot: a tab that isn't open at all.

### Push has no stored preference

E-mail is an account preference (`emailNotificationsEnabled`) that follows the reader across devices.
Push is a property of **this browser** — it exists if this browser holds a subscription and cannot
exist anywhere else. Presenting them as two identical checkboxes would misrepresent what turning each
one off does, so the preferences card renders them differently on purpose.

### Dates in notification copy are Europe/Paris

`event-notification-copy.ts` formats in a fixed `Europe/Paris`. The schema stores no per-club
timezone (the same gap `updateEventTimeOfDay` already documents), and formatting in UTC would put a
20:30 match at "19:30" for every French reader — a worse error than the DST edge a fixed zone leaves
open. Kluvo launches in Loire-Atlantique. This becomes a per-club setting when the app has one.

## Deliberately not built

- **Digest / batching.** Convoking a 12-player roster sends 12 notifications, one per player, not one
  batched mail per manager action. Each recipient gets exactly one message about themselves, which is
  the right unit; digesting only matters once a single user receives many notifications a day, which
  four notification types don't produce.
- **Scheduled RSVP reminders** ("3 joueurs n'ont pas répondu, le match est demain"). Needs a
  repeatable BullMQ job; the queue holds only `scoresheet-ocr` today and has no scheduled work at all.
  `EventPilotBand`'s "Relancer les sans-réponse" button is the natural trigger and stays inert until
  that slice lands.
- **A per-type × per-channel preference matrix.** One e-mail toggle covers the actual need; the
  `type` column is already stored, so this is additive later.
- **In-app real-time transport.** See above.
- **Notification deletion / archiving.** Rows are marked read, never removed. Nothing yet needs a
  retention policy; when one is wanted it belongs with a general data-retention decision, not here.
- **iOS web push outside an installed PWA.** Not a choice — Safari only exposes the Push API to a
  home-screen-installed PWA. `usePushSubscription` reports `support: 'unsupported'` and the toggle
  hides, rather than showing a control that would fail.

## Files

**Server**

- `server/src/mail/` — `MAIL_CLIENT` seam, `BrevoClient`, `LogMailClient`, `MailService`, `templates/`
- `server/src/notifications/` — service, `PUSH_CLIENT` seam over `web-push`, two controllers
- `server/src/auth/account-security.service.ts`, `guards/email-verified.guard.ts`, three DTOs, four routes
- `server/src/events/event-notification-copy.ts` and the two emission points in `events.service.ts`
- `server/src/scoresheets/scoresheet-ocr.processor.ts` — `notifyUploader`
- `server/prisma/migrations/20260904000000_add_notifications_and_account_security/`

**Shared**

- `packages/@basketeasy/types/notifications.ts`, `account-security.ts`; `auth.ts` gains
  `emailVerified` / `emailNotificationsEnabled`

**Frontend**

- `app/src/notifications/` — hooks, `NotificationBell`, `NotificationList`, `NotificationItem`,
  `NotificationPreferencesCard`, `usePushSubscription`
- `app/src/auth/` — `ForgotPasswordForm`, `ResetPasswordForm`, `VerifyEmailCard`,
  `EmailVerificationBanner`, `accountSecurityMutations.ts`
- `app/public/sw.js`, four new pages and routes
- `packages/@basketeasy/ui/src/components/CountBadge.tsx` (and `TabBarItem` now composes it)
