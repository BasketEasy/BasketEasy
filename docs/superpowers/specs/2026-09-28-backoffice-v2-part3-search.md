# Back-office v2: Part 3, global search

Status: spec (implements Part 3 of [`2026-09-28-backoffice-browse-stats-actions-design.md`](./2026-09-28-backoffice-browse-stats-actions-design.md))
Date: 2026-09-28
Depends on: [Part 2](./2026-09-28-backoffice-v2-part2-browse-ui.md)

## 1. Design gate

Canvas first: the search box in `AdminShell` (desktop and phone), its grouped dropdown (kind
headings, keyboard highlight, « Voir tous les résultats »), the `/admin/search` page, and the
no-result and « identifiant inconnu » states.

## 2. API

`GET /admin/search?q=` (both roles), type `AdminSearchResult` in
`@basketeasy/types/platform-admin-search`:

```ts
export interface AdminSearchHit {
  kind: 'club' | 'team' | 'user' | 'player' | 'event';
  id: string;
  label: string;
  sublabel: string | null;
}
export interface AdminSearchResult {
  query: string;
  exactId: AdminSearchHit | null;
  groups: Record<AdminSearchHit['kind'], AdminSearchHit[]>;
}
```

- `q` trimmed, 2–100 characters (400 otherwise).
- UUID (`isUUID` v4): `findUnique` on `club`, `team`, `user`, `player`, `event` in parallel; the one
  that matches becomes `exactId`, groups stay empty.
- Otherwise, up to 5 per kind, in parallel:
  - clubs: name `contains` or FFBB code equals;
  - teams: name `contains` (sublabel: owner club);
  - users and players: Part 1's `peopleSearchWhere(role, q)`, labels through `userRef`/`playerRef`, so
    `SUPPORT` sees initials; sublabel: e-mail domain / club name;
  - events: never matched by text (too many, and a label is not identifying).
- Not audited (lists aren't), and a `DATA_OFFICER` substring search returns refs, not details.

## 3. Frontend

- `AdminSearchBox` in `AdminShell`: `Input` + a listbox popover (`role="combobox"` /
  `aria-activedescendant`, arrow keys, Enter, Escape), 300 ms debounce, minimum 2 characters.
  Enter on an `exactId` navigates straight to that record; Enter otherwise opens `/admin/search?q=`.
- `/admin/search?q=`: the same groups with a « voir la liste » link per kind into the Part 2 list
  pre-filtered with `q`.
- Query key `['admin', 'search', q]`, `staleTime` 30 s.

## 4. Tests

Service: UUID found in each table; unknown UUID → `exactId: null`; `SUPPORT` e-mail-only rule;
the 5-per-kind cap. Component: keyboard navigation, exact-id redirect, debounce.
