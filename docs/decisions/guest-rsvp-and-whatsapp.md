# Guest RSVP link and WhatsApp reminders

Some roster members never install the app (on SportEasy either). Without a way for them to answer,
RSVP, convocations and the RDV stop working for exactly the players a coach worries about. Two
features close that gap: a no-account answer link, and a reminder that gets the link into the team's
WhatsApp group. The guest link's rules are in `CLAUDE.md` (« Guest RSVP link »); the WhatsApp
rules live **only here**.

## Guest link (`/r/:token`)

### Decisions (product owner, 2026-09-29)

1. **One shared link per team**; the visitor picks their name from the roster. (Per-player links
   already exist: that is `PlayerInvite`.)
2. It opens a team page listing the next **14 days**, answerable until kick-off.
3. Roster only: a trialist is added to the roster first (no account needed).
4. A guest can RSVP, choose a travel mode, see event details, the RDV and **who's coming**.
5. A player with an account may use it too; the answer is tagged « via lien ».
6. Names are « Prénom N. ».
7. Off by default; enable, regenerate (kills the old URL), disable; an answer history for coaches;
   no automatic expiry (regenerate at season start for a clean cut).
8. Convocations are shown: a guest gets no notification, so the page is the only way they learn it.
9. A soft, never-blocking nudge lists what an account unlocks (notifications, stats, MVP vote,
   results and scoresheets, which stay account-only).
10. A guest becomes an account only through `PlayerInvite`; there is no claim flow, so holding the
    shared link never lets someone take over a teammate's slot.
11. The chosen name is remembered on the device, with « Ce n'est pas moi ? ».

### Threat model

The token is a **bearer credential for a WhatsApp group**: anyone holding it reads first names and
the next 14 days, and can set **any** roster member's answer. That trade-off was accepted; the
mitigations detect and stop misuse rather than prevent it:

- every answer, app or guest, appends an `EventRsvpChange` in the same transaction, so « who changed
  Léo's answer » has no holes; a guest answer is tagged and its author is null;
- regenerate kills a leaked URL at once, disable removes the surface, and re-enabling issues a new
  token (a coach who disabled a leak must not resurrect it);
- two-stage rate limiting (per visitor address, then the link's shared budget only after
  validation), in memory, so one visitor's junk cannot lock the team out;
- nothing beyond first name + initial is served; no IP or user agent is stored (personal data about
  an unauthenticated visitor, for a signal the history already gives);
- `noindex` and `no-referrer`, as response headers and as meta tags on the SPA shell (nginx serves
  the shell, not the API).

Accepted limitation: an answer given by a teammate can't be told apart from the player's own; the
history makes it reviewable, not preventable. The token is stored **in clear**, unlike every other
link token: a coach re-copies it to re-post it, and hashing it would force a regenerate on every
view. The history is `EventRsvpChange`, not `AuditLog` (an RSVP is not authentication); enabling,
regenerating and disabling **are** audited, because turning the link on opens names to anyone.

### Details that were corrected on the way

- The public payload has no `isMe`: the server does not know who the visitor is, so the visitor's
  row is picked client side.
- `invite-request` notifies the **admins of the player's own club** (the only people able to issue
  the `PlayerInvite`, which lives on the club's Joueurs tab; on a CTC team that is not necessarily
  the owner club). It always answers 204 and de-duplicates for 7 days through existing
  notifications, so the link can't reveal which teammates have accounts.
- A 404 is a dead link (`retry: false`), rendered « Ce lien n'est plus actif… ». A
  `GUEST_RSVP_CLOSED` refetches so the event drops off.
- The guest page reuses the event page's presentational pieces (answer buttons, timeline steps,
  travel choice) split out of their authenticated wrappers, not copies of them.

## WhatsApp reminders

### Decisions

- **Admin-assisted share only.** Kluvo prepares the message; a manager sends it from their own
  WhatsApp. No Business API, no bot, no Telegram, no server-side WhatsApp at all. The group is never
  stored.
- The link is the team's guest link plus `?src=wa`. Enabling the reminder auto-enables the guest
  link (already audited); if a manager later disables the link, sharing is blocked with « Réactiver
  le lien ».
- Recipients are every manager (`TeamAdmin`s + `ADMIN`s of every linked club, deduplicated).
- Reminder at `startsAt − X`: team default 3 days, per-event override, X between 1 hour and 14 days
  (the guest page shows only 14 days; a reminder 20 days out would link to a page without the
  event). One nudge an hour later if still unshared, unless kick-off is under an hour away.
- Matches and trainings both qualify; the toggle decides. A recurring series gets one reminder per
  occurrence, and a series edit sends one prompt per manager.
- « Envoyé le … par … » is visible to managers only (open: whether members should see it).
- Copy is French and casual (« tu »: it is a message to the group), and carries the RDV.

### Templates

- Stored as `{key}` text, shown to managers as labelled chips; a manager never sees `{…}` codes.
  Variables: `event_name` (`describeEvent`, since `Event` has no title), `opponent`, `event_date`,
  `meeting_time`, `meeting_place`, `event_time`, `location` (`eventVenueLabel`), `team_name`, `link`.
- **Line-drop rule:** a line holding a variable with no value for this event is removed whole, so one
  template serves a match and a training. A known RDV place with an unknown time is a value
  (« heure à confirmer »), not a gap. An unconfirmed FFBB kick-off renders « horaire à confirmer ».
- Validation (shared by the form and the server): `{link}` required (except on the cancellation
  template, where there is nothing left to answer), never on a droppable line, max 1000 characters,
  unknown variables refused.
- The default copy lives in code; a template equal to the default (or empty) is stored as null, so
  improving the default reaches every team that never customised it.
- The editor is Tiptap behind `@basketeasy/ui/template-editor` (see `docs/frontend-stack.md`):
  a hand-rolled `contenteditable` breaks on caret placement around chips, IME and undo, worst on
  phones. No starter kit, plain-text paste, a typed `{link}` stays text, lazy-loaded so only managers
  download it.

### Sharing

- `navigator.share` when present, else `https://wa.me/?text=…`, plus « Copier le message ». The web
  has **no completion signal**, so every share ends in an inline « Vous l'avez envoyé ? Oui / Pas
  encore » row (state set on click, no `visibilitychange` tricks). An `AbortError` from the share
  sheet means the user backed out: no confirm row.
- Two managers confirming at once are both right: first writer wins through a conditional
  `updateMany`, the second gets 200 with the first sender. Confirming withdraws the other managers'
  pending notifications (matched on the deep link's `partage=<shareId>`).
- `?partage=` focuses the share button but never fires it: `navigator.share` needs a user gesture.
- `?src=wa` is read once per visit (component state, not storage), stripped, and recorded as
  `via: WHATSAPP` on `EventRsvpChange`; `EventRsvp.source` stays `GUEST_LINK`.

### Scheduling

- `syncEvent` / `syncEvents` is the **only** reconcile entry point: it reads the event, the team
  settings and the share row, computes the desired state and makes the row and the queue match it,
  idempotently. It is called after every write path: create, update, time-of-day update, team
  settings, **and the FFBB import** (the bulk of a season's events never pass through
  `EventsService`).
- It writes the row first, then moves jobs; the processor re-reads state before acting, so a job
  left by a crash is harmless. A Redis failure is logged, never a 500 on the event write.
- Job ids use `-`, not `:` (BullMQ's key separator, refused in custom ids), and are keyed on the
  share, not the event.
- States: `SCHEDULED → PENDING → SENT`, or `EXPIRED` at kick-off, or `VOID` when the reminder is
  turned off. A `PENDING` share whose event moves back into the future returns to `SCHEDULED` and
  withdraws its notifications.

### Updates and cancellations

- A prompt is raised **only if something was already sent**; telling the group about a change to
  an event they never heard of is noise.
- « Changed » means **the message would read differently**: `contentKey` (FNV-1a over the sorted
  non-link variables, shared so the browser needs no `node:crypto`) of the current variables versus
  the one recorded at confirm. That covers a moved RDV or drive time from any source and ignores
  notes, logistics and the like for free. A reverted edit voids a pending update. `sentVars` keeps
  the sent values so the card can show what moved.
- RDV changes happen inside `meeting-points/`, which must not import this module, so it publishes
  ids on an in-process `MeetingChangeFeed`, **before** its own 7-day notification filter (the
  WhatsApp window is 14 days).
- **Cancelling an event deletes it**, so a cancellation share can't hang off the event:
  `EventShare.eventId` is nullable (`SetNull`), the row carries `teamId`, an `eventSnapshot` taken
  before the delete and `expiresAt` = the old kick-off. It stays shareable from the team page until
  then.
- The acting manager is included in the update prompt: the bell doubles as their to-do list.

### Analytics

No analytics layer was added. The funnel reads from data already kept: `EventShare` (notified,
nudged, sent, platform) and `EventRsvpChange.via`.

### Open

Members seeing « Envoyé le … », one share per series instead of per occurrence, and a per-team
language are to be decided on beta data.
