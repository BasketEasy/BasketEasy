# Decision records

One file per domain. Each holds the **why** behind the code: the decisions taken with the product
owner, the alternatives rejected, the external facts that were verified the hard way, and what is
still open. `CLAUDE.md` holds the rules an agent must follow on every change; these files hold the
reasoning you need before changing a domain's behaviour.

| File                                                         | Covers                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [`accounts-and-access.md`](./accounts-and-access.md)         | auth tokens, account security, club/team roles, `TeamAdmin`, e-mail verification gate    |
| [`events.md`](./events.md)                                   | types, recurrence, RSVP, convocations, logistics, jersey wash rotation, MVP vote, venue  |
| [`ffbb.md`](./ffbb.md)                                       | what competitions.ffbb.com really serves, calendar import, venue scraping, poule results |
| [`scoresheets-and-stats.md`](./scoresheets-and-stats.md)     | e-Marque reading rules, R2 storage (and its manual setup), season and match stats        |
| [`meeting-points.md`](./meeting-points.md)                   | RDV formula, route staleness, OpenRouteService, travel choice, RDV notifications         |
| [`notifications.md`](./notifications.md)                     | triggers chosen, delivery model, push vs e-mail preferences                              |
| [`guardians.md`](./guardians.md)                             | parents acting for a child: the 17 scoping decisions, acting-as, fan-out                 |
| [`guest-rsvp-and-whatsapp.md`](./guest-rsvp-and-whatsapp.md) | the shared no-account RSVP link, its threat model, the WhatsApp share reminders          |
| [`rgpd-and-backoffice.md`](./rgpd-and-backoffice.md)         | retention rules and their legal basis, RGPD export, back-office, impersonation threats   |
| [`../personas.md`](../personas.md)                           | who uses Kluvo, the weekly loop, why the app is player-first                             |

## Keeping them useful

- A feature PR that takes or reverses a decision updates the matching file **in the same diff**.
  The per-feature plan that led there is not kept in the repo (see the `plan-feature` skill).
- Write the decision and its reason, not the implementation. File paths and API shapes belong in
  the code; a record that restates the code goes stale the first time the code moves.
- An open question stays in the file's « Open » section until it is answered or dropped.
