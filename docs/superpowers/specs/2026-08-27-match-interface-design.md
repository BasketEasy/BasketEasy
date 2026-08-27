# Match interface

Status: draft (loop 0)
Date: 2026-08-27

## Why

`CLAUDE.md`'s Events module ships plain CRUD, RSVP, and convocations — enough to know who's
coming, not enough to actually run a match day. A `MATCH`-type event today is one table/agenda
row: date, location, opponent name, notes, RSVP, convocation. There's no dedicated place to see
match-specific logistics (who's bringing the jerseys, who's bringing the balls), no way for the
team to recognize a standout performance or flag a rough game, and no capture path for the
official _feuille de match_ — `docs/feature-set.md`'s P1 "Scoresheet (AI-assisted capture)"
item, still unbuilt.

A UI/UX pass (`docs/superpowers/specs/assets/2026-08-27-match-interface/` — six mockup
artboards, design rationale in **Fidelity to the mockups** below) worked out what this should
look like, grounded in the shipped Parquet system and the real `EventRow`/`TeamEventsAgenda`
components. This spec turns that into a buildable data model and API surface; the mockups
themselves are the visual spec — this document does not re-derive layout decisions already
settled there.

## Scope

**In scope**, four independently shippable slices, all gated to `event.type === 'MATCH'`
(trainings keep today's plain row — no detail page, no tabs, nothing here changes their
behavior):

1. **Match detail page** — a new route with an Aperçu / Effectif / Vote / Feuille de match tab
   shell, reusing existing RSVP/convocation data rather than re-modeling it.
2. **Home/away** — a new field on `Event`, since the mockups' hero and agenda card both lead
   with a Domicile/Extérieur badge that nothing in the schema carries today.
3. **Jersey/ball logistics** — lightweight per-match equipment assignment.
4. **Best & worst player voting** — anonymous peer voting, both results public (per explicit
   product decision — see **Voting visibility**, which supersedes the mockups' original
   staff-only "difficulté" framing).
5. **E-marque scoresheet capture** — photo upload + status tracking only. No OCR, no box score,
   no parsed data — the mockups deliberately stop at "queued for processing" because the AI
   parsing pipeline (`docs/architecture.md`'s LLM vision API, provider still TBD per
   `docs/backend-stack.md`) doesn't exist yet. This slice's job is to get a photo durably stored
   against the right match, nothing more.

**Out of scope, explicitly:**

- Any AI/OCR parsing of the scoresheet photo, box scores, or per-player stats derived from it —
  the next initiative once this capture path exists and a vision provider is chosen.
- Fair playing-time tracking (`docs/feature-set.md`'s later P1 item, depends on real attendance
  _and_ scoresheet data).
- A match score/result field — the mockups don't show one (confirmed against
  `assets/.../AgendaCard.dc.html` and `Main.dc.html`); "Voir les résultats" in the agenda card
  links to vote results, not a score.
- A detail page, logistics, voting, or scoresheet capture for `TRAINING` events. If a future
  need arises, extend this module rather than building a parallel one — but don't build it
  speculatively now.
- A voting deadline/close mechanism more elaborate than a fixed post-match window (see
  **Voting window**).
- Any change to the existing `Event` CRUD, recurrence, or bulk time-of-day update logic beyond
  adding the one new `homeAway` field.

## Fidelity to the mockups

The mockups are not a mood board — they're the literal target. Every artboard's exact markup
(inline styles, hex values, spacing, copy) is committed at
[`docs/superpowers/specs/assets/2026-08-27-match-interface/`](./assets/2026-08-27-match-interface/)
(`Main.dc.html`, `AgendaCard.dc.html`, `Roster.dc.html`, `Vote.dc.html`, `Scoresheet.dc.html`,
`MobileDetail.dc.html`, `canvas.json` for artboard sizing) — the same source published to the
design canvas at `https://claude.ai/code/artifact/b80ff86b-6f3d-4842-a3dd-001c20cd0d50`. The
plan (`docs/superpowers/plans/2026-08-27-match-interface.md`) references specific line ranges
in these files task by task. Rules for using them, binding on every implementation task:

- **Copy values, don't approximate them.** Every hex color, `px` measurement, `font-weight`,
  `letter-spacing`, and border-radius in a `.dc.html` file traces to a real design decision.
  Transcribe it exactly. Don't round a spacing value to a nearby Tailwind step, don't substitute
  a "close enough" existing token for one the mockup clearly uses on purpose (e.g. don't render
  the vote leaderboard's gold accent as `orange` because gold isn't in `tailwind-preset.cjs`
  yet — add it, per Task 1 below).
- **Copy French UI strings verbatim**, including the exact wording and typography
  (`&mdash;`, `&laquo;&nbsp;…&nbsp;&raquo;`) — these already went through a tone pass matching
  `EventRow.tsx`/`EventRsvpControl.tsx`'s voice. Don't re-author them.
- **The `.dc.html` markup is a static rendering reference, not a component architecture.**
  Translate its structure into real React components using the project's actual primitives
  (`Card`, `Badge`, `Avatar`, `Table`, `Tabs`, `SectionHeading`'s court-line rule, `Button`) —
  don't literally copy raw `<div style="...">` soup into `.tsx` files. Where a mockup uses a
  bare `<span>` for something that is a real shared component in `packages/@basketeasy/ui`
  (badges, avatars, table cells), use the component; match its rendered output to the mockup's
  pixel values, adding a prop/variant to the shared component if the existing one can't produce
  it rather than hand-rolling a one-off.
- **After building each screen, compare it side by side against its artboard** (the published
  canvas, or a local render of the `.dc.html` — both show the same content) before marking the
  task done. The plan's final task is a full pass doing exactly this across all six screens.
- **One token gap is already known**: the mockups use a `gold`/`gold-text`/`gold-tint` accent
  (`#C08A2E` / `#8C5F16` / `#FBF1DC`) for the best-player trophy/leaderboard that doesn't exist
  in `tailwind-preset.cjs` yet — it was flagged on the canvas as a real, additive token to add,
  not a placeholder to design around. Add it for real (Task 1) rather than reaching for an
  existing color that's visually similar.
- If an implementation task turns up a real conflict between the mockup and `CLAUDE.md`'s
  Parquet constraints (a value that isn't in `tailwind-preset.cjs` and isn't a deliberate
  addition like `gold` above, a modal used where the inline-vs-modal rule says otherwise), the
  constraint wins per `CLAUDE.md`'s own rule — raise it rather than silently picking one.

## Voting visibility (deliberate deviation from the mockups' original annotation)

The mockups' `Vote.dc.html` was drafted with the worst-player ("Joueur en difficulté") result
visible only to team staff, reasoning that a public "who's struggling" leaderboard is punitive.
That artboard has since been **updated** (already reflected in the committed reference file) to
make both results public, per explicit product direction: **the worst-player leaderboard is
visible to the whole team, same as best-player**, merged into one results card. What's kept from
the original sensitivity pass: voting itself stays **anonymous** (nobody, including staff, sees
who voted for whom), and the label stays "Joueur en difficulté" rather than "Pire joueur" (softer
framing, identical mechanic) — visibility changed, wording didn't. Build against the committed
`Vote.dc.html` as-is; it already reflects this.

## Data model (Prisma)

### Home/away

```prisma
enum EventVenue {
  HOME
  AWAY
}
```

`Event` gains `venue EventVenue?` — required (non-null) whenever `type` is `MATCH`, forced to
`null` whenever `type` is `TRAINING`, exactly mirroring how `opponentName` is already validated
in `EventsService` (see `CLAUDE.md`'s Events module section). Same create/update/recurrence
validation path as `opponentName` — no new validation mechanism.

### Jersey/ball logistics

Two nullable self-relations directly on `Event`, not a separate table — each match has at most
one assignee per item, so a join table would only add an unused-most-of-the-time row lifecycle:

```prisma
model Event {
  // ...existing fields...
  jerseysTeamPlayerId String?
  ballsTeamPlayerId   String?
  jerseysAssignee     TeamPlayer? @relation("EventJerseysAssignee", fields: [jerseysTeamPlayerId], references: [id], onDelete: SetNull)
  ballsAssignee       TeamPlayer? @relation("EventBallsAssignee", fields: [ballsTeamPlayerId], references: [id], onDelete: SetNull)
}
```

`TeamPlayer` gains the two back-relations (`jerseysAssignedEvents`, `ballsAssignedEvents`).
`onDelete: SetNull` (not `Cascade`) — removing a roster entry should clear that assignment, not
delete the event.

### Best & worst player voting

```prisma
enum EventVoteCategory {
  BEST
  WORST
}

// One row per (event, category, voter) — the unique constraint is also the
// upsert key for "change my vote." voterTeamPlayerId exists only to enforce
// one vote per person per category; it is never exposed in any API response
// (see Voting visibility above — voting stays anonymous even though results
// are now public).
model EventVote {
  id                String            @id @default(uuid())
  eventId           String
  category          EventVoteCategory
  voterTeamPlayerId String
  votedTeamPlayerId String
  createdAt         DateTime          @default(now())
  event             Event             @relation(fields: [eventId], references: [id], onDelete: Cascade)
  voter             TeamPlayer        @relation("EventVoteVoter", fields: [voterTeamPlayerId], references: [id], onDelete: Cascade)
  votedFor          TeamPlayer        @relation("EventVoteVotedFor", fields: [votedTeamPlayerId], references: [id], onDelete: Cascade)

  @@unique([eventId, category, voterTeamPlayerId])
  @@index([eventId, category])
}
```

### E-marque scoresheet capture

```prisma
enum EventScoresheetStatus {
  UPLOADED
}
```

Deliberately a one-member enum today. The mockup's "En file d'attente pour analyse" copy is
aspirational UI text for a queue that doesn't exist yet — the frontend displays it as the fixed
label for `UPLOADED`, not as a live queue state. `PROCESSING`/`PARSED`/`FAILED`-as-a-persisted-
status belong to the future AI-parsing module (see Out of scope); adding them now with no writer
would be exactly the speculative-building `CLAUDE.md` warns against. An upload-transport failure
(network error, bad photo) is a **client-side-only** state — nothing is persisted until the
upload actually succeeds, so "retry" in the UI just re-runs the presigned-upload flow.

```prisma
model EventScoresheet {
  id                   String                 @id @default(uuid())
  eventId              String                 @unique
  status               EventScoresheetStatus  @default(UPLOADED)
  r2Key                String
  uploadedByTeamPlayerId String
  uploadedAt           DateTime               @default(now())
  event                Event                  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  uploadedBy           TeamPlayer             @relation(fields: [uploadedByTeamPlayerId], references: [id], onDelete: Cascade)
}
```

`@@unique` on `eventId` — re-uploading (a retry, or a better photo) upserts this one row rather
than accumulating a history; v1 doesn't need scoresheet-photo versioning.

## Storage: Cloudflare R2 (new infrastructure — first of its kind in this repo)

No object-storage client exists anywhere in `server/` today. **This slice uses Cloudflare R2**,
not the Scaleway S3 originally named in `docs/architecture.md`/`docs/backend-stack.md` (both
updated alongside this spec) — R2 was already on that doc's shortlist of alternatives, and the
product decision has now been made to use it: zero egress fees (a scoresheet photo gets re-read
on every retry and eventually by the OCR pipeline — S3/Scaleway both bill per-GB for that, R2
doesn't), and it speaks the same S3 API, so the implementation is nearly identical to what an S3
integration would have looked like (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, just
pointed at R2's endpoint instead).

**RGPD note, carried forward from the original Scaleway rationale:** scoresheet photos are minors'
data. Scaleway was EU-resident by default; R2 is a global product and is **not** EU-resident
unless the bucket is explicitly created with Cloudflare's EU jurisdictional restriction. This is
a hard requirement, not a nice-to-have — see **Setup required in the Cloudflare dashboard**
below, and don't build against a non-EU-jurisdiction bucket even for local dev if avoidable.

- New `server/src/storage` module: `StorageService.getUploadUrl(key, contentType)` returning a
  presigned PUT URL, client configured with `region: 'auto'` (R2 doesn't use AWS regions) and
  `endpoint: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`. No download/read path needed
  yet — the scoresheet photo isn't displayed anywhere in this slice, only captured.
- New required env vars, added to `docker-compose.yml`'s `server` service and `.env.example`
  exactly as `JWT_ACCESS_SECRET` was (`CLAUDE.md`'s Auth module convention):
  `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. No region var — R2
  is always `auto`; the endpoint is derived from `R2_ACCOUNT_ID` in code, not stored separately.
- The browser **uploads directly to R2** via the presigned URL — the photo bytes never transit
  through the NestJS API. The API only issues the URL and later records the confirmed key. This
  requires **CORS configured on the R2 bucket** (see setup checklist) to allow a `PUT` from the
  app's origin(s) — without it, the presigned URL works from `curl` but fails silently from the
  browser.
- `r2Key` convention: `scoresheets/{eventId}/{uuid}.jpg` — scoped by event, collision-proof.

This is real, load-bearing infrastructure, not a mock — treat Task group 5 in the plan as the
one most likely to need judgment calls the plan can't fully anticipate (upload size limits, exact
CORS origin list per environment). Keep it minimal: this slice's entire job is "get the photo
durably stored and know it's there," not build toward the eventual OCR pipeline's needs
preemptively.

### Setup required in the Cloudflare dashboard (blocks Phase 5 — human action, not agentic)

Nothing in Task group 5 can run against a real bucket until this is done outside the repo, by
whoever holds the Cloudflare account. None of it can be scripted or provisioned by an agent —
flag it and stop rather than guessing at values:

1. **Create (or confirm) a Cloudflare account** with R2 enabled (R2 requires a payment method on
   file even though the free tier likely covers this app's volume for a long time).
2. **Create the bucket** — a clear, environment-scoped name (e.g. `basketeasy-scoresheets-prod`;
   a second bucket or a prefix convention for a staging/dev environment if one exists).
   **Set the bucket's jurisdiction to "European Union"** at creation time (R2's jurisdictional
   restriction — this cannot be changed after the fact without recreating the bucket) — this is
   what preserves the RGPD rationale above; don't skip it.
3. **Configure CORS on the bucket** to allow `PUT` (and `OPTIONS` preflight) from the app's
   origin(s) — the deployed frontend origin, plus `http://localhost:5173` (Vite's dev server
   default) for local development. Cloudflare's dashboard has a CORS policy editor on the
   bucket's Settings tab; the policy needs `AllowedMethods: ["PUT"]`,
   `AllowedHeaders: ["content-type"]`, and `AllowedOrigins` listing the origins above.
4. **Create an R2 API token** (Cloudflare dashboard → R2 → "Manage API Tokens", not a
   general Cloudflare API token) scoped to **Object Read & Write** on this bucket specifically —
   not an account-wide token. This produces an **Access Key ID** and **Secret Access Key** (R2's
   S3-compatible credential pair, distinct from a Cloudflare API token/email).
5. **Find the Account ID** (Cloudflare dashboard right sidebar, or the R2 overview page) — this
   is `R2_ACCOUNT_ID`, used to build the endpoint URL.
6. **Hand the four values to whoever sets up the deployment environment**: `R2_ACCOUNT_ID`,
   `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` — these go into `.env` (local),
   `docker-compose.yml`'s `server` service env (per Task 5.1), and whatever secrets mechanism
   the actual deploy target uses (per `docs/backend-stack.md`'s Config/secrets row — Scaleway
   secrets manager in prod today). **Never commit these values** — `.env.example` gets the
   variable names with placeholder/empty values only, same as every other secret in this repo.

Local development and CI can use the same EU-jurisdiction bucket with a distinct key prefix
(`scoresheets/dev/...` vs `scoresheets/prod/...`) rather than provisioning a second bucket, if
that's simpler operationally — either is fine; this spec doesn't mandate one over the other.

## Service logic

All four new concerns live in `EventsService` (`server/src/events/events.service.ts`), not new
modules per concern — same reasoning `CLAUDE.md` already gives for Events not splitting into
separate Scheduling/RSVP/Convocation modules: it's all still "stuff attached to one `Event`."
The one exception is `StorageService`, injected into `EventsService` rather than absorbed into
it, since it's infrastructure other modules will eventually need too.

### Home/away

Extends the existing `opponentName` validation branch in `createEvent`/`updateEvent`/
`buildOccurrences` — wherever `opponentName` is required-for-MATCH/forced-null-for-TRAINING,
`venue` follows the identical rule. No new method.

### Logistics

```typescript
type EventLogisticsField = 'JERSEYS' | 'BALLS';

async setEventLogistics(
  clubId: string,
  teamId: string,
  eventId: string,
  userId: string,
  field: EventLogisticsField,
  teamPlayerId: string | null,
): Promise<TeamEvent> {
  const event = await this.assertEventInTeam(clubId, teamId, eventId);
  if (event.type !== 'MATCH') {
    throw new BadRequestException('La logistique ne concerne que les matchs');
  }
  const myTeamPlayer = await this.findMyTeamPlayer(teamId, userId);
  const column = field === 'JERSEYS' ? 'jerseysTeamPlayerId' : 'ballsTeamPlayerId';
  const currentValue = field === 'JERSEYS' ? event.jerseysTeamPlayerId : event.ballsTeamPlayerId;

  // Self-service: any rostered member may assign themself or clear their own
  // assignment. Assigning or clearing SOMEONE ELSE requires the same
  // manager check TeamManagerGuard already encodes (club ADMIN of a linked
  // club, or TeamAdmin of this team) — reuse that guard's underlying check
  // rather than duplicating the logic; see Task 3.2 in the plan.
  const isSelfAction = teamPlayerId
    ? teamPlayerId === myTeamPlayer?.id
    : currentValue === myTeamPlayer?.id;
  if (!isSelfAction && !(await this.isTeamManager(clubId, teamId, userId))) {
    throw new ForbiddenException("Vous ne pouvez pas modifier l'affectation d'un·e autre membre");
  }
  if (teamPlayerId) {
    const onRoster = await this.prisma.teamPlayer.findFirst({ where: { id: teamPlayerId, teamId } });
    if (!onRoster) {
      throw new BadRequestException("Ce membre n'est pas inscrit sur l'effectif de cette équipe");
    }
  }
  await this.prisma.event.update({ where: { id: eventId }, data: { [column]: teamPlayerId } });
  return this.getEventForUser(clubId, teamId, eventId, userId);
}
```

`isTeamManager(clubId, teamId, userId)` is a small extraction from `TeamManagerGuard`'s existing
check (`server/src/auth/guards/team-manager.guard.ts`) into a reusable service method — the
guard calls it too, so the logic isn't duplicated between guard and service (same pattern as
`assertTeamOwner` being usable both inside a guard and directly in a service method elsewhere in
this codebase).

### Voting

```typescript
async castVote(
  clubId: string,
  teamId: string,
  eventId: string,
  userId: string,
  category: EventVoteCategory,
  votedTeamPlayerId: string,
): Promise<EventVoteResults> {
  const event = await this.assertEventInTeam(clubId, teamId, eventId);
  if (event.type !== 'MATCH') {
    throw new BadRequestException('Le vote ne concerne que les matchs');
  }
  if (new Date(event.startsAt) > new Date()) {
    throw new BadRequestException("Le vote n'est ouvert qu'après le match");
  }
  const myTeamPlayer = await this.findMyTeamPlayer(teamId, userId);
  if (!myTeamPlayer) {
    throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
  }
  if (votedTeamPlayerId === myTeamPlayer.id) {
    throw new BadRequestException('Vous ne pouvez pas voter pour vous-même');
  }
  const onRoster = await this.prisma.teamPlayer.findFirst({ where: { id: votedTeamPlayerId, teamId } });
  if (!onRoster) {
    throw new BadRequestException("Ce membre n'est pas inscrit sur l'effectif de cette équipe");
  }
  await this.prisma.eventVote.upsert({
    where: { eventId_category_voterTeamPlayerId: { eventId, category, voterTeamPlayerId: myTeamPlayer.id } },
    create: { eventId, category, voterTeamPlayerId: myTeamPlayer.id, votedTeamPlayerId },
    update: { votedTeamPlayerId },
  });
  return this.getEventVoteResults(clubId, teamId, eventId, userId);
}

async getEventVoteResults(clubId: string, teamId: string, eventId: string, userId: string): Promise<EventVoteResults> {
  await this.assertEventInTeam(clubId, teamId, eventId);
  const myTeamPlayer = await this.findMyTeamPlayer(teamId, userId);
  const votes = await this.prisma.eventVote.findMany({
    where: { eventId },
    include: { votedFor: { include: { player: true } } },
  });
  // Aggregate counts per category client-visible; never return voterTeamPlayerId.
  return buildVoteResults(votes, myTeamPlayer?.id ?? null);
}
```

No deadline enforced server-side beyond "not before the match" — the mockup's "Ouvert jusqu'au…"
countdown is a **client-computed** label (`event.startsAt + VOTE_WINDOW_DAYS`), not a hard
server cutoff; a late vote still counts, matching RSVP's existing "no deadline" precedent (see
`docs/superpowers/specs/2026-08-24-event-rsvp-design.md`'s Scope). `VOTE_WINDOW_DAYS = 7` is a
reasonable default, not derived precisely from the mockups' illustrative sample dates (they use
two different windows across two sample events, neither meant as a spec).

### Scoresheet capture

```typescript
async getScoresheetUploadUrl(clubId: string, teamId: string, eventId: string, userId: string, contentType: string) {
  const event = await this.assertEventInTeam(clubId, teamId, eventId);
  if (event.type !== 'MATCH') {
    throw new BadRequestException('La feuille de match ne concerne que les matchs');
  }
  const myTeamPlayer = await this.findMyTeamPlayer(teamId, userId);
  if (!myTeamPlayer) {
    throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    throw new BadRequestException('Format de photo non supporté');
  }
  const r2Key = `scoresheets/${eventId}/${randomUUID()}.${extensionFor(contentType)}`;
  const uploadUrl = await this.storage.getUploadUrl(r2Key, contentType);
  return { uploadUrl, r2Key };
}

async confirmScoresheetUpload(clubId: string, teamId: string, eventId: string, userId: string, r2Key: string): Promise<EventScoresheetStatus> {
  await this.assertEventInTeam(clubId, teamId, eventId);
  const myTeamPlayer = await this.findMyTeamPlayer(teamId, userId);
  if (!myTeamPlayer) {
    throw new ForbiddenException("Vous n'êtes pas inscrit sur l'effectif de cette équipe");
  }
  await this.prisma.eventScoresheet.upsert({
    where: { eventId },
    create: { eventId, r2Key, uploadedByTeamPlayerId: myTeamPlayer.id },
    update: { r2Key, uploadedByTeamPlayerId: myTeamPlayer.id, uploadedAt: new Date(), status: 'UPLOADED' },
  });
  return this.getScoresheetStatus(clubId, teamId, eventId);
}
```

Any rostered member (not manager-only) can upload — practically, whoever's still at the gym
after the game, not necessarily the coach. Same self-service framing as RSVP.

## API surface

All new routes mount under the existing `clubs/:clubId/teams/:teamId/events/:eventId` path,
guarded like the existing RSVP/convocation routes (`ClubRoles('ADMIN','MEMBER')` at the route,
narrowed to "must be rostered" or "must be a team manager" inside the service — same
defense-in-depth split already used throughout this module):

| Method | Path                        | Notes                                                               |
| ------ | --------------------------- | ------------------------------------------------------------------- |
| PATCH  | `.../logistics`             | body `{ field: 'JERSEYS'\|'BALLS', teamPlayerId: string \| null }`  |
| PATCH  | `.../votes`                 | body `{ category: 'BEST'\|'WORST', teamPlayerId: string }`          |
| GET    | `.../votes`                 | `EventVoteResults` — both categories, aggregated, `myVote`          |
| POST   | `.../scoresheet/upload-url` | body `{ contentType: string }` → `{ uploadUrl, r2Key }`             |
| PATCH  | `.../scoresheet`            | body `{ r2Key: string }` — confirms a completed direct-to-R2 upload |
| GET    | `.../scoresheet`            | current status, or `null` if nothing uploaded yet                   |

`createEvent`/`updateEvent` gain `venue` in their existing DTOs (validated like `opponentName`).
`TeamEvent` gains `venue`, `logistics`, and (for the agenda card's mini chips) enough of that
same `logistics` shape — no separate summary field needed, one shape serves both the detail page
and the agenda card.

## Shared types (`packages/@basketeasy/types/events.ts`)

```typescript
export type EventVenue = 'HOME' | 'AWAY';
export type EventVoteCategory = 'BEST' | 'WORST';
export type EventScoresheetStatus = 'UPLOADED';

export interface TeamEvent {
  // ...existing fields unchanged...
  venue: EventVenue | null; // null for TRAINING
  logistics: {
    jerseys: EventLogisticsAssignee | null;
    balls: EventLogisticsAssignee | null;
  } | null; // null for TRAINING
}

export interface EventLogisticsAssignee {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
}

export interface SetEventLogisticsRequest {
  field: 'JERSEYS' | 'BALLS';
  teamPlayerId: string | null;
}

export interface EventVoteCandidateResult {
  teamPlayerId: string;
  firstName: string;
  lastName: string;
  voteCount: number;
}

export interface EventVoteResults {
  best: EventVoteCandidateResult[];
  worst: EventVoteCandidateResult[];
  totalVoters: number; // roster size eligible to vote, for "N votes sur M"
  votesCast: number;
  myVote: { best: string | null; worst: string | null }; // teamPlayerId or null
}

export interface CastEventVoteRequest {
  category: EventVoteCategory;
  teamPlayerId: string;
}

export interface EventScoresheetUploadUrlRequest {
  contentType: string;
}

export interface EventScoresheetUploadUrlResponse {
  uploadUrl: string;
  r2Key: string;
}

export interface ConfirmEventScoresheetRequest {
  r2Key: string;
}

export interface EventScoresheet {
  status: EventScoresheetStatus;
  uploadedByTeamPlayerId: string;
  uploadedAt: string;
}
```

## Frontend

New route `/clubs/:clubId/teams/:teamId/events/:eventId` → `MatchDetailPage.tsx`
(`app/src/pages/`), reachable only from a `MATCH`-type event card — `EventRow.tsx`'s table
rendering and `TeamEventsAgenda.tsx`'s `AgendaEventCard` both wrap the whole MATCH card in a real
`<Link>` (per `CLAUDE.md`'s A1: every URL-changing control is a link), leaving `TRAINING` cards
exactly as they render today. Tab shell uses the existing `Tabs`/`TabsTrigger` +
`?tab=` query-param convention already established on `TeamDetailPage`/`MembersPage` (`CLAUDE.md`
calls this out as the one documented exception to "every URL-changing control is a link" —
`role="tab"` + `replace: true`), with four tabs: **Aperçu**, **Effectif**, **Vote**, **Feuille de
match** (exact labels — see `assets/.../Main.dc.html:108-111`).

`app/src/clubs/` gets the same one-file-per-concern treatment as the rest of this module. Full
file list and build order are in the plan; the shape:

- **Aperçu tab**: hero (home/away framing, time block, opponent), RSVP control (reused
  `EventRsvpControl`), convocation badge (reused pattern from `EventRow.tsx`), an "Informations
  pratiques" info-card grid, and the new `EventLogisticsSection` — inline self-assign
  ("Je m'en occupe") / manager-reassign ("Changer") controls, no `Dialog`: single-field,
  low-risk, high-frequency, same reasoning `CLAUDE.md` already gives for `TeamPlayerRow`'s
  roster-role `SelectField`.
- **Effectif tab**: one merged roster table (name, role, convocation status, RSVP status) plus
  two summary meters ("Convoqués N/M", "Présences confirmées N/M") — reusing
  `EventRsvpBreakdown`/`EventConvocationBreakdown`'s existing data hooks rather than building a
  new aggregate endpoint, matching this module's established "derive counts client-side from
  data already fetched" convention (see the RSVP spec's Scope). Desktop `Table`, collapsing to
  cards on narrow viewports via `useIsDesktopViewport` — the mockups only show desktop, but
  `CLAUDE.md`'s Consistency section already flags `TeamDetailPage` for missing this collapse
  elsewhere in this same page family; don't repeat that gap here.
- **Vote tab**: ballot (rendered only once the match has started, per the server-side check
  above) plus the merged public results card, exactly as the (already-updated) `Vote.dc.html`
  shows — see **Voting visibility**.
- **Feuille de match tab**: capture → preview → upload (direct to the presigned R2 URL) →
  confirm, with a persistent (not toast) failure state offering retry — matching the existing
  `QueryError` pattern used elsewhere for exactly this reason (a toast could vanish before
  someone back at the gym retries). Mobile-first per the mockup; still needs a usable desktop
  fallback (a file picker instead of a camera capture) since the tab is reachable from desktop
  too.
- **Agenda card**: `EventRow`/`AgendaEventCard`'s `MATCH` rendering gains the home/away badge,
  jersey/ball mini-chips, and (for past matches) a "Votes ouverts · N j restants" badge — the
  last one purely client-computed from `event.startsAt` and `VOTE_WINDOW_DAYS`, no new fetch.

## Testing

Same split as the rest of the codebase: Jest `*.spec.ts` for the four new `EventsService`
method groups (logistics self/manager permission split; vote upsert, self-vote rejection,
before-match rejection, results aggregation and anonymity — assert `voterTeamPlayerId` never
appears in a mapped response; scoresheet upload-url content-type validation and upsert-on-
confirm) and `EventsController` delegation; a focused `StorageService` spec mocking the AWS SDK
client rather than hitting real R2. Vitest/RTL for every new hook and component, plus updated
tests for `EventRow`/`TeamEventsAgenda`'s now-linked MATCH cards. No new E2E harness.
