# WhatsApp event reminder: design and plan

Status: spec
Date: 2026-09-29
Source: the shared "WhatsApp Event Reminder: Feature Plan" doc (product owner: Johan). Builds on the [guest RSVP link](./2026-09-29-guest-rsvp-link-design.md).

## Why

Some roster members never install the app. Admins chase RSVPs by hand. The guest link (`/r/:token`) already lets
them answer with no account; what is missing is getting it in front of them, in the WhatsApp group they already read.

## Decisions (from the doc)

- **Admin-assisted share.** The app prepares the message; an admin sends it from their own WhatsApp. No Business API,
  no unofficial bot, no Telegram (deferred). No server-side WhatsApp integration at all.
- Recipient: the team WhatsApp group, picked by the admin in WhatsApp every time. The group is never stored.
- Link: the team's existing `TeamGuestLink` URL. Unlogged permissions unchanged.
- Notified: every team admin (`TeamAdmin` plus club `ADMIN`s of a linked club, deduped).
- Timing: reminder at `startsAt − X`, X per event. Always sent when enabled.
- Enablement: team default, per-event override. Template per team (reminder, update, cancellation).
- Re-nudge once, 1h after the first notification, if still not shared.
- Success: "Envoyé le xx/xx par xyz", visible to admins only (open question in the doc; admins-only is the safe default).
- Edit or cancel after a share: prompt admins to share an update.

## Fit with the codebase

- **Notifications:** new `NotificationType` values, delivered through `NotificationsService.notify()` (in-app row
  first, e-mail and Web Push best-effort). Copy is a pure function in `server/src/events/`, like
  `event-notification-copy.ts`. Deep link `/clubs/<clubId>/teams/<teamId>/events/<eventId>?partage=<type>`
  (club resolved like `TeamsService.toMyTeamSummary`).
- **Scheduling:** a BullMQ queue `whatsapp-reminder` beside `meeting-travel`, one delayed job per event and type,
  with a deterministic `jobId` (`wa:<eventId>:<type>`) so reschedule is remove+add and cancel is remove.
  The processor re-reads state before acting: the job is a hint, `EventShare` is the truth.
- **Share is a client action**: Web Share API (`navigator.share`) where available, else `https://wa.me/?text=`,
  plus a copy button. The web app has no completion signal, so **every** share ends in an explicit
  "Vous l'avez envoyé ?" confirm; the doc's iOS/Android native handlers do not apply to a React SPA.
- **Sender tag:** the link gets `?src=wa` (guest page ignores unknown params; RSVP source stays `GUEST_LINK`,
  attribution is read from the query on first load and sent with the RSVP as `via: 'wa'`).
- Same rules as the repo: `GET` never writes; forms are react-hook-form + zod; colour via variants; query branches
  `error → loading → empty → data`; `pr-scope.yml` flags the `server/prisma` diff, list the behaviour changes.

## Data model (Prisma)

```prisma
enum EventShareType  { REMINDER UPDATE CANCELLATION }
enum EventShareState { SCHEDULED PENDING SENT EXPIRED VOID }

model Team  { waReminderEnabled Boolean @default(false)
              waDefaultOffsetMinutes Int @default(1440)
              waReminderTemplate String? ; waUpdateTemplate String? ; waCancellationTemplate String? }
model Event { waReminderOverride Boolean?      // null inherits the team
              waOffsetMinutes Int? }           // null inherits the team
model EventShare {
  id, eventId (cascade), type EventShareType, state EventShareState,
  firstNotifiedAt?, nudgedAt?, sentByUserId? (SetNull), sentAt?, platform String?
  @@unique([eventId, type])
}
```

Templates stay `null` until an admin edits them: the default copy lives in code (`@basketeasy/types/whatsapp-reminder`,
`DEFAULT_*_TEMPLATE`), so improving the copy reaches every team that never customised it. Two confirmations racing
are both fine: `sentAt`/`sentByUserId` are set by a conditional `updateMany WHERE state <> SENT`, first writer wins.
Add `NotificationType.WHATSAPP_SHARE_REQUESTED` and `AuditEventType` is **not** touched (not authentication).

## Shared types: `@basketeasy/types/whatsapp-reminder`

`WhatsAppTemplateVariable` (`event_name event_date event_time location team_name link`), `renderTemplate`,
`validateTemplate` (must contain `{link}`, max 1000 chars, unknown `{vars}` refused), the three default templates,
`EventShareStatus`, `TeamWhatsAppSettings`, `EventWhatsAppSettings`. Shared so the live preview and the server
render identically. New file plus its `exports` entry, no barrel.

## Rules that need a decision the doc left open (proposed)

1. **Default X:** 24h (kept; Johan's 6h question is still open, one constant `DEFAULT_WA_OFFSET_MINUTES`).
2. **Update prompt fires on `startsAt`, `location`, `type`/`opponentName` changes only**, not notes. Notes are
   not in the template.
3. **Cancel and update templates are admin-editable with a provided default**, per the settings table.
4. **Recurring series: one reminder per occurrence**, each independent, matching `Event` rows being independent.
   A series-scope edit reschedules every affected occurrence but sends **one** update prompt per admin
   (the `deleteEvent` series rule). One share for the series is a follow-up.
5. **No `TRAINING` exclusion:** the toggle decides. Matches and trainings both qualify.
6. **Nobody to notify** (no admin with any delivery channel): the in-app row is still written; the team settings
   card shows a warning. Nothing else.
7. **Disabled or missing guest link:** enabling the reminder auto-enables the team guest link (audited as today);
   share is blocked with a "Réactiver le lien" action if an admin disabled it later.
8. **Offset changed after the push:** no new push, state kept. Toggle off drops any unsent job and sets state `VOID`.
9. **Event created inside the window:** notify immediately; no re-nudge if `startsAt` is under 1h away. Past: nothing.

## Backend

`server/src/whatsapp-reminders` (imports Notifications and Queue; Events depends on it, never the reverse, same
direction as meeting-points):

- `WhatsAppReminderService`
  - `resolveSettings(event, team)`: effective `{ enabled, offsetMinutes }`.
  - `syncEvent(eventId)`: the single reconcile entry point Events calls after create/update/toggle. Computes the
    desired schedule from current state and makes the queue and `EventShare` match it (idempotent).
  - `onEventChanged(before, after)` / `onEventCancelled(...)` / `onEventsDeleted(...)`: create the UPDATE and
    CANCELLATION prompts as in the state table, void unsent ones.
  - `confirmShare(eventId, type, userId, platform)`: conditional `updateMany`, then withdraws the other admins'
    in-app rows for that share (`Notification` marked read where `deepLink` carries the share key).
  - `getStatus(eventId)`: what the event screen shows (`SCHEDULED | PENDING | SENT | EXPIRED`, sender name, time).
- `WhatsAppReminderProcessor`: `send` job (state must still be `SCHEDULED`, event still in the future, reminder
  still on: then notify all admins, `PENDING`, enqueue `nudge` at +1h) and `nudge` (still `PENDING`: notify once,
  set `nudgedAt`). Event start reached: an `expire` job sets `EXPIRED`.
- Routes (all `TeamManagerGuard`):
  - `GET/PATCH clubs/:clubId/teams/:teamId/whatsapp-settings` (toggle, offset, three templates, validated by the shared
    `validateTemplate`).
  - `GET .../events/:eventId/whatsapp-share` → status plus the **rendered** message for each type.
  - `POST .../events/:eventId/whatsapp-share/:type/confirm` body `{ platform }`.
  - Event create/update DTOs gain `waReminderOverride?`, `waOffsetMinutes?`; `TeamEvent` gains `whatsAppShare`
    (admins only, null for others; resolved in one extra query per batch).
- Copy: `whatsapp-notification-copy.ts` next to the service, dates in Europe/Paris via `common/event-copy.ts`.
- Startup: a `WhatsAppReminderModule.onModuleInit` reconcile pass is **not** built; `syncEvent` on write is enough,
  and the processor re-checking state makes a stale job harmless.

## Frontend

`app/src/whatsapp-reminders/`:

- `WhatsAppShareCard` on the event screen, admins only (`Card`, `Text`, `Badge` for the state). Four states as in the
  doc; the Share button is always available. Sequence: `navigator.share` (or `wa.me` link, or copy) → on resume/return a
  `Dialog`-free inline "Vous l'avez envoyé ? Oui / Non" row → `confirm` mutation → `toast()`. "Non" leaves it
  `PENDING`. Query branches per convention.
- `WhatsAppSettingsCard` on the team settings tab: toggle, `DurationField` for X, three template editors
  (react-hook-form + zod using the shared `validateTemplate`), live preview from a sample event, per-template
  "Rétablir le texte par défaut".
- Event create/edit dialogs: a "Rappel WhatsApp" toggle (inherit / on / off, `SelectField`) and offset field, shown only
  when the team has a guest link; both go through the existing `useForm`.
- Notification deep link `?partage=<type>` opens the event screen with the card scrolled into view and the share
  sheet ready (`navigator.share` needs a user gesture, so it focuses the button rather than auto-firing).
- Screenshots via `pnpm mock-api` plus a committed fixture `scripts/fixtures/whatsapp-share.json`.

## Analytics

The repo has no analytics layer. Rather than add one, the funnel is derived from data we already keep:
`EventShare` (notified, nudged, sent, platform) and `EventRsvp` with the `via: 'wa'` tag on `EventRsvpChange`.
`wa_share_tapped` / `declined` are not stored; a real analytics seam is a separate decision.

## Tests

- Jest: `resolveSettings` matrix, `syncEvent` idempotence (every row of the doc's state table), processor guards
  (stale job after cancel, toggle off, already sent), race on `confirmShare`, series update sends one prompt, copy
  fixtures, `validateTemplate`.
- `server/test/db/whatsapp-share.db-spec.ts`: the `(eventId, type)` unique, cascade with `Event`, and the first-writer-wins
  `updateMany` under real concurrency.
- Vitest + RTL: share card states and confirm flow, settings form validation (missing `{link}` blocks save).

## Rollout, in parts

Each part is its own PR and gated as in the source doc.

1. **Part 1, manual share (MVP):** `EventShare` model (REMINDER only in use), `confirmShare`, `whatsapp-share` GET,
   shared types and templates, team template settings, `WhatsAppShareCard`, `?src=wa`. No scheduling.
2. **Part 2, scheduled reminders:** team/event toggles and offset, the queue, `send`/`nudge`/`expire`, immediate notify
   inside the window, `WHATSAPP_SHARE_REQUESTED` notification, deep link.
3. **Part 3, updates and cancellations:** UPDATE/CANCELLATION states, edit/cancel hooks in `EventsService`, series
   handling, the two templates' UI.

Beta with a handful of teams with many non-app members before general release. Metric targets stay TBD until
Part 1 has real data.

## Open points to confirm at review

- 24h or 6h default X.
- Whether members (not just admins) see "Envoyé le … par …".
- Series: per-occurrence reminders (proposed) or one share for the series.
- FR only copy (proposed, per the repo's locale rule) versus a per-team language.
