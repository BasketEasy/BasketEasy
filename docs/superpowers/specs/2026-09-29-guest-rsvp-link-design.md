# Guest RSVP link (« Lien de réponse sans compte »)

Status: draft (loop 0)
Date: 2026-09-29

## Why

Some players never create an account, not on SportEasy (the tool Kluvo is replacing) and not on
Kluvo either. Today a roster entry without an account (`Player.userId = null`) can't answer an
event at all, so the coach falls back to counting thumbs in the WhatsApp group, and the RSVP,
convocation and meeting-point features stop working for exactly the players the coach worries
about most.

This spec adds one shareable link per team. Anyone who opens it picks their name from the roster
and says whether they're coming, and for a match whether they'll meet at the RDV or go straight
to the gym. No sign-in, no account, no e-mail.

The data model already fits: `EventRsvp` is keyed on the roster slot (`teamPlayerId`), not on a
`User`, so a guest answer lands on the same row an app answer does. There is no parallel "guest
RSVP" table, and counts, convocations and travel counts keep working unchanged.

## Decisions (validated with the product owner, 2026-09-29)

| #   | Question                                           | Decision                                                                                                                                                                                                 |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | How a visitor says who they are                    | **One shared link per team**, the visitor picks their name from the roster.                                                                                                                              |
| 2   | What the link opens                                | **A team page listing upcoming events**, one permanent link to post once and pin.                                                                                                                        |
| 3   | Non-roster visitors (trialists, new players)       | **Roster only.** The coach adds them to the roster first (no account needed).                                                                                                                            |
| 4   | What a guest can do                                | RSVP (`GOING`/`NOT_GOING`/`MAYBE`), travel mode on a match, see event details (time, place, opponent, RDV), **see who's coming**.                                                                        |
| 5   | A player who has an account (or a linked guardian) | **Allowed**, and the answer is tagged « via lien » for the coach. Nobody is blocked.                                                                                                                     |
| 6   | Names on the public page                           | **First name + last initial** (« Léo M. »), the same rule as `EventRsvpRespondent`.                                                                                                                      |
| 7   | Link control                                       | **Enable/disable per team** (off by default), **regenerate** (kills the old URL), **answer history** for the coach. No automatic season-end expiry.                                                      |
| 8   | Convocations                                       | **Shown**: a « Convoqué » badge on the guest's own match plus the call-up list. A guest gets no notifications, so this is the only way they learn it.                                                    |
| 9   | Account nudge                                      | **Soft, never blocking**, listing what an account unlocks: notifications, season stats, MVP votes, results and scoresheets.                                                                              |
| 10  | Turning a guest into an account                    | **Existing `PlayerInvite` flow only.** The nudge asks the coach for a personal invite. There is no new claim mechanism, so someone holding the shared link can never take over a teammate's roster slot. |
| 11  | Event window                                       | **Next 14 days**, answerable **until kickoff**, then the event drops off the page.                                                                                                                       |
| 12  | Remember me                                        | The chosen name is kept on the device (localStorage), with a « Ce n'est pas moi ? » reset.                                                                                                               |

## Scope

**In scope:**

- Team managers (`TeamManagerGuard`) can enable, copy, regenerate and disable the team's guest link.
- A public page `/r/:token` showing the team, the roster picker and the events of the next 14 days,
  with RSVP, travel mode, convocation badge and list, RDV, and the attendance breakdown.
- Writing and clearing an RSVP and a travel mode for any roster member through the link.
- A source flag on `EventRsvp` (« via lien ») and an append-only answer history, visible to managers.
- An « invite request » from the nudge, sent to the team's managers as an in-app notification.
- Audit rows for enabling, regenerating and disabling a link.

**Out of scope (don't build speculatively):**

- Per-player personal links. Decision 1 picks the shared link, and `PlayerInvite` already covers "a
  link that is only mine".
- Notifications to guests (e-mail, SMS, push). A guest has no address in the system. Getting one
  is exactly what creating an account is for.
- Votes, stats, results and scoresheets on the guest page. These are the nudge's selling points
  (decision 9) and stay account-only.
- Answering for someone who isn't on the roster (decision 3).
- Automatic expiry. The coach regenerates the link at the start of a season if they want a clean cut.
- An RSVP deadline other than kickoff.
- Platform back-office views of guest links.

## Threat model, stated plainly

The link is a **bearer credential for a WhatsApp group**. Anyone holding it can:

- read the team's roster as first name + last initial, the next 14 days of events (place, time,
  opponent, RDV) and who's coming or convoked;
- set or clear **any** roster member's answer and travel mode for those events.

That is the product owner's accepted trade-off (decision 1). The mitigations are about **detecting
and stopping** misuse rather than preventing it:

- Every guest-sourced answer is tagged « via lien », and the history shows every change with its
  time and source (decision 7). A teammate flipping someone else's answer is visible.
- **Regenerate** kills the leaked URL at once. **Disable** removes the surface entirely.
- A per-token + per-IP rate limit on writes (see Backend) bounds a script.
- Nothing more sensitive than decision 6's names is served: no birth dates, no last names, no
  licence numbers, no player ids other than the opaque `teamPlayerId` the picker needs.
- The page sends `noindex` and `Referrer-Policy: no-referrer` so the token doesn't leak through
  search engines or outbound links (the RDV map link, for example).

Accepted limitation: an RSVP given through the link by someone other than the player **cannot be
told apart** from one the player gave themself. The history makes it reviewable, not preventable.

## Data model (Prisma)

```prisma
// One shareable RSVP link per team — see
// docs/superpowers/specs/2026-09-29-guest-rsvp-link-design.md. No row means
// the link is off. Regenerating replaces `token`; disabling deletes the row.
model TeamGuestLink {
  teamId          String   @id
  // Stored in clear, unlike PlayerInvite/PasswordResetToken: the whole point
  // of this link is that a manager re-copies it any time (a pinned WhatsApp
  // message, a new group). It grants less than any session, and regenerating
  // is the kill switch. 32 random bytes, base64url.
  token           String   @unique
  createdByUserId String?
  createdAt       DateTime @default(now())
  team            Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  createdBy       User?    @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)
}

enum EventRsvpSource {
  APP
  GUEST_LINK
}

model EventRsvp {
  // … existing fields …
  // How the current answer was given. GUEST_LINK rows have respondedByUserId
  // null: an anonymous link carries no author, even if the person holds an
  // account.
  source EventRsvpSource @default(APP)
}

// Append-only log of every RSVP / travel-mode change, from any source — the
// history a manager reads to spot someone answering for others through the
// shared link. Cascades with its event and roster slot, like EventRsvp.
model EventRsvpChange {
  id                String           @id @default(uuid())
  eventId           String
  teamPlayerId      String
  // Null when the answer was cleared.
  status            EventRsvpStatus?
  travelMode        EventTravelMode?
  source            EventRsvpSource
  respondedByUserId String?
  createdAt         DateTime         @default(now())
  event             Event            @relation(fields: [eventId], references: [id], onDelete: Cascade)
  teamPlayer        TeamPlayer       @relation(fields: [teamPlayerId], references: [id], onDelete: Cascade)
  respondedBy       User?            @relation(fields: [respondedByUserId], references: [id], onDelete: SetNull)

  @@index([eventId, teamPlayerId, createdAt])
}
```

- **`token` in clear is a deliberate break** from the hash-only rule of `PlayerInvite`,
  `EmailVerificationToken` and `PasswordResetToken`. Those are single-use links sent to one person,
  and a manager never needs to see them again. This one is posted and re-posted. Hashing it would
  mean a new URL every time a coach opens the settings card, which amounts to regenerating on every
  view.
- **History is written for app answers too**, not only guest ones. Otherwise « who changed Léo's
  answer » would have holes exactly where the coach needs the full picture (an app answer followed
  by a link answer, then another app answer).
- **No IP or user-agent is stored.** It would be personal data about an unauthenticated visitor, for
  a signal the history already gives. The rate limiter's IP key lives in memory only.
- `EventRsvpChange` is **not** `AuditLog`. `AuditLog` is authentication and access-granting activity
  only (CLAUDE.md), and an RSVP is neither.
- `AuditEventType` gains `GUEST_LINK_ENABLED`, `GUEST_LINK_REGENERATED` and `GUEST_LINK_DISABLED`
  (actor as `userId`, team in `metadata.teamId`). Turning the link on **is** access-granting: it
  opens roster names to anyone with the URL.
- `NotificationType` gains `GUEST_INVITE_REQUESTED`.

## Backend

New module `server/src/guest-links`, which queries `PrismaService` directly (the cross-module
convention of Events, Dashboard and Team stats) and reuses `resolveMeetingPlan` from
`meeting-points/` for the RDV.

### Manager routes (`clubs/:clubId/teams/:teamId/guest-link`, `JwtAuthGuard` + `TeamManagerGuard`)

| Method   | Route                                             | Effect                                                                                                                 |
| -------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `.../guest-link`                                  | `{ url: string } \| null`. The URL is absolute, built from `FRONTEND_URL` the same way `MailService.absoluteUrl` does. |
| `POST`   | `.../guest-link`                                  | Enables the link (idempotent: returns the existing one if already on) and writes `GUEST_LINK_ENABLED`.                 |
| `POST`   | `.../guest-link/regenerate`                       | Replaces the token and writes `GUEST_LINK_REGENERATED`. The old URL 404s immediately.                                  |
| `DELETE` | `.../guest-link`                                  | Deletes the row and writes `GUEST_LINK_DISABLED`.                                                                      |
| `GET`    | `.../events/:eventId/rsvps/:teamPlayerId/history` | `EventRsvpChange[]`, newest first. Manager-only: the audience that can act on it.                                      |

Re-enabling after a disable issues a **new** token. A disabled link must stay dead, and a coach who
turns it off because it leaked must not bring the same URL back by turning it on again.

### Public routes (`public/guest/:token`, no `JwtAuthGuard`)

A `GuestLinkGuard` resolves `:token` to a team and puts it on the request. An unknown, regenerated
or disabled token is always a plain **404**, so a request never reveals whether a link existed.

| Method   | Route                                           | Body / response                                                                                                                                                     |
| -------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `.../:token`                                    | `GuestTeamPage`: team name, club name (the owner club), `roster: GuestRosterMember[]` (`teamPlayerId`, `firstName`, `lastInitial`, `role`), `events: GuestEvent[]`. |
| `PUT`    | `.../:token/events/:eventId/rsvp`               | `{ teamPlayerId, status, travelMode? }` → the updated `GuestEvent`.                                                                                                 |
| `DELETE` | `.../:token/events/:eventId/rsvp?teamPlayerId=` | Clears the answer → the updated `GuestEvent`.                                                                                                                       |
| `POST`   | `.../:token/invite-request`                     | `{ teamPlayerId }` → always `204`.                                                                                                                                  |

`GuestEvent` carries: `id`, `type`, `startsAt`, `location`, `opponentName`, `venue`, `notes`,
`meetingPlan` (as on `TeamEvent`), and `attendance`: one entry per roster member (`teamPlayerId`,
`status`, `travelMode`, `convoked`, `viaLink`). The visitor's own row is picked **client-side**
from the remembered `teamPlayerId`. The server doesn't know who the visitor is, and pretending
otherwise (an `isMe` on a public payload) would be a lie.

Rules:

- **Window:** only events with `now < startsAt <= now + 14 days`. A write on any other event, or on
  a started event, is `409 GUEST_RSVP_CLOSED`. The same "hide what you can't answer" rule applies
  to reads.
- **Roster check:** `teamPlayerId` must be on this team's roster, otherwise `400`. It's the same
  check `setEventConvocations` makes.
- **Travel mode** is accepted only with `GOING` on a `MATCH`. It resets the same way as in the app
  (the existing `EventRsvp` rule, reused rather than re-implemented).
- **Write shape:** an upsert of `EventRsvp` with `source: GUEST_LINK` and `respondedByUserId: null`,
  plus one `EventRsvpChange` row, in one transaction. The app's RSVP and travel-mode writes gain the
  same `EventRsvpChange` insert with `source: APP`.
- **No notifications fire** on a guest answer, because an app answer fires none either.
- **Rate limit:** 30 writes per 10 minutes per token + IP, and 300 per hour per token, in memory per
  instance (the `LastActiveInterceptor` shape, no Redis dependency). A breach is `429`. The limit
  is generous for a family answering for three kids and tight for a script.
- **`invite-request`:** notifies every `TeamAdmin` of the team plus the `ADMIN`s of the owner club:
  « Léo M. demande un lien d'invitation Kluvo », deep link to the roster. It does nothing (and
  still answers 204) when the player already has an account, already has a live `PlayerInvite`, or
  already requested one in the last 7 days. The constant 204 means the link can't be used to find
  out which teammates have accounts.
- **Impersonation:** public routes aren't behind `JwtAuthGuard`, so they aren't reachable as an
  impersonated user either. The manager routes are writes, and impersonation already refuses those.

### Read-side changes to existing endpoints

- `EventRsvpRosterEntry` gains `viaLink: boolean` (`source === GUEST_LINK`). `respondedBy` is null
  for those rows, as for any unknown author.
- `TeamEvent.myRsvpStatus` is unchanged. A player with an account sees an answer given through the
  link as their own, because it is.

## Frontend

### Guest page: `/r/:token` (`app/src/guest-rsvp/`)

- A top-level route beside `/invite/:token`, outside both `PublicOnlyRoute` and `ProtectedRoute`: a
  logged-in visitor opening the link sees the guest page, not a redirect. It is lazy-loaded.
- Mobile-first, one column, no `AppHeader` or bottom nav. The Kluvo wordmark sits at the top, then
  the team and club name.
- **Step 1, « Qui êtes-vous ? »:** a `RadioCardGroup` of roster names (« Léo M. »), coaches listed
  after players. Two players with the same first name and initial are both shown. The coach can
  rename one on the roster if that confuses people, and it isn't worth a disambiguation rule in v1.
  The choice is saved to localStorage under the token (a convenience only, wrapped in try/catch
  like `ActingAsProvider`'s).
- **Step 2, the agenda:** « Léo M. · Ce n'est pas moi ? » at the top, then one card per event in
  the Parquet event-card style: a time block, type, opponent, place, and on a match the RDV via the
  same `EventMatchTimeline` the app uses. For each event:
  - three RSVP buttons, filled by answer, like the app;
  - on a match answered `GOING`, `EventTravelModeControl` (« Au RDV » / « Direct au gymnase »);
  - a « Convoqué » badge when the chosen player is convoked, and the call-up list;
  - an expandable « Qui vient ? » showing counts plus names grouped by answer (decision 4). It reuses
    `countEventRoster`.
- **Query branches:** error → loading → empty (« Aucun événement dans les 14 prochains jours ») →
  data. A 404 renders a dead-link state: « Ce lien n'est plus actif. Demandez le nouveau lien à
  votre coach. »
- **Feedback:** a successful answer updates the button state in place. A failure gets a `toast()`.
  A `409 GUEST_RSVP_CLOSED` gets a toast plus a refetch, so the event disappears.
- **Nudge** (decision 9): a `Card` shown after the first answer in a session, dismissible, and never
  a modal or a gate. Proposed copy:

  > **Allez plus loin avec un compte Kluvo**
  > Soyez prévenu·e de vos convocations et de l'heure du RDV, suivez vos statistiques de la
  > saison, votez pour le joueur du match et retrouvez les résultats et feuilles de match.
  > [Demander mon invitation] · [J'ai déjà un compte]

  « Demander mon invitation » calls `invite-request` and then always shows « Demande envoyée à
  votre coach ». « J'ai déjà un compte » links to `/login`.

### Manager side

- **Team settings (`TeamDetailPage`):** a card « Lien de réponse sans compte ».
  - Off: an explanation and an « Activer le lien » button.
  - On: the URL, « Copier », « Partager » (`navigator.share` where it exists), « Générer un nouveau
    lien » and « Désactiver ». Regenerate and disable each get a `Dialog` confirm, since both are
    destructive (they break the link already in the WhatsApp group). The copy says so: « L'ancien
    lien cessera de fonctionner immédiatement. »
  - The card states what the link exposes, in one line: « Toute personne ayant ce lien voit les
    prénoms de l'équipe et peut répondre pour n'importe quel joueur. »
- **RSVP breakdown (event page, coach view):** a soft `Badge` « via lien » on `viaLink` rows. Tapping
  a row's answer opens the history (a `Dialog`, since it's read-only and infrequent): « Présent · via
  lien · sam. 14:32 », « Absent · Sophie M. · ven. 20:10 ».
- The team roster already has the `PlayerInvite` action. The `GUEST_INVITE_REQUESTED` notification
  deep-links there.

## Shared types

A new subpath `@basketeasy/types/guest-links` (`guest-links.ts` plus an `exports` entry):
`GuestTeamPage`, `GuestRosterMember`, `GuestEvent`, `GuestAttendanceEntry`, `GuestRsvpRequest`,
`TeamGuestLinkInfo`, `EventRsvpChangeEntry`, and `GUEST_RSVP_CLOSED_CODE`. `events.ts` gains
`viaLink` on `EventRsvpRosterEntry`.

## Tests

- Unit tests: the window rule (before kickoff, 14 days), the roster check, travel mode only on
  `GOING` + `MATCH`, the 404 for an unknown or regenerated token, a new token after disable →
  enable, `invite-request` answering 204 in every branch but only notifying in the right one, and
  history rows written by both sources.
- `test/db`: the `EventRsvp` upsert and the `EventRsvpChange` insert in one transaction, and the
  cascades from `Event`/`TeamPlayer` removing history.
- Frontend: the picker persisting to storage, « Ce n'est pas moi ? » clearing it, the dead-link
  state, the query ladder, and the nudge's constant confirmation.

## Rollout, in parts

1. **Backend:** schema and migration, manager routes, public routes, history, audit, `viaLink`.
2. **Guest page:** `/r/:token`.
3. **Manager UI:** the settings card, the « via lien » badge, the history dialog, and the
   notification deep link.

This touches `server/prisma`, so `pr-scope.yml` applies: every PR description names the behaviour
change.

## Open points to confirm at review

- **Clear-text token** (Data model). The alternative is to hash it and show it once, which in
  practice forces a regenerate every time a coach wants to re-share the link.
- **The 14-day window** for teams that train three times a week: that's about 8 cards, fine on a
  phone. A « Voir plus » is deferred.
