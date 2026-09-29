# WhatsApp event reminder: Part 1, manual share (MVP)

Status: spec (implements Part 1 of [`2026-09-29-whatsapp-reminder-design.md`](./2026-09-29-whatsapp-reminder-design.md))
Date: 2026-09-29

A team manager can open any upcoming event, share a ready-made message carrying the team's guest link to
the WhatsApp group, and record that it was sent. No scheduling, no notification, no update or
cancellation prompt: those are Parts 2 and 3. `pr-scope.yml` flags this PR (`server/prisma`); the
description lists the behaviour changes below.

## 1. Corrections to the design doc that shape this part

- **`platform` is an enum, not a `String`.** It has three known values and feeds the analytics funnel;
  a free string would be the first thing to drift. `EventSharePlatform { SHARE_SHEET WA_ME COPY }`.
- **The attribution tag is `via`, a nullable enum on `EventRsvpChange`**, not a string on the request.
  `EventRsvpVia { WHATSAPP }`. `EventRsvp.source` stays `GUEST_LINK`, as the design doc says.
- **`event_name` has no stored source**: `Event` has no title. It is `describeEvent()` from
  `server/src/common/event-copy.ts` (« Match contre X » / « Entraînement »), so the WhatsApp message and
  the notifications name an event the same way.
- **An unconfirmed FFBB kickoff** (`timeConfirmed: false`) renders `{event_time}` as « horaire à
  confirmer », never « 00:00 ».

## 2. Schema

One hand-written migration, `20260930010000_add_whatsapp_share`, then `prisma generate`:

```prisma
enum EventShareType     { REMINDER }                        // UPDATE, CANCELLATION arrive in Part 3
enum EventShareState    { SENT }                            // SCHEDULED, PENDING, EXPIRED, VOID in Part 2
enum EventSharePlatform { SHARE_SHEET WA_ME COPY }
enum EventRsvpVia       { WHATSAPP }

model EventShare {
  id           String              @id @default(uuid())
  eventId      String
  type         EventShareType
  state        EventShareState
  sentByUserId String?
  sentAt       DateTime?
  platform     EventSharePlatform?
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  event        Event               @relation(fields: [eventId], references: [id], onDelete: Cascade)
  sentBy       User?               @relation("EventShareSentBy", fields: [sentByUserId], references: [id], onDelete: SetNull)

  @@unique([eventId, type])
}

model Team            { waReminderTemplate String? }   // null = DEFAULT_REMINDER_TEMPLATE
model EventRsvpChange { via EventRsvpVia? }
```

Back-relations `Event.shares`, `User.eventSharesSent`. Enums are grown with `ALTER TYPE … ADD VALUE`
in later parts, the way `AuditEventType` has been.

## 3. Shared types: `@basketeasy/types/whatsapp-reminder`

New file plus its `exports` entry in `packages/@basketeasy/types/package.json`.

- `WHATSAPP_TEMPLATE_VARIABLES = ['event_name', 'event_date', 'event_time', 'location', 'team_name', 'link'] as const`
  and `WhatsAppTemplateVars = Record<(typeof …)[number], string>`.
- `renderTemplate(template, vars)`: replaces `{var}` tokens, nothing else (no escaping: WhatsApp is plain text).
- `validateTemplate(template)` → `{ ok: true } | { ok: false; code: 'MISSING_LINK' | 'TOO_LONG' | 'UNKNOWN_VARIABLE'; variable?: string }`.
  Max `WHATSAPP_TEMPLATE_MAX_LENGTH = 1000`, must contain `{link}`, any other `{…}` token refused.
- `DEFAULT_REMINDER_TEMPLATE` (French, final copy reviewed in the PR):
  « 🏀 {event_name} – {event_date} à {event_time}, {location}. Dites-nous si vous venez : {link} »
- `EventShareType`, `EventShareState`, `EventSharePlatform` string unions mirroring Prisma.
- `EventShareStatus { type; state: EventShareState | 'NOT_SENT'; sentAt: string | null; sentBy: EventRsvpRespondent | null; platform }`.
  `sentBy` reuses the first-name + last-initial `EventRsvpRespondent` shape.
- `EventWhatsAppShare { guestLinkActive: boolean; shares: Array<EventShareStatus & { message: string | null }> }`.
  `message` is null when the guest link is off (there is nothing valid to send).
- `TeamWhatsAppSettings { reminderTemplate: string | null }` and `UpdateTeamWhatsAppSettingsRequest`.
- `ConfirmEventShareRequest { platform: EventSharePlatform }`.
- `guest-links.ts`: `GuestRsvpRequest.via?: 'WHATSAPP'` and `EventRsvpChangeEntry.via: 'WHATSAPP' | null`.

## 4. Backend: `server/src/whatsapp-reminders`

`WhatsAppRemindersModule` imports `AuthModule`, `GuestLinksModule` (which now exports
`GuestLinksService`). Nothing imports it yet; Events starts depending on it in Part 2.

- `WhatsAppReminderService`
  - `getTeamSettings` / `updateTeamSettings(clubId, teamId, dto)`: re-verify `ClubTeam`, validate with
    `validateTemplate` (400 carrying the `code` so the form binds it to the field). An empty string or
    a template equal to the default is stored as `null`.
  - `getEventShare(clubId, teamId, eventId)`: re-verify the event is the team's; reads the event, the
    team (name, template), `TeamGuestLink` and the `EventShare` rows; renders with `buildTemplateVars`.
    Read-only: an absent row is `state: 'NOT_SENT'`.
  - `confirmShare(clubId, teamId, eventId, type, userId, platform)`: refuses a past event (`409
WA_SHARE_CLOSED`) and a disabled guest link (`409 GUEST_LINK_DISABLED`). Upsert on `(eventId, type)`,
    then the first-writer-wins `updateMany({ where: { id, state: { not: 'SENT' } }, data: { state: 'SENT', sentAt, sentByUserId, platform } })`.
    A second confirmation is a `200` returning the first writer's status, not an error: both admins
    really did send it.
- `buildTemplateVars(event, teamName, guestUrl)` in `whatsapp-template-vars.ts`: `describeEvent`,
  date « sam. 4 oct. » and time via `common/event-copy.ts`, all Europe/Paris; the link is the guest URL
  plus `?src=wa`.
- `WhatsAppReminderController`, all `JwtAuthGuard` + `TeamManagerGuard`:
  - `GET  clubs/:clubId/teams/:teamId/whatsapp-settings`
  - `PATCH clubs/:clubId/teams/:teamId/whatsapp-settings`
  - `GET  clubs/:clubId/teams/:teamId/events/:eventId/whatsapp-share`
  - `POST clubs/:clubId/teams/:teamId/events/:eventId/whatsapp-share/REMINDER/confirm` (`:type` validated
    against the enum; only `REMINDER` exists in this part)
- **Guest RSVP attribution:** `GuestRsvpService.setRsvp` / `clearRsvp` accept `via` and write it on the
  `EventRsvpChange` row in the same transaction. `EventRsvp` is untouched. `GuestLinksService.history`
  returns it.

## 5. Frontend: `app/src/whatsapp-reminders/`

- **`WhatsAppShareCard`**, in `EventDetailManagerView` under its own `SectionHeading` « Partage WhatsApp »,
  `canManage` only, upcoming events only. Query ladder `error → loading → data` (no empty state: an
  absent row is data).
  - Not sent: one line of context and a primary « Partager sur WhatsApp ».
  - Sent: soft `Badge` « Envoyé » plus « Envoyé le 04/10 à 18:12 par Sophie M. », and a secondary
    « Partager à nouveau ».
  - Guest link off: `Alert` « Le lien de réponse est désactivé » and « Réactiver le lien » (calls the
    existing enable mutation, then refetches). No share button.
  - « Voir le message » disclosure shows the exact text.
- **`shareMessage(message)`** (`shareMessage.ts`, pure and unit-tested): `navigator.share({ text })` when
  present (`SHARE_SHEET`), else open `https://wa.me/?text=<encoded>` (`WA_ME`). A « Copier le message »
  button is always there (`COPY`). A rejected `navigator.share` with `AbortError` means the user backed out:
  no confirm row.
- **Confirm row**, inline in the card, not a `Dialog`: after any of the three actions the card shows
  « Vous l'avez envoyé dans le groupe ? » with « Oui, c'est envoyé » / « Pas encore ». « Oui » runs the confirm
  mutation and ends in a `toast()`; « Pas encore » just hides the row. The row is state set on click, so it
  is there when the user comes back from WhatsApp; no `visibilitychange` trickery.
- **`WhatsAppSettingsCard`** beside `TeamGuestLinkSettings` on `TeamDetailPage`, `canManageTeam` only: the
  reminder template in a textarea (react-hook-form + zod, the zod refinement calling `validateTemplate`,
  server refusals via `setError('reminderTemplate')`), variable chips that insert `{var}` at the cursor, a
  live preview rendered with `renderTemplate` over a fixed sample event, and « Rétablir le texte par
  défaut ». Save ends in a `toast()`.
- **Guest page:** `GuestRsvpPage` reads `?src=wa` once on mount, keeps it in component state (not
  localStorage: attribution is per visit), strips it with `replace`, and sends `via: 'WHATSAPP'` on RSVP
  writes. `rsvpHistoryLabels` renders « via lien (WhatsApp) ».

## 6. Tests

- Jest: `renderTemplate` / `validateTemplate` (each code, a `{link}` inside another word, repeated
  variables, length at 1000/1001), `buildTemplateVars` (Europe/Paris across a DST change, unconfirmed
  time, training vs match), `confirmShare` (past event, link off, second confirmation keeps the first
  sender), settings validation and default-normalising, `setRsvp` writing `via`.
- `server/test/db/whatsapp-share.db-spec.ts`: the `(eventId, type)` unique, cascade with `Event`, and two
  concurrent `confirmShare` calls leaving one `sentByUserId`.
- Vitest + MSW: card not sent / sent / link off / error; share falls back to `wa.me` without
  `navigator.share`; `AbortError` shows no confirm row; « Oui » posts and toasts, « Pas encore » posts
  nothing; settings form blocks save on a missing `{link}` and an unknown variable, preview updates, reset
  restores the default; guest page sends `via` and strips `?src=wa`.
- Screenshots (`pnpm mock-api` + new fixture `scripts/fixtures/whatsapp-share.json`, built on
  `authenticated-admin-session.json`): card not sent, confirm row, card sent, link off, settings card.

## 7. Done when

A manager can share a reminder for any upcoming event, the event shows who sent it and when, a guest
answer arriving through the shared message is tagged WhatsApp in the answer history, and nothing is
scheduled or notified.
