# Match meeting point: Part 3, frontend (club and team settings)

Status: spec (implements Part 3 of [`2026-09-27-match-meeting-point-design.md`](./2026-09-27-match-meeting-point-design.md))
Date: 2026-09-27

> **Revised after design validation** (Claude Design canvas:
> https://claude.ai/artifact/BxNfwfDZ5jHYqNXgZYQJNF). The card now shows the name, the address
> and the buffer on separate lines, with « du club » / « propre à l'équipe » badges in team scope.
> With no meeting point it is a dashed `Card variant="placeholder"` with « Définir ». In team
> scope, the dialog's checkboxes became radio cards (« Celui du club » / « Un lieu propre à
> l'équipe », « Celle du club » / « Propre à l'équipe »). The club dialog gains « Supprimer le
> RDV ».

A club admin sets the club's default meeting point and arrival buffer. A team manager sees what
the team inherits and can override either. Both screens call the Part 1 endpoints:
`GET|PATCH /clubs/:clubId/meeting-settings` and
`GET|PATCH /clubs/:clubId/teams/:teamId/meeting-settings`.

## Where it shows

| Screen                            | Who                               | Placement                                                            |
| --------------------------------- | --------------------------------- | -------------------------------------------------------------------- |
| `MembersPage` (club « Effectif ») | club `ADMIN`                      | Under the FFBB link control, like the other club-level setting there |
| `TeamDetailPage`                  | team manager (`useIsTeamManager`) | Under `TeamFfbbLinkList`, above the tabs                             |

Players never see the settings, only their effect on a match (Part 4).

## Components (`app/src/meeting-points/`)

A new folder rather than `clubs/`, which already holds ~150 files. The feature spans club, team
and event, so it doesn't belong to any one of them.

- **`MeetingPointSettingsCard`**: one component with `scope: 'club' | 'team'`, not a club/team
  twin pair. It renders a `Card` (`variant="inset"`) with a `SectionHeading`-free one-liner:
  - Place: « Parking salle Coubertin · 12 rue …, Nantes », or « Aucun point de rendez-vous ».
  - Buffer: « Arrivée 45 min avant le match ».
  - Team scope: each value is suffixed « (club) » when inherited, so a manager can tell an
    override from the default.
  - A « Modifier » button (« Définir » when nothing is set) opens the dialog.
  - Query ladder `error → loading → empty/data`. The error branch is a compact `QueryError`
    with retry; loading is a one-line skeleton. There is no empty state beyond the
    « Aucun point… » copy, since "no setting" is valid data, not an empty list.
- **`MeetingPointSettingsDialog`**: the blessed `Dialog`, since this is a multi-field,
  infrequent edit (CLAUDE.md "Modals vs. inline editing"):
  - `FormField` « Nom du lieu » (max 80) and `FormField` « Adresse » (max 200). Both empty means
    "no meeting point". Exactly one filled gives a `FieldError` under the empty one:
    « Renseignez le nom et l'adresse ».
  - `FormField` « Arrivée avant le match (minutes) », `type="number"`, 0–180, with the hint
    « Les joueurs qui viennent directement arrivent à cette heure-là. »
  - Team scope only: two `Checkbox`es, « Utiliser le point de rendez-vous du club (…) » and
    « Utiliser le délai du club (45 min) ». When checked, the field they govern is hidden and
    sends `null`. They default to checked when the team has no override.
  - Submit: « Enregistrer ». Success gives a `toast` « Point de rendez-vous enregistré » and
    closes the dialog. A server error shows an `Alert` inside the still-open dialog, same as
    `TeamEditModal`: the form that caused it is still on screen.
  - A hint under the address: « L'adresse sert à calculer le temps de trajet vers chaque
    match. » That tells the manager why it has to be a real address rather than « le parking ».

## Hooks

- `useClubMeetingSettings(clubId)` and `useTeamMeetingSettings(clubId, teamId)`.
- `useClubMeetingSettingsUpdate(clubId)` and `useTeamMeetingSettingsUpdate(clubId, teamId)`:
  write the response into the settings query, then invalidate the affected events:
  - club: prefix `['clubs', clubId, 'teams']` (every team's events and settings under the club)
  - team: `teamEventsQueryKey(clubId, teamId)` prefix and the team's settings
- New query keys in `clubs/queryKeys.ts`: `clubMeetingSettingsQueryKey` and
  `teamMeetingSettingsQueryKey`.

## Tests (Vitest + RTL, colocated)

- `MeetingPointSettingsCard.test.tsx`:
  - Club: renders the place and buffer. « Aucun point » gives « Définir ». The error branch
    shows a retry, never « Aucun ».
  - Team: the « (club) » suffix appears for inherited values.
- `MeetingPointSettingsDialog.test.tsx`:
  - The half-filled validation.
  - Club save sends `{ meetingPoint, arrivalBufferMinutes }`.
  - Team: checked boxes send `null`; unchecking reveals the fields.
  - The server error shows an `Alert`.
- Hook tests: the update hook writes the query cache and invalidates the events.

## Screenshots

Using `pnpm mock-api` plus a new committed fixture,
`scripts/fixtures/meeting-point-settings.json`, which extends the admin session bootstrap
fixture:

- The club card, and its dialog open.
- The team card with inherited values, and its dialog with the fields revealed.
