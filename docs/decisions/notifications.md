# Notifications and e-mail

Rules live in `CLAUDE.md` (« Mail module », « Notifications module », « Notifications on the
frontend »). This is the reasoning, decided with the product owner.

## Decisions

| Question           | Decision                                                   | Rejected, and why                                                                                                            |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| E-mail delivery    | Brevo behind `MAIL_CLIENT`, a logging client without a key | a log-only stub never sends in prod; raw SMTP contradicts the stack choice                                                   |
| First triggers     | convocation, event cancelled, scoresheet read done/failed  | « new event on my team »: a recurring create writes up to 104 rows and nobody waits for that message                         |
| Unverified address | blocks only authority-granting actions                     | blocking login locks out an invited player who mistyped; blocking nothing lets someone hand club ADMIN to a ghost            |
| Preferences        | one e-mail toggle; push exists per browser subscription    | a type × channel matrix is a large UI and a fan-out check on every send for a handful of types                               |
| Transport          | the feed polls every 60 s                                  | SSE/WebSocket is a connection, a reconnect path and a deploy constraint for latency nobody notices; push covers a closed tab |

## Why the model looks like this

- **One stored sentence, three consumers.** `deepLink` is relative so react-router, an e-mail
  `<a href>` (prefixed from `FRONTEND_URL` per send) and the service worker's `notificationclick`
  all use it, and a domain move never breaks history. `title`/`body` are written once, server side;
  the `type` only picks an icon and must never be used to rebuild copy on the client, or the in-app
  and e-mailed copies drift.
- **The in-app row first, delivery best-effort.** A convocation stored but not e-mailed is
  degraded; one e-mailed but never stored can't be found again; and a bounced address must not roll
  back a call-up a manager made.
- **Push is a property of a browser, e-mail of an account.** The preferences card renders them
  differently on purpose. iOS exposes the Push API only to an installed PWA, so the toggle hides
  (`support: 'unsupported'`) rather than offering a control that would fail.
- **Cancellation goes to the convoked**, not the whole roster: it is only news to someone expecting
  to be there.
- **Jersey wash rotation has two types**, `JERSEY_DUTY_ASSIGNED` and `JERSEY_SWAP_REQUESTED`, sent on assignment only (decision 12): a swap refused or cancelled, a holder cleared and a turn voided notify nobody, and the proposer sees the outcome on the match page. On an accepted swap the **previous holder's** audience is told (the new holder accepted it themself), and the caller never notifies themself.
- **Dates are Europe/Paris** in every copy: there is no per-club timezone, and UTC would print a
  20:30 match as 19:30 for every French reader.
- **Copy for parents** names the child, merges subjects into one message per reader (« Léo et vous
  êtes convoqué·es »), and stays byte-identical for self-only readers (see `guardians.md`).

## Deliberately not built

- Digest or batching: each recipient gets one message about themself, the right unit at this volume.
- Scheduled RSVP reminders to non-responders.
- Deleting or archiving notifications (rows are marked read; retention belongs to the retention
  policy if it is ever needed).
