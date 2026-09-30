# Player home (« Ma semaine »): vote, last match, season, match stats

Status: spec (screen 1b of [`2026-09-30-screen-consistency-design.md`](./2026-09-30-screen-consistency-design.md); supersedes §2.3 of the [dashboard plan](./2026-09-30-screen-consistency-dashboard.md))
Date: 2026-09-30
Design: [canvas](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd), artboards « Ma semaine · joueur » (390) and « Match · après la rencontre » (390).
Guidelines: [`docs/ui-guidelines.md`](../../ui-guidelines.md).

## 1. The question

What does a regular player see on `/dashboard`? Today (`PlayerHome`):

| Block                  | Shows                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Prochain rendez-vous   | the next event (14 days) as a large card, with RSVP                                         |
| À répondre             | events with no answer, convocations first                                                   |
| Les 14 prochains jours | the agenda by day                                                                           |
| Derniers résultats     | matches of the last 30 days: score, the reader's `myMatchStats` (pts · fautes), « Voter → » |

What is missing, against the week's rhythm (`docs/ux-audit/player-journey.md` §2: answer before
the match, vote and read the result after):

1. **The vote has no state.** « Voter → » shows for any match whose window is open, even to a
   reader who can't vote (not convoked or not `GOING`, which `castVote` refuses) or who already
   voted. A vote the reader owes is not flagged as owed.
2. **The vote's outcome is invisible.** Who was MVP is only on the match page, in the vote section.
3. **No season.** « combien j'ai marqué cette saison ? » needs the team page's « Mes stats » tab,
   three taps away.
4. **No way to say how you're getting there.** After « Présent » on a match, the player chooses
   « avec le groupe » (the RDV) or « direct à la salle » (`EventRsvp.travelMode`), but only in the
   match page's decision band. The home doesn't even show the RDV: `MyAgendaEvent` carries neither
   `meetingPlan` nor `myTravelMode` (CLAUDE.md: « no RDV on the dashboard agenda yet »).
5. **No match stats.** A confirmed scoresheet produces a `MatchPlayerStat` row per player, but no
   screen shows one match's lines. The player sees their own `pts · fautes` on the home, nothing on
   the match page.

## 2. Decisions

- **« Joueur en difficulté » (the `WORST` category) never appears on the home, on `/results` or in
  any notification.** It stays where it is today: the match page's vote section, after the window
  closes. Surfacing it on every teammate's home turns a private in-team ritual into a front-page
  label, and many rosters are minors. **Raised for product:** whether `WORST` results should be
  shown to minors' teams at all is a separate decision; this spec neither widens nor narrows it.
- **MVP names are « Prénom N. »** (first name + last initial), the respondent rule
  (`EventRsvpRespondent`), not the vote section's full name.
- **MVP visibility follows the existing results rule exactly**: visible to a reader who has cast
  their `BEST` vote, or to everyone once the window has closed (`EventsService.buildVoteResults`).
  The home never shows a leaderboard earlier than the match page would.
- **Votes stay the player's own** (guardian design decision 9): a parent acting for a child never
  gets a vote CTA; they see the MVP once it is public.
- **Season figures come from the existing season endpoint** (`GET …/teams/:teamId/stats`, the
  `isMe` row), never re-aggregated by the dashboard: one source of truth for « PTS/M ».

## 3. Layout (artboard « Ma semaine · joueur »)

```
PageHeader « Bonjour, {firstName} » (persona line when acting for a child)
section « À faire » (count)                       only when non-empty
  FactTile accent per owed vote                    « Votez pour le MVP · vs Carquefou » detail « Ferme le 2 oct. » → « Voter » (?tab=vote)
  MyAgendaEventCard per unanswered event           (today's « À répondre », convocations first)
section « Prochain rendez-vous »                   hero card (dashboard plan §2.3 shape), excluded from the agenda below
  RSVP (three buttons)
  MATCH + GOING + meeting point → « Comment venez-vous ? » TravelModeChoice (Avec le groupe · RDV 18:45 Parking Coubertin | Direct à la salle · 19:45)   §6b
section « Dernier match »                          most recent past MATCH in the 30-day window, only if any
  Card: eyebrow « {team} · {date} », title « vs {opponent} », score {us}–{them} display + outcome badge
        FactTile « Ma ligne » : « 14 pts · 2 fautes »  (myMatchStats; « Stats pas encore saisies » when null)
        FactTile « MVP » : « Karim D. » / « Vous ! » (TrophyIcon)   when mvp public; « Votes en cours · 6 / 12 » when voted and still open; absent otherwise
        action « Stats du match » → event page ?tab=scoresheet
section « Ma saison »                              one block per rostered team, max 2 (a third → « Voir toutes mes équipes »)
  eyebrow team name, 4 StatTile size="sm": MJ · PTS/M · Meilleur total · MVP (mvpAwards)
  « Toutes mes stats » → team ?tab=stats
  « Pas encore de match analysé cette saison. » when gamesPlayed = 0
section « Les 14 prochains jours »                 unchanged, minus the hero event
section « Derniers résultats »                     PastMatchesSection minus the « Dernier match », max 3, + « Tous les résultats » → /results
```

Desktop (`md+`): « À faire » + « Prochain rendez-vous » full width; then a 2-column grid
« Dernier match » | « Ma saison »; then the agenda and results full width.

Every block is its own `error → loading → empty → data` ladder; an empty block renders nothing
(home previews never show an `EmptyState`, `PastMatchesSection`'s rule), except the hero's.

## 4. Part 1 (API): vote state on `MyAgendaEvent`

`packages/@basketeasy/types/my-dashboard.ts` first, then `DashboardService`, then the client.

```ts
export interface MyAgendaVote {
  /** castVote would accept this persona now: window open, convoked and GOING, not a guardian persona. */
  canVote: boolean;
  /** The persona has a BEST row for this match. */
  hasVoted: boolean;
  /** ISO end of the window (VOTE_CLOSE_DELAY after startsAt). */
  closesAt: string;
  /** Voters so far / eligible roster, the numbers EventVoteResults already exposes. */
  votesCast: number;
  totalVoters: number;
  /**
   * BEST winners (ties → several), « Prénom N. », `isMe` for the reader's own row.
   * null until public for this reader (hasVoted, or window closed); [] when public but nobody voted.
   */
  mvp: { firstName: string; lastInitial: string; isMe: boolean }[] | null;
}
// MyAgendaEvent gains: vote: MyAgendaVote | null  (null for a TRAINING and for a match not yet started)
```

- Bounded: **one** `eventVote.findMany({ where: { eventId: { in: matchIds } } })` for the batch
  (voter id selected only to compute `hasVoted` for the persona's `TeamPlayer`, never returned),
  plus one `teamPlayer.count` grouped by team for `totalVoters`. No per-event query.
- The `WORST` category is read by nothing here (filter `category: BEST`; `votesCast` counts
  distinct voters across both, matching `EventVoteResults`, so read `voterTeamPlayerId` only).
- Impersonation: `hasVoted` and `mvp` are allowed (they say nothing about whom the subject voted
  for); nothing else from the vote is added.
- Share the window constants with `EventsService` (move `VOTE_OPEN_DELAY_MS`/`VOTE_CLOSE_DELAY_MS`
  to `server/src/common/vote-window.ts`) so the two can't drift.
- `server/test/db/`: not needed (no FK/race/raw SQL); unit specs in `dashboard.service.spec.ts`:
  canVote per RSVP/convocation/guardian case, hasVoted, mvp null before public / public after close /
  public after own BEST vote, ties, `[]` with no votes, no WORST leakage.

## 4b. Part 5 (API): the RDV on `MyAgendaEvent`

`MyAgendaEvent` gains the two fields `TeamEvent` already has, with the same meaning:
`meetingPlan: EventMeetingPlan | null` (null for a TRAINING) and `myTravelMode: EventTravelMode |
null` (null unless the persona answered GOING to a MATCH).

- `DashboardService` calls the meeting-points module's `resolveMeetingPlan` for the batch's matches
  (two queries per batch, the same helper `EventsService` uses, so the RDV time can't differ between
  the home and the match page). Dashboard depends on meeting-points the way Events does; meeting-points
  never imports dashboard.
- `myTravelMode` is read off the persona's `EventRsvp` rows the service already loads (add `travelMode`
  to that select). No new query.
- A stale route triggers the same lazy recompute a `TeamEvent` read does (system upkeep, allowed on a
  GET). « Lieu non communiqué » and « horaire à confirmer » behave exactly as on the match page.
- Types first (`@basketeasy/types/my-dashboard`), then the service, then the client. Unit specs: plan
  on a MATCH, null on a TRAINING, home match with no default RDV, `myTravelMode` per RSVP state,
  guardian persona reads the child's choice.
- When it lands, drop « no RDV on the dashboard agenda yet » from CLAUDE.md's « What's deliberately not
  here yet ».

## 5. Part 2 (API): one match's stats

New route on the Team stats module (it owns `MatchPlayerStat` reads):
`GET clubs/:clubId/teams/:teamId/stats/matches/:eventId` → `MatchStats`, in
`@basketeasy/types/team-stats`:

```ts
export interface MatchStatLine {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  points: number | null;
  fouls: number | null;
  freeThrowPoints: number | null;
  twoPointPoints: number | null;
  threePointPoints: number | null;
  isMe: boolean;
}
export interface MatchStats {
  /** True once a confirmed sheet produced rows; false → the UI shows the scoresheet flow instead. */
  hasStats: boolean;
  lines: MatchStatLine[]; // points desc, nulls last, then lastName
}
```

- Guards: the event-read audience (`ClubRoles('ADMIN','MEMBER')` + `@AllowGuardians()`), then
  `assertEventInTeam`; `?forPlayerId=` resolves `isMe` through `resolveActingTeamPlayer`.
- Zero-vs-unknown: nulls stay null (rendered `—`), same as the season table.
- Point repartition is **counts**, never percentages (Team stats module rule).
- Unit spec: audience, isMe for self and for a guardian's child, empty before confirm, ordering.

## 6. Part 3 (UI): the home

`app/src/clubs/PlayerHome.tsx` per §3, plus:

- `useMySeasonSnapshots(teams)` in `app/src/clubs/`: `useQueries` over the existing team stats hook
  for at most two rostered teams (`useMyTeamList`, `rosterRole !== null`), returning each team's
  `isMe` row. No new endpoint.
- `PastMatchesSection` rows (home and `/results`): « Voter » only when `vote.canVote &&
!vote.hasVoted`; « A voté » muted badge when `hasVoted` and still open; « MVP : {name} » meta
  when `mvp` is public. The client-side `isVoteWindowOpen` check in `PastMatchRow` goes (the server
  now says).
- `EventVoteBadge` on the team agenda keeps its own logic (it reads `TeamEvent`, out of scope).
- Tests: every block's ladder; « À faire » vote tile only when `canVote && !hasVoted`; no vote CTA
  for a guardian persona; MVP hidden while `mvp === null`; « Vous ! » when `isMe`; « Ma saison »
  zero state; no `WORST` text anywhere on the page (assert on « difficulté »).

## 6b. Part 6 (UI): answer « comment venez-vous ? » from the home

Yes, the player answers where the question is shown. Rule added to `docs/ui-guidelines.md` §6: a
decision the reader owes is answerable where the home surfaces it, never only on the detail page.

- **Hero (« Prochain rendez-vous »)**, MATCH only, when `meetingPlan.meetingPoint` is set:
  - before an answer: the RDV line under the venue tile (« RDV {meetsAt} · {place} » or « RDV ·
    horaire à confirmer »), so the reader knows what « avec le groupe » means before tapping Présent;
  - after « Présent »: « Comment venez-vous ? » and the two radio cards, **the same
    `TravelModeChoice`** the decision band and the guest page use (« Avec le groupe » with the RDV time
    and place, « Direct à la salle » with the arrival time). Optimistic, snaps back on failure, toast
    on failure only (the selection itself is the success feedback, as in the decision band);
  - « Absent » / « Peut-être »: the choice disappears (the server resets `travelMode` when the answer
    leaves GOING).
  - No meeting point (a home match with no RDV, or none configured): no choice, the tile shows the
    arrival time only.
- **List cards** (« À faire », « Les 14 prochains jours »), MATCH + GOING + meeting point: one meta line
  « RDV 18:45 · avec le groupe » / « Direct à la salle · arrivée 19:45 » and a `TextLink` « Changer » to
  the event page's decision band (add `decision` to `EVENT_TAB_ANCHORS`, `?tab=decision`). Two radio
  cards on every list card would drown the agenda; the hero is the one place with room for them.
- **Refactor, not a copy:** `EventTravelModeControl` takes the narrow shape both types satisfy
  (`{ id, type, location, locationName, meetingPlan, myTravelMode }`) instead of `TeamEvent`, so the
  hero renders the same component, not a second wiring of `TravelModeChoice`. `useEventTravelModeSet`
  already invalidates the dashboard key. Guardian personas: allowed (travel mode is one of the writes
  `@AllowGuardians` covers), sent with `?forPlayerId=` like the RSVP.
- Tests: hero shows the RDV line before answering; choice appears after Présent, disappears after
  Absent; no choice without a meeting point or on a TRAINING; list card line + « Changer » link to
  `?tab=decision`; a parent persona can choose for the child; failure snaps back with a toast.

## 7. Part 4 (UI): « Stats du match » on the match page

In « Après la rencontre » (both views; for the player it is the accordion item from the
[event player view plan](./2026-09-30-screen-consistency-event-player-view.md)):

- `MatchStatsTable` (`app/src/clubs/`), fetched only when the section is open (collapsed content is
  unmounted, so no extra request on page load). `ResponsiveTable` with columns Joueur · PTS · FTES
  · 3 PTS · 2 PTS · LF; card layout on mobile = person row (Avatar, « Prénom N. », points display,
  fouls meta). The reader's row carries a `Badge variant="soft" tone="brand"` « Vous ».
- Shown above the scoresheet card when `hasStats`; when `!hasStats`, the existing upload / review
  flow is unchanged and no table renders.
- The section's summary (accordion) gains « {us} – {them} » only from `event.result`, as today; the
  stats query never feeds a summary (Part 5 rule).
- The 3 PTS / 2 PTS / LF columns (counts) show in the table layout only; the mobile card shows points
  and fouls. Under the table, the legend « Points marqués par type de panier, pas un pourcentage de
  réussite. » (the rule's wording, carried verbatim).
- Tests: ladder, `isMe` row marked, `—` for null, not fetched while folded.

## 8. Order and sizing

| Part                  | Depends on        | Size |
| --------------------- | ----------------- | ---- |
| 1 Vote state API      | –                 | M    |
| 2 Match stats API     | –                 | S    |
| 3 Home UI             | 1, dashboard plan | M    |
| 4 Match stats UI      | 2                 | S    |
| 5 RDV on the home API | –                 | S    |
| 6 Travel choice UI    | 5, 3              | S    |

Screenshots per part at 390 and 1280: player before the match (vote owed on the previous one),
after voting (window open), after close (MVP public), a parent persona, a season with no analysed
match. Fixtures: extend `match-meeting-point-player.json`; commit `player-home-after-match.json`.
