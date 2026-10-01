# Jersey wash rotation, part 3: match page and agenda chip

**Status:** spec, not built. **Date:** 2026-10-01. **Design:** [`2026-10-01-jersey-wash-rotation-design.md`](./2026-10-01-jersey-wash-rotation-design.md) (decisions 3, 6, 8, 10, 11, F2, F3, F6, Rules, « Frontend »). **Depends on:** part 1 merged (part 2 not required). **Canvas:** [Claude Design](https://claude.ai/artifact/WfheFmiZ484WwFcmHRzvb7), validated.

**One PR.** Built **pixel for pixel** from the twelve artboards below: same copy, spacing, hierarchy and states, every value through existing primitives and `tailwind-preset.cjs` tokens. The PR attaches a 390 screenshot per artboard side by side with it, plus a 1280 shot of each persona (the canvas has no desktop artboard, see « Deviations »).

## Artboards

| State                             | Artboard                                                                                                               | Reader                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Suggested to me                   | [`Main.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Main.dc.html) « Joueuse · suggérée »                         | the suggested player                      |
| I accepted (+ toast)              | [`Accepte.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Accepte.dc.html) « Joueuse · acceptée »                   | the holder                                |
| Someone else's suggestion         | [`Coequipier.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Coequipier.dc.html) « Coéquipière · lecture »          | any other reader without manage rights    |
| Swap dialog                       | [`Echange.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Echange.dc.html) « Feuille · échange »                    | holder or suggested player                |
| Swap pending                      | [`Echange-attente.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Echange-attente.dc.html) « Échange · en attente » | the proposer                              |
| Swap received                     | [`Echange-cible.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Echange-cible.dc.html) « Échange · reçu »           | the swap target                           |
| Guardian, suggested child         | [`Parent.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Parent.dc.html) « Parent · pour Léo »                      | a guardian acting for the suggested child |
| Second guardian, already accepted | [`Parent-2.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Parent-2.dc.html) « Autre parent · déjà accepté »        | another guardian of the holder            |
| Manager before kickoff            | [`Coach-avant.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Coach-avant.dc.html) « Coach · avant le match »       | `rights.canManage`, not locked            |
| Manager after kickoff             | [`Coach-apres.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Coach-apres.dc.html) « Coach · après le match »       | `rights.canManage`, locked                |
| Empty pool                        | [`Vide.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Vide.dc.html) « Aucune suggestion »                          | everyone                                  |
| Later match                       | [`Plus-tard.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Plus-tard.dc.html) « Match suivant · pas encore »       | everyone                                  |

## Corrections to the design

| Design says                                                                          | Code / canvas says                                                                                                                                                                                                                               | Spec decision                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « the « Maillots » row becomes « Lavage des maillots » » inside `EventLogisticsCard` | The canvas draws the duty as **its own card** in the « Logistique » section, with « Ballons » in a separate card below                                                                                                                           | New `EventJerseyDutyCard`, rendered above `EventLogisticsCard` in both `EventDetailPlayerView` and `EventDetailManagerView` when `event.jerseyDuty` is non-null. `EventLogisticsCard` drops its JERSEYS row in that case (BALLS row unchanged). |
| Actions « C'est noté », « Je ne peux pas », « Proposer un échange »                  | Canvas buttons: « C'est noté », « Je ne peux pas », « Échanger »; the dialog is titled « Proposer un échange »                                                                                                                                   | Canvas copy.                                                                                                                                                                                                                                    |
| Manager « Fait » / « Annuler ce tour »                                               | Canvas: « Marquer fait », « Changer », « Annuler ce tour »                                                                                                                                                                                       | Canvas copy.                                                                                                                                                                                                                                    |
| « Agenda / dashboard: the existing jersey mini chip »                                | Only `TeamEventsAgenda` and `EventRow` render `EventLogisticsMiniChips`; the dashboard renders no logistics chip                                                                                                                                 | Agenda only (part 1 doesn't add `jerseyDuty` to `MyAgendaEvent`).                                                                                                                                                                               |
| Swap only by the holder                                                              | [`Main`](./assets/2026-10-01-jersey-wash-rotation/Main.dc.html) offers « Échanger » on a **suggestion**, and [`Echange`](./assets/2026-10-01-jersey-wash-rotation/Echange.dc.html) says « Vous restez responsable tant qu'elle n'a pas accepté » | Part 1's `swap` accepts from the suggested player too and takes the duty in the same write. Nothing to do here beyond calling it.                                                                                                               |

## Deviations from the canvas (the rule wins, say so in the PR)

1. **The meeting-point timeline stays.** The artboards' « Logistique » section shows no `EventMatchTimeline`; on a MATCH it is rendered by `EventLogisticsCard` from the validated meeting-point canvas. Keep it; the duty card sits above `EventLogisticsCard`.
2. **« Présente » in [`Vide`](./assets/2026-10-01-jersey-wash-rotation/Vide.dc.html)** quotes an RSVP button label the app doesn't have (`eventRsvpLabels.ts`: `GOING` → « Présent »). The sentence quotes the real label from that constant, so it can't drift: « Elle apparaîtra dès qu'une joueuse convoquée aura répondu « Présent ». »
3. **No 1280 artboard.** Desktop follows the components: the card keeps its mobile layout in the detail page's column; the swap `Dialog` opens as a centred card from `md` (`DialogContent` default).
4. **Parent artboards omit the « Ballons » card.** It is unchanged by this feature and keeps today's guardian behaviour.

## Gendered copy

The canvas agrees with the reader: U13 F reads « joueuses », « elle », « Exemptée »; Léo (U11 M) reads « Il ne peut pas ». One helper, `app/src/jersey-duty/jerseyDutyCopy.ts`, pure and unit-tested, takes `teamGender` for collective nouns (« joueuses convoquées et présentes ») and the person's `gender ?? teamGender` for pronouns (« Il ne peut pas », « tant qu'elle n'a pas accepté »). No call site writes a gendered string.

## Component (`app/src/jersey-duty/EventJerseyDutyCard.tsx`)

Data: `useJerseyDuty(clubId, teamId, eventId)` → `GET …/jersey-duty` with `forPlayerId` from `useTeamActingAs` (persona is the last segment of the query key). Branches `error → loading → data` (`QueryError` inside the card / `Skeleton`); there is no empty branch: an empty pool is data (`suggestion.kind: 'EMPTY_POOL'`).

Layout, top to bottom (all artboards):

1. Header row: `IconBadge` with `JerseyIcon`, title « Lavage des maillots » (`Text variant="label"`), meta « Après le match », or « Verrouillé depuis le coup d'envoi » when `locked` for a manager ([`Coach-apres`](./assets/2026-10-01-jersey-wash-rotation/Coach-apres.dc.html)).
2. « Maillots apportés par **Lucas D.** » with a new `BagIcon` (`size="xs"`, the artboard's bag glyph). Hidden when `broughtBy` is null (a team's first match, or a previous match nobody holds).
3. Hairline (`Divider`).
4. One state block, chosen in this order:

| Condition                                                 | Block                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Artboard              |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `rights.canRespondToSwap`                                 | `Card variant="inset" tone="structure"`: avatar of the proposer, eyebrow « Échange proposé » (structure), « Emma M. vous propose de laver les maillots à sa place. »; `Button` « Accepter » (default) and « Refuser » (outline)                                                                                                                                                                                                                                                                          | `Echange-cible`       |
| `rights.canManage && locked`                              | holder row (avatar, name, « Ramène le sac au match du 11 oct. »), `Badge` « En cours » (soft structure); « Marquer fait » and « Changer » (outline); « Annuler ce tour » (ghost sm) + meta « « Annuler ce tour » : le lavage ne compte pas (sac resté au gymnase…). »                                                                                                                                                                                                                                    | `Coach-apres`         |
| `rights.canManage` (not locked)                           | holder or suggestion row (« Suggestion · 1 lavage cette saison », `Badge` « Suggérée » soft muted); label « Assigner quelqu'un d'autre » + `SelectField` placeholder « Choisir dans l'effectif »; meta « Parmi 8 joueuses convoquées et présentes, 1 exemptée. »                                                                                                                                                                                                                                         | `Coach-avant`         |
| suggestion is the persona (`rights.canAccept`, no holder) | `Card variant="inset" tone="brand"`: eyebrow « Suggestion » (brand), display « C'est votre tour » / « Au tour de Léo », meta « 1 lavage cette saison, le moins de l'équipe. » (suffix only when `isFewest`); `Button` « C'est noté » / « C'est noté pour Léo » (default variant, full width, `Check` icon); « Je ne peux pas » / « Il ne peut pas » and « Échanger » (outline, two columns, `SwapIcon`); then meta « La suggestion change si les présences changent, jusqu'à ce que quelqu'un accepte. » | `Main`, `Parent`      |
| persona holds it, swap pending                            | own avatar, « Vous », « Échange proposé à Inès B. », `Badge` « En attente » (soft brand); « Annuler la proposition » (outline sm)                                                                                                                                                                                                                                                                                                                                                                        | `Echange-attente`     |
| persona holds it, accepted                                | own avatar, « Vous » / « Léo », « Vous rapportez le sac propre au prochain match. » or « Accepté par Sophie M. » when `acceptedBy` is someone else; `Badge` « Noté » (soft success); « Je ne peux plus » / « Il ne peut plus » and « Échanger » (outline sm)                                                                                                                                                                                                                                             | `Accepte`, `Parent-2` |
| someone else holds it or is suggested                     | their avatar and name, « Suggestion, pas encore confirmée » or the holder state, `Badge` « Suggérée »                                                                                                                                                                                                                                                                                                                                                                                                    | `Coequipier`          |
| `suggestion.kind === 'EMPTY_POOL'`                        | `Card variant="inset"`: « Aucune suggestion pour l'instant », « Elle apparaîtra dès qu'une joueuse convoquée aura répondu « Présent ». »                                                                                                                                                                                                                                                                                                                                                                 | `Vide`                |
| `suggestion.kind === 'AFTER_PREVIOUS'`                    | `Card variant="inset"`: « Suggestion après le match du 4 oct. », « On attend de savoir qui lave après ce match-là. »                                                                                                                                                                                                                                                                                                                                                                                     | `Plus-tard`           |

Dates through the app's existing Paris formatters (« 4 oct. », « 11 oct. »), `.tabular` on digits.

### Mockup class → component

| Canvas class                                      | Component and props                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `sh`                                              | `SectionHeading` (the existing « Logistique » heading, unchanged)                     |
| `card`                                            | `Card` (default `raised`)                                                             |
| `icb`                                             | `IconBadge` + `JerseyIcon`                                                            |
| `b` / `t-sm muted` / `t-xs muted`                 | `Text variant="label"` / `Text variant="meta"` / `Text variant="meta" size="xs"`      |
| `eyebrow brand` / `eyebrow structure`             | `Text variant="eyebrow" tone="brand"` / `tone="structure"`                            |
| `display`                                         | `Text variant="display"`                                                              |
| `hair`                                            | `Divider`                                                                             |
| `inset inset-brand` / `inset-structure` / `inset` | `Card variant="inset" tone="brand"` / `tone="structure"` / no tone                    |
| `av` / `av av-me`                                 | `Avatar` + `AvatarFallback tone="structure"` / `tone="brand"` (the reader)            |
| `badge bd-muted/-success/-brand/-structure`       | `Badge variant="soft" tone="muted" / "success" / "brand" / "structure"`               |
| `btn btn-primary/-outline/-ghost` (+`btn-sm`)     | `Button` default variant / `variant="outline"` / `variant="ghost"` (`size="sm"`)      |
| `select`                                          | `SelectField`                                                                         |
| `sheet`, `overlay`, `handle`, `dtitle`, `x`       | `Dialog` + `DialogContent` (default: sheet below `md`), `DialogTitle`, built-in close |
| `radio`, `radio-on`, `dot`                        | `RadioCardGroup tone="choice" indicator`                                              |
| `toast`                                           | `toast()`                                                                             |
| `persona`                                         | the existing `ActingAsBanner` (unchanged)                                             |
| `page-bar`, `timeblock`, `tabbar`                 | existing `PageBar`, `TimeBlock`, `AppBottomNav` (unchanged)                           |

A value the existing variants can't express becomes a variant or token in the PR, never a call-site class. Check in particular that `Card tone="structure"` accepts `variant="inset"` the way the artboard nests it.

## Swap dialog (`app/src/jersey-duty/JerseySwapDialog.tsx`)

[`Echange.dc.html`](./assets/2026-10-01-jersey-wash-rotation/Echange.dc.html). `Dialog`, title « Proposer un échange », intro « À qui proposer de laver les maillots à votre place ? Seules les joueuses convoquées et présentes apparaissent. », `RadioCardGroup` of `swapCandidates` (name + « 0 lavage » / « 2 lavages », `.tabular`), first one pre-selected, footnote « Vous restez responsable tant qu'elle n'a pas accepté. », `Button` « Envoyer la proposition » (default variant) and « Annuler » (closes). react-hook-form + zod (`teamPlayerId` required), `RadioCardGroup` through `Controller`, `reset()` on open. A 409/400 from the server goes to `setError('root')` + `Alert`; success closes and toasts.

## Mutations (`app/src/jersey-duty/useJerseyDutyMutations.ts`)

One hook per action (accept, decline, swap, cancel swap, accept / refuse swap, assign, done / undone, void / unvoid), each with `forPlayerId` for the player-side ones. Every response is a `JerseyDutyDetail`: `setQueryData` on the duty key, then invalidate the team's events prefix (the agenda chip and `TeamEvent.jerseyDuty`) and the rotation overview prefix (part 4). Outcomes as `toast()` (the triggering control may have gone):

| Action          | Success toast                                            | Source                   |
| --------------- | -------------------------------------------------------- | ------------------------ |
| accept          | « C'est noté, merci ! »                                  | `Accepte`                |
| decline         | « C'est noté, la suggestion passe à quelqu'un d'autre. » | default                  |
| swap            | « Proposition envoyée à Inès B. »                        | default                  |
| cancel swap     | « Proposition annulée. »                                 | default                  |
| accept swap     | « C'est noté, merci ! »                                  | default (same as accept) |
| refuse swap     | « Échange refusé. »                                      | default                  |
| assign / change | « Emma M. lave les maillots après ce match. »            | default                  |
| done / undone   | « Marqué comme fait. » / « Remis en cours. »             | default                  |
| void / unvoid   | « Tour annulé. » / « Tour rétabli. »                     | default                  |

Errors: `toast({ variant: 'destructive' })` with `getClubErrorMessage`, extended for `JERSEY_DUTY_LOCKED` (« Le match a commencé : seul un·e responsable peut encore changer le lavage. »), `JERSEY_ROTATION_DISABLED` and the swap race (409: « L'échange n'est plus disponible. »). A 409 also refetches the duty.

## Manager controls

- `SelectField` « Choisir dans l'effectif »: one inline `useForm` field through `Controller` (CLAUDE.md « Forms », like `ClubFfbbFactTile`), submits on change. Options: the full roster (`useEventConvocations`, which `EventLogisticsCard` already uses for its roster), pool first in suggestion order, then the rest by name; an exempted player reads « Sarah K. (exemptée) »; a « Personne » option clears. Inline, not a dialog: single field, reversible.
- After kickoff, « Changer » reveals the same `SelectField`; « Marquer fait » toggles to a `Badge` « Fait » (soft success) with « Rouvrir » (ghost sm); « Annuler ce tour » toggles to `Badge` « Annulé » (soft muted) with « Rétablir ce tour » (ghost sm). All inline: reversible, no confirm modal (CLAUDE.md « Modals vs. inline »).
- Unreachable holder or suggestion (`reachable: false`, F6): meta « Personne ne sera prévenu » under the name, manager only.

## Agenda chip (`EventLogisticsMiniChips`)

Takes the event's `jerseyDuty` too. On a MATCH with `jerseyDuty`: the JERSEYS chip reads « Vous lavez les maillots » when `isMine`, « Lavage : Emma M. ✓ » when a holder exists, « Lavage : non assigné » otherwise (same `Badge` tones and `JerseyIcon` as today). TRAINING and rotation-off MATCH: unchanged.

## Fixtures and screenshots

`scripts/fixtures/jersey-duty-match.json` (player suggested), `jersey-duty-guardian.json` (on top of `guardian-parent-session.json`), `jersey-duty-manager.json` (on top of `authenticated-admin-session.json`), each keyed `"GET /api/clubs/…/jersey-duty"` plus the event, reproducing the artboards' data (U13 F vs BC Rezé, sam. 4 oct. 14:00; U11 M vs ASPTT Nantes for the guardian). Swap, accepted, empty and later states are variants of these files. `screenshot-ui` skill, 390 and 1280.

## Tests

`EventJerseyDutyCard.test.tsx`: one case per state-table row (copy verbatim), guardian copy with a boy and a girl, `isFewest` suffix, error branch, buttons call the right mutation with `forPlayerId`. `JerseySwapDialog.test.tsx`: pre-selection, submit, root error. `jerseyDutyCopy.test.ts`. `EventLogisticsMiniChips.test.tsx`: the three chip copies. `EventLogisticsCard.test.tsx`: no JERSEYS row when `jerseyDuty` is set.

## Open question for the product owner

**Volunteering has no button.** The design's Rules let any pool member take the duty before anyone accepted (part 1's `accept` supports it), but [`Coequipier`](./assets/2026-10-01-jersey-wash-rotation/Coequipier.dc.html) draws a read-only card. Proposed: ship as drawn (read-only); add « Je m'en occupe » later through the canvas if clubs ask. Ask before the PR.

## Docs in the same PR

`docs/ui-guidelines.md`: the duty card if it is a new pattern (a state block in an inset card under a fixed header). `CLAUDE.md`: one line on `app/src/jersey-duty/` (persona-scoped hooks, the gendered-copy helper). Delete this spec file.
