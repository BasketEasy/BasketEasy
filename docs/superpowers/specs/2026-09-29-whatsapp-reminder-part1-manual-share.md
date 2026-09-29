# WhatsApp event reminder: Part 1, manual share (MVP)

Status: spec (implements Part 1 of [`2026-09-29-whatsapp-reminder-design.md`](./2026-09-29-whatsapp-reminder-design.md))
Date: 2026-09-29
Design: [Claude Design canvas](https://claude.ai/artifact/NAv8Bx7keKLph7XUBEsXHK) (the screens for all three parts).

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
- **The message is casual and carries the RDV** (product owner, design review): it says « tu », never
  « vous », and gives the meeting time and place as well as the start time. So the variables grow
  `opponent`, `meeting_time` and `meeting_place`, read from the event's `meetingPlan`.
- **One template serves matches and trainings, through a line-drop rule** rather than a second template
  per event type: when rendering, a line holding a variable that has no value for this event is removed
  whole. A training has no opponent and no RDV, so its RDV line disappears, and a match with no meeting
  point configured loses it too. A known RDV place with an unknown time is a value (« heure à
  confirmer »), not a gap, so that line stays.
- **Admins never see `{…}` codes.** The template is stored as `{key}` text, but the editor shows each
  variable as a labelled chip (« Heure de RDV »), and every message an admin reads names variables by
  label (« Le message doit contenir le lien de réponse »).
- **The update prompt compares content, not fields.** `EventShare.sentContentKey` records a hash of the
  variables of the message that was sent; Part 3 raises an update exactly when the current variables
  hash differently. It is written here, at confirm, so shares confirmed before Part 3 ships can be
  compared too.

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
  // contentKey() of the sent message's variables (link excluded).
  sentContentKey String?
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

- `WHATSAPP_TEMPLATE_VARIABLES`, in chip order, each with its French label
  (`WHATSAPP_TEMPLATE_VARIABLE_LABELS`) and an example value:

  | Key             | Label              | Value                                         | Empty when                  |
  | --------------- | ------------------ | --------------------------------------------- | --------------------------- |
  | `event_name`    | Nom de l'événement | « Match contre ES Vertou » / « Entraînement » | never                       |
  | `opponent`      | Adversaire         | « ES Vertou »                                 | a training                  |
  | `event_date`    | Date               | « sam. 4 oct. »                               | never                       |
  | `meeting_time`  | Heure de RDV       | « 14:30 », or « heure à confirmer »           | no meeting place resolved   |
  | `meeting_place` | Lieu de RDV        | « Parking du club »                           | no meeting place resolved   |
  | `event_time`    | Heure de début     | « 15:30 », or « horaire à confirmer »         | never                       |
  | `location`      | Lieu               | « Gymnase de la Durantière »                  | never                       |
  | `team_name`     | Équipe             | « U15 F1 »                                    | never                       |
  | `link`          | Lien de réponse    | guest URL + `?src=wa`                         | never (share blocked first) |

  `WhatsAppTemplateVars = Record<key, string | null>`; `null` is « empty ».

- `renderTemplate(template, vars)`: splits on `\n`, drops every line holding a variable whose value is
  `null`, then replaces the `{key}` tokens. No escaping: WhatsApp is plain text.
- `validateTemplate(template)` → `{ ok: true } | { ok: false; code: 'MISSING_LINK' | 'TOO_LONG' | 'UNKNOWN_VARIABLE' | 'LINK_ON_DROPPABLE_LINE'; variable?: string }`.
  Max `WHATSAPP_TEMPLATE_MAX_LENGTH = 1000`, must contain `{link}`, any other `{…}` token refused, and
  `{link}` may not share a line with `opponent`, `meeting_time` or `meeting_place` (a training would drop
  the link with the line). `WHATSAPP_TEMPLATE_ERROR_MESSAGES` holds the French copy per code, in labels.
- `contentKey(vars)`: stable hash (FNV-1a over the sorted non-link entries, hex), shared so the
  server and tests agree without `node:crypto` in the browser bundle.
- `DEFAULT_REMINDER_TEMPLATE` (French, casual, final copy reviewed in the PR):

  ```text
  🏀 {event_name}, {event_date} !
  RDV {meeting_time} – {meeting_place}.
  On commence à {event_time} ({location}).
  Dis-nous si tu viens 👉 {link}
  ```

  A match renders all four lines; a training renders three.

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
`GuestLinksService`) and `MeetingPointsModule` (for the RDV). Nothing imports it yet; Events starts depending on it in Part 2.

- `WhatsAppReminderService`
  - `getTeamSettings` / `updateTeamSettings(clubId, teamId, dto)`: re-verify `ClubTeam`, validate with
    `validateTemplate` (400 carrying the `code` so the form binds it to the field). An empty string or
    a template equal to the default is stored as `null`.
  - `getEventShare(clubId, teamId, eventId)`: re-verify the event is the team's; reads the event, the
    team (name, template), `TeamGuestLink` and the `EventShare` rows; renders with `buildTemplateVars`.
    Read-only: an absent row is `state: 'NOT_SENT'`.
  - `confirmShare(clubId, teamId, eventId, type, userId, platform)`: refuses a past event (`409
WA_SHARE_CLOSED`) and a disabled guest link (`409 GUEST_LINK_DISABLED`). Upsert on `(eventId, type)`,
    then the first-writer-wins `updateMany({ where: { id, state: { not: 'SENT' } }, data: { state: 'SENT', sentAt, sentByUserId, platform, sentContentKey } })`,
    `sentContentKey` computed from the variables as they are now (the message the admin just shared).
    A second confirmation is a `200` returning the first writer's status, not an error: both admins
    really did send it.
- `buildTemplateVars(event, teamName, plan, guestUrl)` in `whatsapp-template-vars.ts`: `describeEvent`,
  date « sam. 4 oct. » and times via `common/event-copy.ts`, all Europe/Paris. The RDV comes from
  `MeetingPointsService.resolvePlans` (one call for the batch, as `TeamEvent.meetingPlan` does):
  `meeting_place` is the resolved place's name (else its address), `meeting_time` its `meetsAt`, or
  « heure à confirmer » when the place is known and the time isn't. A training has no plan, so both are
  `null`. The link is the guest URL plus `?src=wa`.
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
- **`WhatsAppSettingsCard`** beside `TeamGuestLinkSettings` on `TeamDetailPage`, `canManageTeam` only:
  react-hook-form + zod (the refinement calls `validateTemplate` and shows
  `WHATSAPP_TEMPLATE_ERROR_MESSAGES`), server refusals via `setError('reminderTemplate')`, « Insérer une
  info » buttons (one per variable, by label), a live preview with a « Match / Entraînement » switch so
  the line-drop rule is visible, and « Rétablir le texte par défaut ». Save ends in a `toast()`.
- **`TemplateEditor`**, the field behind it, wired through `Controller`, built on **Tiptap**
  (ProseMirror). A hand-rolled `contenteditable` with non-editable chips was the first idea and was
  dropped: caret placement around atomic spans, IME and predictive-text input, and undo are exactly
  where browsers disagree, and managers edit this on a phone.
  - **Where it lives:** `packages/@basketeasy/ui/template-editor.tsx`, exported as
    `@basketeasy/ui/template-editor` (new `exports` entry), and the **only** file in either package that
    imports `@tiptap/*`, the way `@basketeasy/ui/chart` is the only one importing `recharts`. The app
    knows nothing about Tiptap, so a later swap is one file.
  - **Dependencies** (in `packages/@basketeasy/ui/package.json`, versions pinned when built):
    `@tiptap/core`, `@tiptap/react`, `@tiptap/pm` and the `document`, `paragraph`, `text`, `history` and
    `placeholder` extensions. No starter kit: bold, lists, headings and the rest have no meaning in a
    WhatsApp message and would be one more thing to strip on paste.
  - **Model:** one paragraph per line, text, and a custom inline atom node `variable` (`attrs: { key }`)
    whose React node view renders the French label as a token chip (`tone="structure"`, colour owned by
    the component). `atom: true` gives whole-chip selection and deletion for free.
  - **API:** `value: string` (the `{key}` text) and `onChange(value)`; `variables: { key; label }[]`; a
    ref exposing `insertVariable(key)` for the « Insérer une info » buttons (inserts at the selection, at
    the end when the editor never had focus); `aria-labelledby` / `aria-describedby` passed to the
    editable element, which also gets `role="textbox"` and `aria-multiline="true"`. `focusRing` on the
    wrapper, surface `surface-2` like `Input`.
  - **Serialisation:** `parseTemplate(text, variables)` → editor JSON (a `{key}` whose key is known
    becomes a node, anything else stays text) and `serializeTemplate(doc)` → text (paragraphs joined by
    `\n`, nodes as `{key}`), pure and unit-tested beside the component. `onChange` fires the serialised
    string, so the form value and the API only ever see `{key}` text. The value is compared before
    `setContent` so typing never resets the caret.
  - **Rules it must hold:** paste is plain text only (`editorProps.transformPastedHTML` / clipboard
    parser reduce it to text; a pasted `{link}` stays text); Enter starts a new line; typing `{` is just
    a character (a typed `{link}` is serialised as text and refused by validation like any unknown
    token, never silently turned into a chip); undo/redo via `history`.
  - **Loaded lazily.** `WhatsAppSettingsCard` imports the editor through `React.lazy` with a
    `Skeleton` of the field's height as fallback, so the Tiptap bundle is fetched only when a manager
    opens team settings, never by players and parents. Same reasoning as the lazy admin route.
  - `docs/frontend-stack.md` and `CLAUDE.md` record the choice and the one-file rule in the same PR.
- **Guest page:** `GuestRsvpPage` reads `?src=wa` once on mount, keeps it in component state (not
  localStorage: attribution is per visit), strips it with `replace`, and sends `via: 'WHATSAPP'` on RSVP
  writes. `rsvpHistoryLabels` renders « via lien (WhatsApp) ».

## 6. Tests

- Jest: `renderTemplate` / `validateTemplate` (each code, a `{link}` inside another word, repeated
  variables, length at 1000/1001, line drop for a training and for a match without meeting point,
  `{link}` on a droppable line), `contentKey` stable across key order and blind to the link,
  `buildTemplateVars` (Europe/Paris across a DST change, unconfirmed time, RDV known / time unknown /
  no place, training vs match), `confirmShare` (past event, link off, second confirmation keeps the first
  sender), settings validation and default-normalising, `setRsvp` writing `via`.
- `server/test/db/whatsapp-share.db-spec.ts`: the `(eventId, type)` unique, cascade with `Event`, and two
  concurrent `confirmShare` calls leaving one `sentByUserId`.
- Vitest + MSW: card not sent / sent / link off / error; share falls back to `wa.me` without
  `navigator.share`; `AbortError` shows no confirm row; « Oui » posts and toasts, « Pas encore » posts
  nothing; settings form blocks save on a missing link and an unknown variable, preview updates and
  drops the RDV line on « Entraînement », reset restores the default; `TemplateEditor` (Vitest in
  `packages/@basketeasy/ui`) round-trips `{key}` text through `parseTemplate`/`serializeTemplate`,
  pastes plain text, deletes a chip whole, inserts at the selection and at the end without focus, keeps
  a typed `{link}` as text, doesn't move the caret on a re-render with the same value; one Playwright
  pass in the screenshot run types, backspaces over a chip and pastes in a real Chromium, since jsdom has
  no layout for ProseMirror's caret; guest page sends `via` and strips `?src=wa`.
- Screenshots (`pnpm mock-api` + new fixture `scripts/fixtures/whatsapp-share.json`, built on
  `authenticated-admin-session.json`): card not sent, confirm row, card sent, link off, settings card (editor with chips, preview on
  « Entraînement »).

## 7. Done when

A manager can share a reminder for any upcoming event, the event shows who sent it and when, a guest
answer arriving through the shared message is tagged WhatsApp in the answer history, and nothing is
scheduled or notified.
