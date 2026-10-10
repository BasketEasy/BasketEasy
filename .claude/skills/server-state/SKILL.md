---
name: server-state
description: Checklist for adding or changing a TanStack Query hook or mutation in Kluvo's app - freshness tier, key builder, enabled gate, response into the cache, the dependency table, cancellation and the invalidated / not-invalidated test. Use when writing or reviewing anything that calls apiClient from app/src.
---

# Server state checklist

The patterns the caching overhaul settled on. `CLAUDE.md` "Server state" has the one-line rules;
`docs/frontend-stack.md` "Data fetching & server state" has the reasons and the dependency table.
Work through this before writing a hook, and again on your own diff. The frontend twin of
`backend-slice`.

## A query hook

- [ ] **Tier.** `staleTime` from `FRESHNESS` (`live` 30 s, `feed` 60 s, `slow` 10 min, `static`),
      never a literal, never the default by omission. Ask who else can change this data while
      someone looks: another manager, a player on their own device, a server job, the calendar. If
      anyone can, it is finite. `static` only for data that is immutable or changed solely by
      mutations that already write the cache. Always mounted (header, bottom nav)? Finite, it is
      never discarded. Put the reason in a comment on the `staleTime`.
- [ ] **Key.** A builder in `clubs/queryKeys.ts` (or the domain's `queryKeys.ts`), added in the same
      change as the hook, never an inline array. Hierarchy club, team, event, sub-query; persona
      (`forPlayerId`) is the last segment. A list key ends in `{}` or its params so it never matches
      a detail. A date in the key is snapped to a quarter hour, as `myAgendaWindow.ts` does. An event sub-query goes through
      `eventSubKey` (add the `EventPart`).
- [ ] **Gate.** `enabled` mirrors the server guard: read the controller's `@ClubRoles` /
      `TeamManagerGuard` / `@AllowGuardians`, not the screen. A query the viewer cannot read is
      never sent. Data for a tab or a dialog loads when it opens (`enabled: activeTab === …`); what
      the hero, a count badge or a permission check reads stays on every tab. Search for every
      reader of the query, its `total` included, before gating it.
- [ ] **Signal.** `queryFn: ({ signal }) => apiClient.get(path, params, { signal })`.
- [ ] **Retry.** Leave the default (never on 4xx, twice on 5xx). Set `retry: false` only when the
      server call is expensive per attempt (the FFBB scrape).
- [ ] **Branches.** Every consumer branches `error → loading → empty → data`. A gated or
      disabled consumer too: an error never falls into an `EmptyState`.
- [ ] **Polling.** `staleTime` equal to the interval, one key for the resource; a reader of part of
      it shares the entry (`BELL_PARAMS`), it does not add a key.

## A mutation

- [ ] **Response into the cache.** `setQueryData` with what the server answered, or `storeTeamEvent`
      for a `TeamEvent`. Does the route return the updated resource? If not, the backend half is
      `backend-slice` "Contract".
- [ ] **Walk the dependency table** in `docs/frontend-stack.md` ("What reads what") for the data you
      move: the dashboard (logistics, RSVP summary, convocation, result, vote, meeting plan), the
      wash duty and rotation (RSVPs, convocations), `myTeams` (name, category, gender, roster,
      admin grants), personas (rosters), admin candidates (club members, linked clubs), team
      stats (matches, votes), poule results (FFBB links). Invalidate each reader that the write can
      change, through the helpers in `clubs/eventCache.ts` when it is an event or a roster.
- [ ] **No double fetch.** Never invalidate a key and then a prefix that covers it (`cancelRefetch`
      restarts the first, the request goes out twice). Never invalidate a prefix that covers the
      entry you just wrote. Root keys (`['clubs']`, `clubQueryKey`, `teamQueryKey`) only with
      `exact: true`.
- [ ] **Frequency decides breadth.** A rare manager write may use the team's `events` prefix
      (`invalidateTeamEvents`, `invalidateRosterDependents`). A write every player fires (RSVP,
      travel mode, wash duty) lists its fan-out entry by entry.
- [ ] **Not fetched on purpose.** A query that is disabled while something runs (the OCR status)
      is marked stale with `refetchType: 'none'`, so a long tier cannot serve the old answer.
- [ ] **A deleted resource.** Drop what it owned (`removeEventSubQueries`) so nothing refetches a
      route that now 404s.
- [ ] **Changes the logged-in user?** Then it goes through `replaceSession`, never a bare
      `setQueryData(sessionQueryKey, …)`.

## Tests and verification

- [ ] The mutation test seeds `createSeededCache`, runs the write and asserts the exact stale set
      (`staleLabels()`, `removedLabels()`), including what must **not** be stale (the convocations
      after an RSVP). A new kind of entry becomes a new seeded label.
- [ ] A new tier on a data-dependent hook (a function of the cached data) is tested as a pure
      function around its cutoff; a static or slow hook gets a remount and a focus case in
      `freshnessTiers.test.tsx`.
- [ ] A new gate asserts the request is not sent (record GETs through MSW, as
      `TeamDetailPage.test.tsx` does).
- [ ] Tests use `renderWithProviders` or `createSeededCache`, not a new `new QueryClient`.
- [ ] A change about what is requested, and when, is measured, not argued: `pnpm mock-api` with
      `scripts/fixtures/request-count-{player,guardian,team-manager}.json`, the Vite dev server and
      Playwright, client-side navigation, request count per step before and after, at 390 and 1280
      wide (recipe in `docs/frontend-stack.md`, "Testing and measuring"). The numbers go in the PR
      description, under "routing or data fetching that changes what is requested, and when".
- [ ] Run only what you touched: `pnpm --filter @basketeasy/app test -- <path>`,
      `pnpm --filter @basketeasy/app exec eslint <files>`, `pnpm exec prettier --check <files>`.
- [ ] Update `CLAUDE.md` and `docs/frontend-stack.md` in the same PR when a rule changed, and add a
      row to the dependency table when a new reader appears.
