# Guest RSVP link: Part 3, the manager side

Status: spec (implements Part 3 of [`2026-09-29-guest-rsvp-link-design.md`](./2026-09-29-guest-rsvp-link-design.md))
Date: 2026-09-29

What a team manager sees: the card that turns the link on and off, the « via lien » mark and the
answer history on the event roster, and the landing of the « invite request » notification.

## 1. A correction to the design doc: who is told, and where it lands

The design doc says the team roster « already has the `PlayerInvite` action » and sends the
request to the team's `TeamAdmin`s and the owner club's admins. Neither holds: the invite action
lives only on the **club's** Joueurs tab (`PlayerRow`), and `POST /clubs/:clubId/players/:playerId/invite`
is `ADMIN`-of-`Player.clubId` only. On a CTC team the player's club is not necessarily the owner
club, and a `TeamAdmin` who isn't a club admin cannot issue the invite at all.

So `GuestRsvpService.requestInvite` now notifies the **`ADMIN`s of the player's own club**, the only
people who can act, with the deep link `/clubs/<player.clubId>/members?tab=players&invite=<playerId>`.
Everything else in the rule is unchanged (constant `204`, no notification for a player with an
account or a live invite, one per player per 7 days). A club with no admin gets nobody notified.

## 2. Team settings card: « Lien de réponse sans compte »

`app/src/guest-rsvp/TeamGuestLinkSettings.tsx`, mounted beside `TeamMeetingPointSettings` on
`TeamDetailPage`, `canManageTeam` only.

- Query ladder `error → loading → data`: `GET .../guest-link` answering `null` is valid data (link
  off), not an empty list.
- **Off:** what the link is for, and « Activer le lien ».
- **On:** the URL in a read-only field, « Copier », « Partager » (only where `navigator.share`
  exists), « Générer un nouveau lien » and « Désactiver ». The one-line exposure statement is always
  visible: « Toute personne ayant ce lien voit les prénoms de l'équipe et peut répondre pour
  n'importe quel joueur. »
- Regenerate and disable are each behind a `ConfirmDialog` (« L'ancien lien cessera de fonctionner
  immédiatement. »). Every completed mutation is a `toast()`, as the control that triggered it may
  have changed or closed.

## 3. Event roster: « via lien » and the history

`EventRosterList` (the manager's match roster):

- `EventRosterRow.viaLink` (from `EventRsvpRosterEntry.viaLink`). A soft `Badge` « via lien » beside
  the answer when set.
- The answer badge becomes a button opening `RsvpHistoryDialog` (a read-only `Dialog`, since it is
  infrequent): one line per change, newest first, « Présent · via lien · sam. 14:32 »,
  « Absent · Sophie M. · ven. 20:10 », « Réponse retirée · via lien … », and « via l'appli » when an
  app change has no author left. The fetch is lazy (`enabled` while open), with its own
  `error → loading → empty → data` ladder.

## 4. Invite-request landing

`MembersPage` reads `?invite=<playerId>`: when the player is in the (capped) full player list and
has no account, `PlayerInviteDialog` opens for them. It becomes controllable (`open` /
`onOpenChange`, no trigger when controlled); closing it drops the param. A player past the list cap
or already linked simply opens nothing.

## 5. Tests

Vitest + MSW: card off/on/error, enable, copy, share hidden without `navigator.share`, regenerate
and disable confirm flows (nothing sent until confirmed), the exposure line; the « via lien » badge
and the history dialog (order, wording, ladder); the invite param opening and closing the dialog
and staying shut for a linked player. Jest: recipients and deep link of `requestInvite`.

Screenshots: card off, card on, confirm dialog, roster with badge, history dialog.
