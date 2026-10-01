# Jersey wash rotation, part 2: notifications

**Status:** spec, not built. **Date:** 2026-10-01. **Design:** [`2026-10-01-jersey-wash-rotation-design.md`](./2026-10-01-jersey-wash-rotation-design.md) (decision 12, F3, F4, F6, « Notifications »). **Artboard:** [`Notifications`](./assets/2026-10-01-jersey-wash-rotation/Notifications.dc.html) « Notifications ». **Depends on:** part 1 merged (the emission points marked **[P2]** there).

**One PR.** Adds the two notification types, their copy, the audience fan-out at the four emission points, and the feed's icons. Copy is verbatim from the artboard where it draws a sentence; the rest is listed under « Defaults decided without asking ».

## Corrections to the design

| Design says                                                                                                    | Canvas / code says                                                                                                                                                                | Spec decision                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JERSEY_DUTY_ASSIGNED` « sent on … accepted swap »; the API table says swap accept « notifies the old holder » | The artboard's first row is the **old holder's** copy: « Inès B. a accepté votre échange. Elle lave les maillots après le match contre BC Rezé. », titled « Lavage des maillots » | On an accepted swap, `JERSEY_DUTY_ASSIGNED` goes to the **previous holder's** audience with this copy. The new holder accepted it themself (« not on self-accept »), so their audience isn't notified.                       |
| Copy file `server/src/events/jersey-duty-notification-copy.ts`                                                 | Copy modules live beside their emitter (`event-notification-copy.ts`) and share `server/src/common/notification-subject.ts`                                                       | Same file name; phrasing for the guardian reader goes through `notification-subject.ts` (new helpers there if needed), never re-derived.                                                                                     |
| (not said)                                                                                                     | The feed picks an icon per type in `app/src/notifications/NotificationItem.tsx` (`TYPE_BADGE`, a `Record<NotificationType, …>`, so a missing entry fails the type-check)          | `JERSEY_DUTY_ASSIGNED` → `JerseyIcon` (from `app/src/clubs/eventLogisticsIcons.tsx`), `JERSEY_SWAP_REQUESTED` → a new `SwapIcon` (`@basketeasy/ui/icons/swap`, the artboard's two opposed arrows), both `tone: 'structure'`. |

## Types and schema

- `NotificationType` enum (Prisma + `packages/@basketeasy/types/notifications.ts`): `JERSEY_DUTY_ASSIGNED`, `JERSEY_SWAP_REQUESTED`. Hand-written migration `ALTER TYPE "NotificationType" ADD VALUE …` (two statements), then `prisma generate`.

## Emission points (all through `NotificationsService.notify()`, after the transaction commits, never failing the write)

| Trigger (part 1)                     | Type                    | Audience                                                | Not sent when                                          |
| ------------------------------------ | ----------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| `PUT …/jersey-duty` non-null         | `JERSEY_DUTY_ASSIGNED`  | the new holder's audience                               | the holder didn't change (re-PUT of the same id)       |
| Freeze job writes a `SUGGESTION` row | `JERSEY_DUTY_ASSIGNED`  | the frozen holder's audience                            | (`createMany` skipped the row: a concurrent write won) |
| `swap/accept`                        | `JERSEY_DUTY_ASSIGNED`  | the **previous** holder's audience (swap-accepted copy) | (the conditional update lost)                          |
| `POST …/swap`                        | `JERSEY_SWAP_REQUESTED` | the target's audience                                   |                                                        |

Audience: `resolvePlayerAudience` + `groupByRecipient` (`server/src/common/player-audience.ts`), i.e. the player's own account plus every guardian, one row per reader (F4). The **caller is removed from the recipients** (a guardian who assigns as a manager, or who proposes a swap for their child, doesn't notify themself). `subjectFirstName` through `subjectLabel`. `deepLink` through `recipientDeepLink`: `/clubs/<clubId>/teams/<teamId>/events/<eventId>` for a reader concerned themself, rebased onto the child's club with `?pour=<playerId>` for a parent. The self path picks the club the reader belongs to among the team's linked clubs, same as the convocation copy. An unreachable player (no account, no guardian, F6) yields no recipient and nothing is written.

## Copy (`server/src/events/jersey-duty-notification-copy.ts`)

Pure functions, dates in Europe/Paris through `server/src/common/event-copy.ts` (« samedi 4 oct. », « contre BC Rezé »). Pronouns agree with the **player's** `gender`, falling back to the team's.

| Case                               | `title`                 | `body` (reader concerned themself)                                                                                     | `body` (guardian)                                                                                       |
| ---------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Assigned (manager / freeze)        | « Lavage des maillots » | « Vous lavez les maillots après le match contre BC Rezé samedi 4 oct. »                                                | « Léo lave les maillots après le match contre ASPTT Nantes samedi 4 oct. » (artboard row 3)             |
| Swap accepted (to previous holder) | « Lavage des maillots » | « Inès B. a accepté votre échange. Elle lave les maillots après le match contre BC Rezé. » (artboard row 1)            | « Inès B. a accepté l'échange proposé pour Léo. Elle lave les maillots après le match contre BC Rezé. » |
| Swap requested (to target)         | « Échange proposé »     | « Emma M. vous propose de laver les maillots à sa place après le match contre BC Rezé samedi 4 oct. » (artboard row 2) | « Emma M. propose à Léo de laver les maillots à sa place après le match contre BC Rezé samedi 4 oct. »  |

Names are first name + last initial (« Emma M. »), never a relationship label. A playing parent whose child is the subject too cannot happen (one duty, one holder), so no merged « Léo et vous » sentence is needed; `groupByRecipient` still collapses a reader who is both the player and a guardian of nobody else.

E-mail and push reuse `title`/`body`/`deepLink` as every other type does; `emailNotificationsEnabled` applies unchanged.

## Frontend

`NotificationItem.tsx` `TYPE_BADGE` entries above; the new `SwapIcon` follows the existing icon files (takes `tone`/`size` from `@basketeasy/ui/icon-variants`, `aria-hidden`), with its `exports` entry in `packages/@basketeasy/ui/package.json`. Nothing else: the feed renders title/body verbatim.

**Screenshot:** `/notifications` at 390 and 1280 with a fixture `scripts/fixtures/jersey-duty-notifications.json` (the three artboard rows, two unread), side by side with [`Notifications`](./assets/2026-10-01-jersey-wash-rotation/Notifications.dc.html). The canvas has no 1280 artboard; the desktop shot is checked against the existing feed's desktop layout.

## Tests

- `jersey-duty-notification-copy.spec.ts`: each row of the copy table, both genders, Paris date across a DST boundary.
- `jersey-duty.service.spec.ts` (extend part 1's): each emission point notifies the right audience; the caller is excluded; no-op re-PUT sends nothing; a lost swap race sends nothing; a `notify` rejection never fails the request.
- Freeze processor spec: notifies only the rows actually created.
- `NotificationItem.test.tsx`: the two types render their icon.

## Defaults decided without asking

- Swap **refused** and swap **cancelled** notify nobody: decision 12 is « on assignment only »; the proposer sees it on the match page.
- A manager **clearing** a holder, or voiding a turn, notifies nobody (same reason).
- Guardian copy for the swap-accepted and swap-requested cases (the artboard draws only the self copy for those two).

## Docs in the same PR

`CLAUDE.md` Notifications module: add the four jersey emission points and their trap (the caller is excluded; the previous holder, not the new one, is told on a swap). `docs/decisions/notifications.md`: the two types. Delete this spec file.
