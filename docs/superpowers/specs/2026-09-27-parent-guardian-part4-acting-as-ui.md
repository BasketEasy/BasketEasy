# Parents (guardians): Part 4, frontend (acting as)

Status: spec (implements Part 4 of [`2026-09-27-parent-guardian-design.md`](./2026-09-27-parent-guardian-design.md))
Date: 2026-09-27

Builds on Parts 1–3: the API accepts `forPlayerId` and reports who answered, notifications carry
`subjectFirstName`, and `usePersonas()` exists. This part makes the whole logged-in app act for
the chosen persona, and ends with the `CLAUDE.md` « Guardians » section.

## 1. Persona state: `ActingAsProvider`

`app/src/guardians/ActingAsContext.tsx`, mounted inside `ActiveClubProvider` in `ProtectedRoute`.

```ts
interface ActingAs {
  forPlayerId: string | null; // null = « Moi »
  persona: ChildPersona | null; // the child being acted for, when there is one
  personas: MyPersonas | undefined;
  setForPlayerId(id: string | null): void;
}
```

- Initial value, in order: `?pour=<playerId>` on the current URL (then removed with
  `replace: true`), the last choice for this user in `localStorage`
  (`kluvo.actingAs.<userId>`, every access in try/catch), else « Moi », else, for a guardian-only
  user (`personas.self === null`), the first child.
- An id that isn't among `personas.children` (link removed, stale storage) falls back by the same
  rule. Every later `?pour=` navigation (a notification click while the app is open) switches too.
- `useActingAs()` hook; `useForPlayerParams()` returns `{ forPlayerId }` or `{}` for spreading
  into request params.

## 2. Persona in every « me » query

Each hook that reads or writes the caller's own answer takes the persona from `useActingAs()`,
sends `forPlayerId`, and puts it in its **query key**, so switching never reuses the other
persona's cache:

- `useEventList`, `useEventShow`, `useMyAgenda` (dashboard), `useMyTeamList`,
  `useTeamSeasonStats`, `useEventRsvps`, `useEventConvocations`.
- The RSVP and travel-mode mutations send `?forPlayerId=`; their `setQueryData`/invalidation
  target the persona-keyed entries.

Query keys gain a trailing `{ forPlayerId }` segment (`actingAsKeyPart`), placed last so every
existing prefix invalidation (`teamEventsQueryKeyPrefix`, `myDashboardQueryKeyPrefix`) still
matches both personas.

Votes, logistics and scoresheet controls are hidden while acting for a child (decision 9): the
player view checks `forPlayerId !== null`.

## 3. Switcher, sheet and banner

- `DialogContent` gains `variant="sheet"` (`@basketeasy/ui/dialog`): bottom-anchored, full
  width, `rounded-t-2xl`, same focus trap and close button. No second modal primitive.
- `PersonaSwitcher` (`app/src/guardians/`): a chip with `Avatar` initials, the persona's first
  name (« Moi » for self) and a chevron, plus a `CountBadge` summing the **other** personas'
  `pendingCount`; the accessible name spells it (« Changer de profil (2 réponses en attente) »).
  Renders `null` with fewer than two personas. Desktop: in `AppHeader` next to the club
  switcher. Mobile: in the compact top bar, left of `NotificationBellLink`.
- The sheet lists personas as a `RadioCardGroup` (avatar, name, club/team line, « 2 à
  répondre »); choosing one closes the sheet and switches.
- `ActingAsBanner`: « Vous répondez pour **Léo Martin** · Changer » (`Changer` opens the same
  sheet), mounted in `ProtectedRoute` beside `EmailVerificationBanner`; renders nothing on « Moi ».
- `AppBottomNav` labels follow the persona: « Ma semaine » / « Mon équipe » on « Moi »,
  « Semaine » / « Son équipe » for a child.

## 4. Screens

- **Dashboard / event page**: unchanged components fed by the persona. `EventRsvpControl` takes
  an optional `subjectFirstName`: heading « Léo sera là ? » instead of « Serez-vous là ? », and
  under the buttons a respondent line from `myRsvpRespondedBy`/`At`: « Répondu par vous · jeu.
  19:12 » or « Répondu par Sophie M. · jeu. 19:12 » (`Text variant="meta"`). The existing
  « Touchez à nouveau… » hint stays.
- A guardian-only user's `/dashboard` opens on the child (§1), so the landing page is never
  empty for them.
- **Notifications**: `NotificationItem` shows `subjectFirstName` as a soft `Badge`
  (`tone="structure"`) before the title.
- **Coach attendance**: `EventRosterList` renders the respondent under a row's status when
  `respondedBy` is someone else than the player: « Sophie M. · parent » when
  `respondedByGuardian`, the name alone otherwise.

## 5. Tests and screenshots

- `ActingAsContext.test.tsx`: `?pour=` wins and is stripped; storage fallback; unknown id falls
  back; guardian-only defaults to the child.
- A hook test: switching persona issues a new request with `forPlayerId` and never renders the
  previous persona's answer (the key differs).
- `PersonaSwitcher.test.tsx`: hidden with one persona, badge sums the others, choosing switches.
- `EventRsvpControl.test.tsx`: heading and respondent line.
- `NotificationItem`/`EventRosterList` tests for the tag and the « parent » line.
- `scripts/fixtures/guardian-parent-session.json`: a playing parent with two children.
  Screenshots at 390 and 1280: dashboard as a child, the sheet, the event page with the
  respondent line, notifications, coach attendance.

## 6. Docs

`CLAUDE.md` gains a « Guardians » section (data model, `@AllowGuardians()`, `forPlayerId`,
fan-out, persona state) and drops « a parent-facing portal » from the retention section's « Not
built yet » line.
