---
name: privacy-review
description: RGPD and privacy review for Kluvo changes that touch personal data, minors, authentication, the audit log, notifications, public links, exports or the back-office. Use before opening a PR on such a change, when reviewing one, or when asked whether something is safe to show, store, log or send.
---

# Privacy review

Kluvo holds minors' data for French clubs. These are the questions past features had to answer;
each one was a real bug or a near miss. Background: `docs/decisions/rgpd-and-backoffice.md`,
`docs/decisions/guardians.md`, `docs/decisions/guest-rsvp-and-whatsapp.md`.

## What is shown, and to whom

- [ ] A person shown to peers is « Prénom N. ». Full names only where the audience already manages
      that person. No relationship labels (« maman »).
- [ ] Redaction is decided **on the server**. A field the client hides is still in the network tab.
- [ ] Parents see co-guardians' names, never their e-mails. Routes carrying e-mails (team admins
      list) are not opened to `@AllowGuardians()`.
- [ ] Votes: who voted for whom is never selected into any response or export. « Joueur en
      difficulté » appears only in the match page's vote section, never on a home, list, summary or
      notification.
- [ ] A public payload (guest link) carries nothing beyond first name + initial and the event facts,
      and no `isMe` (the server doesn't know who the visitor is).

## Oracles

- [ ] A public or low-privilege endpoint answers the same whether or not an account or address
      exists (password reset, guest `invite-request`: constant 204). The UI copy keeps the promise.
- [ ] Search is a read: a substring search lets names be rebuilt from result counts. Low-privilege
      search is exact-match only.
- [ ] Unknown tokens, regenerated links and disabled links are the same plain 404.
- [ ] Ordering doesn't leak what redaction hides (sort redacted lists by date, not name).

## Storing

- [ ] Link tokens are `randomBytes(32)`, stored hashed (`hashToken`) unless a manager must re-copy
      them (the guest link is the one documented exception, with regenerate as the kill switch).
- [ ] No IP or user agent stored for unauthenticated visitors.
- [ ] Secrets at rest are encrypted with their own key, bound to the row (TOTP pattern).
- [ ] A new table with personal data has a retention answer: cascades with the account, or a sweep
      step, or a documented legal reason to outlive it (`ParentalConsent`, `AuditLog`).
- [ ] Erasing an account keeps the club's history: detach (`Player.userId = null`), don't delete
      roster rows or stats.
- [ ] Something that must survive its subject snapshots what it needs to stay readable
      (`actorEmail`, consent identity, notification `title`/`body`, cancellation share snapshot).

## Logging and audit

- [ ] `AuditLog` is authentication and access-granting activity only (login, tokens, guardian links,
      guest link on/off, back-office). An RSVP or a roster edit is not audited there.
- [ ] Every back-office read that shows a `DATA_OFFICER` people's names is audited; lists write one
      row per page listing the ids shown. Detail queries don't refetch on focus (each fetch is a row).
- [ ] Back-office writes: a reason (10–500 chars) and one audit row in the same transaction.
- [ ] Disclosures (view, export, impersonation) have their own audit type; don't fold them together.

## Minors and consent

- [ ] `isMinorBirthDate` decides minority, shared by form and API. Unknown birth date requires no
      consent (a consent record snapshots the birth date).
- [ ] Interactive creation of a minor needs consent; bulk imports don't block on it but surface
      « autorisation manquante ».
- [ ] Consent source is truthful: `STAFF_ATTESTATION`, `GUARDIAN_IN_APP` or `PLATFORM_STAFF`.

## Sending

- [ ] Notifications: in-app row first, delivery best-effort; parents get the child's copy; the
      `deepLink` is relative.
- [ ] Nothing about a person is sent to a third party that isn't EU-hosted or already chosen
      (Brevo, R2 EU bucket, ORS gets gym addresses only).
- [ ] Public pages send `noindex` and `Referrer-Policy: no-referrer` so tokens don't leak.

## Exports (art. 15)

- [ ] A new table holding someone's data is added to the RGPD export, unless it would disclose
      someone else (art. 15(4)): then it is omitted and the omission is named in the bundle's
      `notice`.

## Impersonation

- [ ] New `GET` handlers write nothing user-owned. Anything that reveals a secret of the subject
      (their vote) is masked when `user.impersonation` is set.

Record any new decision in the matching `docs/decisions/` file in the same PR.
