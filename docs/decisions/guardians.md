# Guardians (parents acting for a child)

Rules live in `CLAUDE.md` (« Guardians »). This is the reasoning. Validated canvas:
https://claude.ai/artifact/XamFReY4Va2PeKMVdaRVxR

## Why

Most of a youth roster can't answer for itself: an U11 has no phone and no account, so the coach
chased parents on WhatsApp. RSVP, convocations, the RDV and notifications were all keyed on the
player's own account.

## The scoping decisions (taken with the product owner)

| #   | Decision                                                                                                            | Rejected                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | A separate `PlayerGuardian` link, many-to-many `Player` ↔ `User`                                                    | the parent's account on `Player.userId`: one child per parent per club, and no own account later |
| 2   | Being a parent is **derived** from a link, not a role                                                               | `ClubRole.GUARDIAN`: a membership is unique per user and club, and parents also play or coach    |
| 3   | A parent who is nothing else gets **no membership**; the link opens the child's team pages and nothing else         | `MEMBER`: they would see the whole club's member list                                            |
| 4   | An admin generates one invite link per parent (SMS, WhatsApp, e-mail)                                               | CSV import, a child inviting a parent, request + approval                                        |
| 5   | 7-day links; at most 4 guardians and 4 live invites per player                                                      |                                                                                                  |
| 6   | Accept by creating an account **or** as the logged-in user                                                          | register-only like `PlayerInvite`                                                                |
| 7   | Accepting for a minor includes the parent's consent (`GUARDIAN_IN_APP`); staff attestation stays as fallback        | staff attestation only                                                                           |
| 8   | Child and parents may all answer; last answer wins and shows its author (« Répondu par Sophie M. »)                 | parent-only while minor, child-only once they have an account                                    |
| 9   | A parent can: RSVP, travel mode, receive notifications, see team stats, edit the child's name/birth date/gender     | MVP vote, jerseys/balls, scoresheet upload, anything a manager does                              |
| 10  | The child's account and every guardian are notified, each with their own preferences, one merged message per reader | parents only while minor; per-child opt-in                                                       |
| 11  | A persona switcher (« Moi », Léo, Emma), hidden with one persona                                                    | all children merged on one screen                                                                |
| 12  | « Moi » is a persona like the children                                                                              |                                                                                                  |
| 13  | At 18 the link stays; the adult can remove a parent, an admin can always unlink, a parent can stop following        | automatic cut on the birthday                                                                    |
| 14  | No relationship label; a respondent is first name + last initial                                                    | « maman / papa »: more data, more ways to be wrong, no feature needs it                          |
| 15  | Later volunteer duties go **per child**, taken by any of its guardians; no `Family` table                           | per household                                                                                    |
| 16  | Separated parents: both linked, no household concept                                                                | two households per child                                                                         |
| 17  | A guardian sees co-guardians' **names** only, never e-mails                                                         |                                                                                                  |

Defaults chosen without asking (reversible): TTL 7 days, caps of 4, « minor » = `isMinorBirthDate`,
admins only invite, `pendingCount` window 14 days, re-accepting one's own accepted link is a success.

## Consequences worth knowing

- `@AllowGuardians()` opens only the reads a rostered member has plus the RSVP and travel-mode
  writes. It deliberately does **not** open the club's team list, the team admins list (it carries
  coaches' e-mails, decision 17), member or player lists, votes, logistics, uploads or retries.
- `resolveActingTeamPlayer` distinguishes « may not act for this player » (403) from « this child
  is not on this team » (behaves as not rostered).
- `GuardianInvite` is not `PlayerInvite` with a flag: that one is one-per-player and claims
  `Player.userId`; a guardian invite is one-per-parent and claims nothing.
- Accepting runs in one transaction; the consent rule is checked before registering so a refused
  consent never leaves an orphan account. A user can't be their own parent.
- `respondedByUserId` is the caller, never the persona. A travel-mode change is not a new answer
  and leaves it alone.
- Notification copy goes through `subjectLabel` / `convocationSentence` / `forWhomPrefix`; a
  parent's deep link uses the child's club and `?pour=<playerId>`.
- Persona is the last segment of each persona-scoped query key so prefix invalidations still match
  every persona, and switching never shows one persona's cached answer under another's name.
- A minor can't remove their own parents; a minor sees « Tes parents peuvent répondre pour toi. ».

## Out of scope

A parent voting, taking logistics or uploading; a coach answering for a player; CSV or child-sent
invites; relationship labels; households; the volunteer rota; RGPD under-15 age gating of a child's
own account; consent withdrawal.
