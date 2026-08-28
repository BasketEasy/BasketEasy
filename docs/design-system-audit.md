# Design System Audit — `@basketeasy/ui`

Date: 2026-08-28. Scope: all of `app/src` (~90 components, 9 pages) plus `packages/@basketeasy/ui/src`, excluding `*.test.*` and `*.stories.tsx`. Every count in this document comes from a script or a `grep -n` over the tree, not from sampling.

This is a consolidation audit, not a redesign. No brand value changed, and the Parquet direction recorded in [`docs/superpowers/specs/2026-08-25-frontend-parquet-revamp-design.md`](./superpowers/specs/2026-08-25-frontend-parquet-revamp-design.md) is the constraint, not the subject.

## 0. Headline

The token discipline is in far better shape than the component API surface. There is **exactly one** hardcoded colour in the entire codebase, **zero** hand-rolled focus recipes, and **zero** arbitrary typography values. What is missing is _expressiveness_: several primitives have enums too narrow to say what the app actually needs, so callers say it in `className` instead.

The pattern repeats across every component: a real, consistent design intent exists, the DS has no way to name it, and 10–40 call sites hand-write the same classes. That is the debt.

| Signal                                                    | Before                         | After this pass                                          |
| --------------------------------------------------------- | ------------------------------ | -------------------------------------------------------- |
| Hardcoded hex outside the token preset                    | 1                              | 0                                                        |
| `Card` call sites overriding background/padding/elevation | 18                             | 0                                                        |
| `CardContent` call sites undoing their own `pt-0`         | 11                             | 0                                                        |
| Caller-side functions returning Tailwind colour classes   | 1 (`badgeClassName`)           | 0                                                        |
| Distinct hand-written text recipes on raw elements        | 69 across 166 sites            | 69 across 157 sites (primitive shipped, migration begun) |
| DS components reimplementing another DS component inline  | 2 (`FormField`, `SelectField`) | 0                                                        |

---

## 1. Debt register, grouped by component

### 1.1 `Card` — the largest single finding

`Card`'s base is `bg-surface` with no padding. Three distinct, internally-consistent overrides existed:

| Override              | Count | Call sites                                                                                                                                                                                                      |
| --------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bg-surface-2 p-3`    | 10    | `TeamClubCard:25`, `TeamListingCard:11`, `PlayerCard:105`, `PlayerCard:172`, `TeamRosterCards:36`, `TeamAdminCard:24`, `EventRosterTab:131`, `PlayerImportPreviewStep:204`, `MyTeamsPage:69`, `MembersPage:220` |
| `overflow-hidden p-0` | 3     | `TeamEventsAgenda:40`, `EventLogisticsSection:169`, `EventRosterTab:239`                                                                                                                                        |
| `p-5 shadow-md`       | 5     | `MatchScoresheetTab:203,253,289`, `MatchVoteTab:233,435`                                                                                                                                                        |
| `CardContent … pt-6`  | 11    | `PlayerImportPage:102`, `MyTeamsPage:158`, `MembersPage:478,604,750`, `DashboardPage:30,76`, `TeamDetailPage:593,703,800,931`                                                                                   |

The `bg-surface-2` cluster is **not drift** — it is the surface ladder working correctly. A card nested inside an already-raised container must step _down_, or it shares a background with its parent. Every one of those ten sites is a mobile "card twin" of a desktop table row. The DS simply had no name for it.

The `CardContent … pt-6` cluster is an API defect: `CardContent` is `p-6 pt-0`, which assumes a `CardHeader` sits above it. Eleven call sites with no header were passing `pt-6` to undo the `pt-0`.

_Category:_ using DS but overriding · _Severity:_ blocks consolidation · _Fix:_ `variant` axis + `first:pt-6`. **Done — see §3.1.**

### 1.2 `Badge` — an enum that mixed two axes

The old enum was `default | secondary | outline`, where `default` meant "solid orange" and `secondary` meant "solid blue-green". Fill treatment and semantic colour were fused, so a _soft_ badge in any colour had nowhere to live. Five call sites hand-wrote the tint triad:

| File:line                    | Hand-written                                              | Real meaning           |
| ---------------------------- | --------------------------------------------------------- | ---------------------- |
| `EventVoteBadge:24`          | `border-orange/30 bg-orange-tint text-orange-text`        | soft · brand           |
| `EventVenueBadge:14`         | `border-blue-green/25 bg-blue-green-tint text-blue-green` | soft · structure       |
| `EventLogisticsMiniChips:32` | `bg-surface-2` + conditional border/text                  | soft · neutral / muted |
| `EventLogisticsSection:116`  | `text-muted` on outline                                   | outline · muted        |
| `MatchScoresheetTab:258`     | a raw `<span>` with the full blue-green pill recipe       | soft · structure       |

The worst instance was `PlayerImportPreviewStep:43-47` — **a caller-side function returning Tailwind colour classes**:

```ts
function badgeClassName(type: ActionType): string | undefined {
  if (type === 'conflict') return 'border-error bg-error-tint text-error';
  if (type === 'skip' || type === 'ignored') return 'text-muted';
  return undefined;
}
```

That function is the clearest possible signal of a missing variant: the caller had a semantic concept (`conflict`) and the only way to express it was raw colour.

_Category:_ DS primitive missing (variant) · _Severity:_ blocks consolidation · **Done — see §3.2.**

### 1.3 Text — no primitive existed at all

166 raw `<p>`/`<span>`/`<div>`/`<dt>`/`<dd>` elements carry **69 distinct** hand-written class recipes. Top of the frequency table:

| Recipe                                | Count |
| ------------------------------------- | ----- |
| `text-sm text-muted`                  | 31    |
| `text-xs text-muted`                  | 13    |
| `text-muted`                          | 10    |
| `font-medium text-charcoal`           | 8     |
| `text-sm font-semibold text-charcoal` | 5     |
| 45 further singleton recipes          | 45    |

**The headline drift:** the same semantic slot — the bold name of a record on the first line of a card or row — is styled **five different ways across 21 call sites**, with the weight drifting freely between `medium`, `semibold` and `bold` and the size sometimes specified and sometimes inherited:

| Recipe                                | Count | Example                              |
| ------------------------------------- | ----- | ------------------------------------ |
| `font-medium text-charcoal`           | 8     | `PlayerCard:173`, `TeamAdminCard:25` |
| `text-sm font-semibold text-charcoal` | 5     | `EventLogisticsSection:102`          |
| `text-sm font-bold text-charcoal`     | 3     | `MatchScoresheetTab:294`             |
| `text-sm font-medium text-charcoal`   | 3     | `EventRosterBreakdown:29`            |
| `font-bold text-charcoal truncate`    | 2     | `MatchWinnersRow:57,65`              |

**The second drift:** seven implementations of the uppercase "eyebrow" label, using **three different tracking tokens**, and two of them omitting `font-heading` entirely — so those two render in the body font, a real visual regression against intent:

| Location                               | Tracking             | `font-heading`? | Weight    |
| -------------------------------------- | -------------------- | --------------- | --------- |
| `SectionHeading:17` (the DS reference) | `tracking-section`   | yes             | bold      |
| `MatchVoteTab:119`                     | `tracking-eyebrow`   | **no**          | bold      |
| `EventDetailPage:43`                   | `tracking-wide-caps` | **no**          | bold      |
| `EventDetailPage:169`                  | `tracking-wide-caps` | yes             | extrabold |
| `EventDetailPage:173`                  | `tracking-wide-caps` | yes             | bold      |
| `TeamEventsAgenda:59`                  | `tracking-wide-caps` | yes             | extrabold |
| `TeamEventsAgenda:63`                  | `tracking-wide-caps` | yes             | bold      |

`tracking-eyebrow` and `tracking-section` exist in the preset _specifically for this role_. Five of six non-`SectionHeading` sites use `tracking-wide-caps` instead, which is sized for Big Shoulders display type, not body-font eyebrows.

_Category:_ DS primitive missing · _Severity:_ blocks consolidation · **Primitive shipped — see §3.3.**

### 1.4 `Heading` — a hidden dependency on a global CSS rule

`Heading` applied **no font and no colour**. Its documented contract said callers should add `font-heading text-charcoal`. Not one of the app's 13 `<Heading>` call sites does.

It rendered correctly only by accident: `globals.css:6-11` sets `h1,h2,h3 { font-family: 'Big Shoulders Display'; font-weight: 800 }` at the raw-tag level. So the component works for exactly the three tags it currently emits, and would silently fall back to the body font for any h4–h6 level or any non-heading tag. `CardTitle` and `AlertTitle` both bake in their own font and colour; `Heading` was the one text primitive that didn't, and the one where relying on callers was actually wrong.

_Category:_ using DS but overriding · _Severity:_ blocks consolidation · **Done — see §3.4.**

### 1.5 Interactive controls

| File:line                                                                                                                                                                                | Finding                                                                                                                                                                                                                                               | Category                | Severity               | Fix                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------- | ------------------------------------------------ |
| `MatchVoteTab:57`                                                                                                                                                                        | `role="radio"` control with **no focus styling at all** — the only interactive element in the app that doesn't compose `focusRing`. Sits in a `role="radiogroup"` with no roving tabindex or arrow-key handling.                                      | not using DS            | **accessibility risk** | Needs a `RadioCard` primitive; see §4            |
| `EventRsvpControl:125`, `PlayerImportPreviewStep:149`, `TeamDetailPage:102`                                                                                                              | Three hand-rolled segmented controls. Identical container, separator, inactive state, `aria-pressed` and `shadow-segment-active`; differ only in height and active fill. `TeamDetailPage:74` carries a comment explicitly documenting the copy-paste. | DS primitive missing    | blocks consolidation   | `SegmentedControl`; see §4                       |
| 9 sites (`TeamAdminRow:28`, `TeamAdminCard:28`, `TeamClubRow:36`, `TeamClubCard:32`, `TeamPlayerRow:60`, `PlayerRow:129`, `PlayerCard:183`, `MembersPage:171`, `EventDeleteModal:46,68`) | Every destructive "Retirer"/"Supprimer" uses `variant="outline"`. `variant="destructive"` exists and is used **once** in the whole app (`TeamDeleteModal:30`).                                                                                        | using DS but overriding | cosmetic drift         | **Needs decision — §5.1**                        |
| `Dialog:35`, `Toast:70`, `TeamFfbbLinkList:124`                                                                                                                                          | Three hand-rolled `×` close buttons, two of them _inside the DS itself_, differing only in `text-lg`/`text-xl` and `text-current/60`/`text-charcoal/60`. `TeamFfbbLinkList`'s is a 20×20 tap target against the 44px used everywhere else.            | DS primitive missing    | accessibility risk     | `IconButton` / `CloseButton`; see §4             |
| `EventRow:58`, `TeamEventsAgenda:124`, `DashboardPage:190`                                                                                                                               | Three inline text links, three different colour/weight combinations for one role (`blue-green`+semibold, `blue-green`+bold, `orange-text`+semibold).                                                                                                  | DS primitive missing    | cosmetic drift         | `TextLink`; see §4                               |
| `AppHeader:74`                                                                                                                                                                           | `buttonVariants({ variant: 'ghost' })` called raw, then `justify-center` and both ghost colours overridden for the active state.                                                                                                                      | using DS but overriding | blocks consolidation   | `Button variant="nav"`                           |
| `LandingPage:220`                                                                                                                                                                        | `<Button variant="secondary" className="bg-surface text-blue-green hover:bg-sunk">` — background, text **and** hover all replaced, so the variant contributes nothing.                                                                                | using DS but overriding | blocks consolidation   | New `inverse` variant (button on a dark section) |
| `Pagination:51`                                                                                                                                                                          | `<SelectTrigger className="h-9 w-20 md:h-9">` — the DS overriding its own primitive's height because `Select` has no `size` axis while `Button` does.                                                                                                 | using DS but overriding | blocks consolidation   | `SelectTrigger size` axis                        |
| `AppHeader:231`                                                                                                                                                                          | `<div onClick>` mobile-menu backdrop, `aria-hidden`, no keyboard path (mitigated by the Escape handler at `:115`).                                                                                                                                    | not using DS            | accessibility risk     | **Needs decision — §5.4**                        |
| `AppHeader:188` / `PublicHeader:21`                                                                                                                                                      | Byte-identical wordmark `<Link>`.                                                                                                                                                                                                                     | duplicate component     | cosmetic drift         | `Wordmark`                                       |
| `AppHeader:176`                                                                                                                                                                          | Skip link with a hand-rolled `focus:` recipe — a _legitimate_ exception (`focus:`, not `focus-visible:`), but it should be encoded as a `SkipLink` component rather than inlined.                                                                     | DS primitive missing    | cosmetic drift         | `SkipLink`                                       |

### 1.6 Duplicate components — the responsive-twin pattern

Six pairs render the same record twice: a `TableRow` for desktop and a `Card` for mobile, duplicating **75–90%** of each file — data hooks, mutation calls, error branching, toast copy, button labels.

| Pair                                                         | Duplication                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `TeamAdminRow` / `TeamAdminCard`                             | ~90% — identical down to a mirrored code comment about 409/400 handling                                                   |
| `TeamClubRow` / `TeamClubCard`                               | ~85%                                                                                                                      |
| `PlayerRow` / `PlayerCard`                                   | Same fields, but Card uses react-hook-form + zod and Row uses raw `useState` — an inconsistency on top of the duplication |
| `TeamRow` / `TeamListingCard`                                | Smallest of the set                                                                                                       |
| `MyTeamRow` / `MyTeamCard` (inline in `MyTeamsPage:38-90`)   | Not even separate files, unlike its siblings                                                                              |
| `MemberRow` / `MemberCard` (inline in `MembersPage:179-234`) | Sixth instance, previously unflagged                                                                                      |

Together this is ~300 duplicated lines and it **doubles the blast radius of every other finding in this document**. _Not_ a styling fix — see §5.2.

`TeamPlayerRow` deliberately has no twin: mobile renders `TeamRosterCards`, a genuinely different grouped-by-role layout. Worth knowing that four tabs use literal twins while one got a redesigned mobile experience.

### 1.7 Further missing primitives (confirmed with counts)

| Primitive                                          | Evidence                                                                                                                                                                                                                                       | Replaces                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `StatTile`                                         | `DashboardPage:27-39`, local and unexported, used **6×** in one file                                                                                                                                                                           | The dashboard KPI row                                                                  |
| `Meter` / `ProgressBar`                            | **Three** implementations, and they disagree on mechanism: `EventRosterTab:85` and `EventRosterBreakdown:105` use the quantized `meterWidthClass.ts` helper; `MatchVoteTab:169,196` uses inline `style={{ width: '…%' }}` and never imports it | All three                                                                              |
| `InfoTile` (key-value detail row)                  | `EventDetailPage:38-48`, local, used 4×                                                                                                                                                                                                        | Event detail rows. _Refuted_ for `TeamDetailPage` — it has no key-value display at all |
| `RemovableChip`                                    | `TeamFfbbLinkList:117-138` — icon + label + dismiss `×`. `Badge` has no dismiss affordance, so this could not have used it                                                                                                                     | The FFBB link chips                                                                    |
| `IdentityCluster` (avatar + name + secondary line) | **6** independent implementations. `MatchVoteTab:71-80` hand-rolls an initials circle while `MatchVoteTab:136` two functions later correctly uses `Avatar`/`AvatarFallback` — from an import already at the top of the same file               | Roster/vote/logistics identity rows                                                    |
| `DividedList`                                      | Two implementations solving one problem opposite ways: `EventRosterBreakdown:24` uses `border-t … first:border-t-0`, `EventLogisticsSection:79` uses `border-b … last:border-b-0`. Zero uses of Tailwind's `divide-y` anywhere                 | Both                                                                                   |

### 1.8 Tokens and surfaces

| File:line                                                                                                                                | Value                                                                                                                             | Severity             | Fix                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `EventDetailPage:211`                                                                                                                    | `stroke="#1E5F74"` (= `blue-green`) — **the only hardcoded colour in the codebase**                                               | blocks consolidation | `currentColor` + `text-blue-green`. **Done.** The surrounding inline SVG is a map-pin that belongs in `@basketeasy/ui/icons/` |
| `Alert.tsx:8`                                                                                                                            | `bg-cream` — the last live `bg-cream`, a legacy alias of `surface-2`                                                              | cosmetic drift       | Rename to `bg-surface-2` (identical value, no visual change)                                                                  |
| 26 sites                                                                                                                                 | `text-cream` — all correct usage (inverse text on a dark fill), all misnamed: `cream` describes appearance, the role is _inverse_ | cosmetic drift       | Add `inverse` as the token name, keep `cream` aliased                                                                         |
| `AppHeader:232`                                                                                                                          | `z-[5]` in an ad-hoc 5/10/20/50 z-scale                                                                                           | cosmetic drift       | Named `zIndex` scale in the preset                                                                                            |
| `EventRow:67`, `ClubFfbbLinkControl:57`, `MatchScoresheetTab:217,228`, `MatchVoteTab:434`, `Textarea:12`, `DropdownMenu:25`, `Dialog:29` | 8 further arbitrary bracket values, all sizing/layout                                                                             | cosmetic drift       | Named preset entries                                                                                                          |

Radix `data-[state=…]` selectors are **not** violations and are excluded from these counts.

`focusRing` composes correctly everywhere except `MatchVoteTab:57`. It does, however, hardcode `focus-visible:ring-offset-surface` (#FFFCF7) while being composed by controls that sit on `bg-surface-2`, `bg-sunk` and `bg-ground` — every segmented control sits on `bg-sunk` (#E9DDCA), so its 2px offset gap renders near-white against that ground. **Needs decision — §5.3.**

### 1.9 Dead code (each verified by grep, not assumed)

| Export                                        | Non-test, non-story importers                                     |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `AvatarImage` (`Avatar.tsx:17`)               | 0 — no player-photo feature exists yet                            |
| `TableFooter` (`Table.tsx:39`)                | 0                                                                 |
| `eventUpdateScopeLabel` (`eventLabels.ts:59`) | 0 — its backing `EVENT_UPDATE_SCOPE_OPTIONS` _is_ used in 3 files |
| `CardFooter`                                  | 0 in app; used by `Card.stories.tsx`                              |
| `AlertTitle`                                  | 0 in app; used by test + stories                                  |

No `@basketeasy/ui` **subpath export** is unused — all 40 have a real importer. The dead code above is dead at the named-export level inside an otherwise-used module, which is why an `exports`-map grep alone would not have caught it. All five are now deleted; see §5.5.

---

## 2. Prioritized backlog

**Quick wins — 1:1 mapping to a new variant on an existing component**

1. `Card` variant axis + `CardContent` `first:pt-6` — 29 call sites ✅ **done**
2. `Badge` variant × tone — 39 call sites, removes `badgeClassName()` ✅ **done**
3. `Heading` owns its font and colour ✅ **done**
4. `FieldError` composed into `FormField`/`SelectField` ✅ **done**
5. `stroke="#1E5F74"` → `currentColor` ✅ **done**
6. `Alert`'s `bg-cream` → `bg-surface-2`; `text-cream` → `text-inverse` alias (27 sites, pure rename)
7. `divide-y` standardisation across the two divider lists

**Medium — a new variant, or a small new component** 8. `Text` primitive ✅ **shipped**; migrate the remaining ~157 call sites (§3.3) 9. `StatTile` — extract from `DashboardPage` 10. `Meter` — extract, and decide quantized-class vs. free-percentage once 11. `TextLink` — 3 sites, 3 recipes 12. `Wordmark`, `SkipLink` — small, exact 13. `Button variant="nav"` (AppHeader) and `inverse` (LandingPage) 14. `SelectTrigger size` axis — unblocks `Pagination:51` 15. Named preset entries for the 9 arbitrary bracket values

**Large — a new primitive with real API design** 16. `SegmentedControl` — 3 sites, needs a size axis and a pluggable active fill 17. `IconButton` / `CloseButton` — 5 sites incl. 2 inside the DS 18. `IdentityCluster` — 6 sites 19. `RemovableChip`, `InfoTile`

**Needs decision — do not guess (§5)** 20. Destructive button colour (9 sites) 21. Responsive-twin consolidation (~300 lines) 22. `focusRing` offset colour on non-`surface` grounds 23. `MatchVoteTab` radio-group accessibility 24. Dead-code removal

---

## 3. Components standardized in this pass

### 3.1 `Card`

```ts
variant?: 'raised' | 'inset' | 'panel' | 'flush'   // default 'raised'
```

| Variant  | Classes                                | Absorbs                                                      |
| -------- | -------------------------------------- | ------------------------------------------------------------ |
| `raised` | `bg-surface shadow-sm`                 | the default; padding delegated to `CardHeader`/`CardContent` |
| `inset`  | `bg-surface-2 p-3 shadow-sm`           | 10 sites                                                     |
| `panel`  | `bg-surface p-5 shadow-md`             | 5 sites                                                      |
| `flush`  | `overflow-hidden bg-surface shadow-sm` | 3 sites                                                      |

Padding is deliberately **coupled** to the variant rather than split into its own axis: every `inset` in the app is `p-3` and every `panel` is `p-5`. A separate `padding` prop would offer 12 combinations to express 4 real ones, against the "fewest enum values" rule.

`CardContent` gained `first:pt-6`, removing all 11 `pt-6` overrides with no new prop and no arbitrary value. Verified: all five untouched no-className `CardContent` sites follow a `CardHeader`, so they keep `pt-0` — the change is behaviour-preserving.

**Migration:**

```diff
-<Card className="flex flex-col gap-2 bg-surface-2 p-3">
+<Card variant="inset" className="flex flex-col gap-2">

-<Card className="flex max-w-sm flex-col gap-4 p-5 shadow-md md:max-w-lg">
+<Card variant="panel" className="flex max-w-sm flex-col gap-4 md:max-w-lg">

-<CardContent className="flex flex-col gap-1 pt-6">
+<CardContent className="flex flex-col gap-1">
```

Layout classes (`flex`, `gap-*`, `max-w-*`) stay caller-side — they are composition, not styling.

### 3.2 `Badge`

```ts
variant?: 'solid' | 'soft' | 'outline'                              // default 'solid'
tone?: 'brand' | 'structure' | 'neutral' | 'muted' | 'danger'       // default 'brand'
```

`variant` is the fill treatment; `tone` is the meaning. Tone names describe role, never hue — `brand` is the rare sharp accent, `structure` the blue-green that organises the UI, matching the Parquet colour-weight rule.

|             | brand                                              | structure                                                 | neutral                                    | muted                                   | danger                                  |
| ----------- | -------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------ | --------------------------------------- | --------------------------------------- |
| **solid**   | `bg-orange-text text-cream`                        | `bg-blue-green text-cream`                                | `bg-charcoal text-cream`                   | `bg-muted text-cream`                   | `bg-error text-cream`                   |
| **soft**    | `border-orange/30 bg-orange-tint text-orange-text` | `border-blue-green/25 bg-blue-green-tint text-blue-green` | `border-border bg-surface-2 text-charcoal` | `border-border bg-surface-2 text-muted` | `border-error bg-error-tint text-error` |
| **outline** | `border-orange/40 text-orange-text`                | `border-blue-green/40 text-blue-green`                    | `border-border text-charcoal`              | `border-border text-muted`              | `border-error text-error`               |

Defaults are chosen so the 6 bare `<Badge>` sites keep their exact previous appearance (`solid`/`brand` == the old `default`).

**Migration — the caller-side style function disappears:**

```diff
-function badgeVariant(type: ActionType): 'secondary' | 'outline' {
-  return type === 'update' ? 'secondary' : 'outline';
-}
-function badgeClassName(type: ActionType): string | undefined {
-  if (type === 'conflict') return 'border-error bg-error-tint text-error';
-  if (type === 'skip' || type === 'ignored') return 'text-muted';
-  return undefined;
-}
+const ACTION_BADGE: Record<ActionType, Pick<BadgeProps, 'variant' | 'tone'>> = {
+  create:   { variant: 'outline', tone: 'neutral' },
+  update:   { variant: 'solid',   tone: 'structure' },
+  conflict: { variant: 'soft',    tone: 'danger' },
+  skip:     { variant: 'outline', tone: 'muted' },
+  ignored:  { variant: 'outline', tone: 'muted' },
+};

-<Badge variant={badgeVariant(action.type)} className={badgeClassName(action.type)}>
-  {ACTION_LABEL[action.type]}
-</Badge>
+<Badge {...ACTION_BADGE[action.type]}>{ACTION_LABEL[action.type]}</Badge>
```

```diff
-<Badge variant="outline" className="gap-1.5 border-orange/30 bg-orange-tint text-orange-text">
+<Badge variant="soft" tone="brand" className="gap-1.5">
```

```diff
-<Badge variant={event.type === 'MATCH' ? 'default' : 'secondary'}>
+<Badge tone={event.type === 'MATCH' ? 'brand' : 'structure'}>
```

**Edge case surfaced, not hidden:** `EventLogisticsMiniChips` previously used `border-border-strong` for its _assigned_ state and `border-border` for _unassigned_. `soft`/`neutral` uses `border-border`, so the assigned chip's border is now one step lighter. The assigned/unassigned distinction is still carried by the text tone (charcoal vs muted) and the icon colour. Recorded as a deliberate normalisation; revert by adding a `border-border-strong` className if the stronger border turns out to be load-bearing.

**Not built:** a `gold`/`accent` tone. `gold` is a real token used by the Vote tab, but never through `Badge` — adding it would be speculative.

### 3.3 `Text` — new primitive

```ts
variant?: 'body' | 'label' | 'meta' | 'eyebrow' | 'display'   // default 'body'
size?:    'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
tone?:    'primary' | 'secondary' | 'inverse' | 'brand' | 'structure'
        | 'danger' | 'success' | 'accent' | 'inherit'
as?:      'p' | 'span' | 'div' | 'dt' | 'dd' | 'li' | 'time' | 'strong'   // default 'p'
```

Three orthogonal axes: `variant` is the **role** (family, weight, case, tracking), `size` the **scale**, `tone` the **semantic colour**. No raw font-size or colour prop, per the standardization brief.

| Variant   | Classes                                             | Default size / tone | Absorbs                                                |
| --------- | --------------------------------------------------- | ------------------- | ------------------------------------------------------ |
| `body`    | —                                                   | md / primary        | 10 sites                                               |
| `label`   | `font-semibold`                                     | md / primary        | 31 sites — **collapses the five-way weight drift**     |
| `meta`    | —                                                   | **sm / secondary**  | 70 sites — the single biggest cluster                  |
| `eyebrow` | `font-heading font-bold uppercase tracking-eyebrow` | xs / secondary      | 6 sites, and settles the three-tracking-token argument |
| `display` | `font-heading font-extrabold`                       | xl / primary        | 22 sites                                               |

Per-variant defaults matter for ergonomics: `meta` and `eyebrow` are secondary by definition, so the dominant case is `<Text variant="meta">` with no other props — replacing `className="text-sm text-muted"` at 31 sites.

`tone="inherit"` emits no colour class, for text inside an already-coloured block. `tabular` and `truncate` stay as utility classes on `className` — they are orthogonal formatting, not style variants, and `.tabular` is already a documented global utility.

**Migration (`DashboardPage`, fully converted):**

```diff
-<span className="text-sm">{label}</span>
-<span className="font-heading text-3xl font-bold text-charcoal">{value}</span>
+<Text as="span" variant="meta" tone="inherit">{label}</Text>
+<Text as="span" variant="display" size="3xl">{value}</Text>
```

```diff
-<span className="font-semibold text-charcoal">{event.teamName}</span>
+<Text as="span" variant="label">{event.teamName}</Text>
```

```diff
-<span className={cn('text-sm font-semibold', event.myRsvpStatus ? 'text-muted' : 'text-orange-text')}>
+<Text as="span" variant="label" size="sm" tone={event.myRsvpStatus ? 'secondary' : 'brand'}>
   Ma réponse : {eventRsvpStatusLabel(event.myRsvpStatus)}
-</span>
+</Text>
```

That last one is the shape to aim for: a _state_ that used to be expressed as a conditional colour class is now a conditional **tone**. The `cn` import became unused and was removed.

**Edge cases that do not fit the matrix:**

- `EventDetailPage:186` uses stock `tracking-wide`, none of the three custom tracking tokens, and is neither `display` (has tracking) nor `eyebrow` (not uppercase). One-off; needs a call on whether to fold into `display` and drop the tracking.
- `MatchWinnersRow:64` is the **only** use of `blue-green-2` in scope — a whole shade existing for one call site. Either it is load-bearing for contrast, or it should be `blue-green`.
- Two `display` sites previously used `font-bold` where four used `font-extrabold`. Normalised to extrabold rather than adding a `weight` axis — otherwise the component's own migration would have required a `className` override, which is the exact pattern being removed. Visible difference in Big Shoulders is one step; flag if wrong.
- The three `PlayerImport` step `<h2>`s are real semantic headings carrying `ref`/`tabIndex` for focus management — they belong on `Heading`, not `Text`.

### 3.4 `Heading` and `FieldError`

`Heading`'s base became `font-heading text-charcoal`, so it no longer depends on a global tag selector it doesn't control. `LandingPage:209`'s `className="text-cream"` still wins via tailwind-merge.

`FormField:42` and `SelectField:72` each reimplemented `FieldError` inline (`<p role="alert" className="text-sm text-error">`); both now compose it.

### 3.5 `RadioCardGroup` — new primitive

```ts
options: ReadonlyArray<{ value: T; disabled?: boolean; render: (s: { selected: boolean }) => ReactNode }>
value: T | null
onChange: (value: T) => void
tone?: 'brand' | 'structure'          // selected-state fill
'aria-label' | 'aria-labelledby'      // one or the other, enforced by the type
```

The Vote tab's ballot was a `role="radio"` inside a `role="radiogroup"` with **no focus styling at all**, every option natively tabbable, and no arrow-key handling — a keyboard user tabbed through all N candidates and could not see where they were. The primitive owns the three things that were missing and are easy to get wrong: the shared focus ring, a roving tabindex (the group is one tab stop), and arrow/Home/End navigation that moves selection with focus, per the ARIA radiogroup pattern.

Options carry a `render` callback rather than a plain node because a card's contents restyle when selected (the avatar inverts, the name goes bold). That keeps the content decision with the caller while the primitive keeps the chrome, the roles and the keyboard model. Eight tests cover the keyboard behaviour; verified in the real app that the tab stop moves with selection (`[0,-1,-1]` → `[-1,0,-1]`) and that ArrowDown both selects and carries focus.

Migrating the ballot also removed the hand-rolled initials circle at `MatchVoteTab:71` — the file already imported `Avatar`/`AvatarFallback` and used them correctly two functions further down.

**Edge case left alone:** the selected `structure` card uses `border-2` where the unselected uses `border`, so selection shifts the card by 1px. That is pre-existing and unrelated to the accessibility fix; it is a one-line change once someone decides which border weight is correct.

### 3.6 `ResponsiveTable` — new primitive, and the twin consolidation

```ts
columns: ReadonlyArray<ReactNode>   // desktop headers; '' for an actions column
children: ReactNode                 // one record component per row
useTableLayout(): 'row' | 'card'    // what the nearest ResponsiveTable is rendering
```

The duplication in the six twin pairs was never in the _markup_ — a table row and a card genuinely differ. It was in everything around it: the mutation hook, the error branching, the toast copy, the button labels, written twice per record. So the fix is not a generic cell renderer that would flatten both layouts into one; it is to let a record component be written **once**, keep its behaviour once, and choose its own markup from `useTableLayout()`.

| Was                                 | Now            |
| ----------------------------------- | -------------- |
| `TeamAdminRow` + `TeamAdminCard`    | `TeamAdminRow` |
| `TeamClubRow` + `TeamClubCard`      | `TeamClubRow`  |
| `TeamRow` + `TeamListingCard`       | `TeamRow`      |
| `PlayerRow` + `PlayerCard`          | `PlayerRow`    |
| `MyTeamRow` + `MyTeamCard` (inline) | `MyTeamRow`    |
| `MemberRow` + `MemberCard` (inline) | `MemberRow`    |

Four files deleted, two inline pairs collapsed, and the five `isDesktop ? <Table>… : <div>…` blocks in `MembersPage`, `MyTeamsPage` and `TeamDetailPage` replaced by one `<ResponsiveTable columns={…}>` each. `useIsDesktopViewport` moved from `app/src/hooks` into `@basketeasy/ui` so the primitive is self-contained.

```diff
-{isDesktop ? (
-  <Table>
-    <TableHeader><TableRow><TableHead>Nom</TableHead>…</TableRow></TableHeader>
-    <TableBody>{teams?.map((t) => <TeamRow key={t.id} … />)}</TableBody>
-  </Table>
-) : (
-  <div className="flex flex-col gap-3">
-    {teams?.map((t) => <TeamListingCard key={t.id} … />)}
-  </div>
-)}
+<ResponsiveTable columns={['Nom', 'Catégorie', 'Genre', '']}>
+  {teams?.map((t) => <TeamRow key={t.id} clubId={clubId!} team={t} />)}
+</ResponsiveTable>
```

**The one behavioural change worth calling out:** `PlayerRow` and `PlayerCard` validated the _same_ edit form differently — the desktop one with raw `useState` and no validation, the mobile one with react-hook-form + zod requiring a non-empty first and last name. The same form therefore enforced different rules depending on the width of the window. The merged component keeps the stricter of the two, so the desktop edit form now rejects an empty name where it previously accepted it. Desktop keeps its inline-cell layout (a `<form>` cannot wrap a `<tr>`, so the submit button calls the same `handleSubmit`).

**`TeamPlayerRow` was deliberately left alone:** its mobile counterpart, `TeamRosterCards`, is a genuinely different grouped-by-role layout, not a twin.

---

### 3.7 Closing the loop: `Text` everywhere, colour nowhere

Two review comments on the PR — "this shouldn't exist anymore, use a typography or text ds component" and "color should be defined by a variant" — were applied to **every** occurrence rather than the two lines they were left on.

**Text.** 94 more raw elements were converted by a transformer that classifies each class list into a role and keeps only the layout classes, then finds the matching close tag by depth-tracking rather than by regex. The remaining handful were done by hand. `app/src` now has **zero** raw `<p>`/`<span>`/`<dt>`/`<dd>` carrying a font-size, weight or colour. `Text` gained one tone in the process: `inverseSecondary`, for de-emphasised copy on a dark ground, where `secondary` would vanish.

**Colour.** A colour may now only be named inside the component that owns the look. Three shapes of violation were found and closed:

| Shape                                                                               | Count | Fix                                                                                                           |
| ----------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| `className="text-*"` on an icon                                                     | 25    | shared `tone` axis (`@basketeasy/ui/icon-variants`), applied to all 7 DS icons and all 6 app-local ones       |
| colour on a DS component (`Avatar`, `Heading`, `Badge`, `TableCell`, `TableHeader`) | 11    | `tone` on `AvatarFallback` and `Heading`; `size` on `Badge` and `Avatar`; `TableHeader` bakes its own surface |
| a Tailwind colour string passed **as a prop** — `colorClassName`, `statusClassName` | 7     | a shared `StatusTone` union, handed straight to `Text`                                                        |

That last shape is the one worth remembering: a prop typed `string` that happens to hold `'text-orange-text'` is the same violation as a `className`, just wearing a name that hides it.

Two side-effects fell out of the sweep:

- **`Avatar`'s `text-xs` was dead.** Four call sites paired `h-7 w-7` with `text-xs` to shrink the initials; `AvatarFallback` hardcoded its own `text-sm`, and a child's class beats an inherited one, so the initials never shrank. `Avatar` now has a `size` axis where the circle and its initials move together, and the intent those call sites expressed finally lands.
- **`TextLink` is now used, not just built.** The three inline-link recipes the audit found are one component.

**Deliberately not swept:** colour _inside_ a component that owns its own look — `EventRsvpControl`'s per-status fills, `PlayerImportSteps`' step states, the segmented controls' active states. That is a variant definition, which is exactly where colour belongs. Those controls are still the hand-rolled primitives §4 proposes extracting; the colour is not the problem there, the duplication is.

---

---

## 4. Proposed APIs for the larger items (not built)

**`SegmentedControl`** — three call sites share container, separator, inactive state, `aria-pressed` and `shadow-segment-active`, differing only in height and active fill.

```ts
interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: ReactNode; activeClassName?: string }>;
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md'; // md = min-h-11 px-3.5, sm = min-h-9 px-3
  tone?: 'brand' | 'structure'; // the fixed active fill
  'aria-label': string; // required — all three sites already pass one
}
```

`EventRsvpControl` needs a _per-option_ active fill (going/maybe/not-going are different colours); `activeClassName` on the option is the escape hatch for that, and is the one place a caller-supplied class is justified.

**`IconButton`** (still open) — `size` needs an `xs` step below `Button`'s `icon` (44px) for the `TeamFfbbLinkList` chip dismiss, and `aria-label` must be required, since all five current instances are glyph-only.

**`TextLink`** — `tone: 'structure' | 'brand'`, `weight: 'semibold' | 'bold'`; needs a decision on which of the three existing recipes is correct rather than encoding all three.

---

## 5. The four flagged decisions — resolved

All four were flagged rather than guessed on the first pass, then confirmed and implemented.

**5.1 Destructive actions are now destructive.** All eleven remove/delete buttons moved from `variant="outline"` to `variant="destructive"`, matching `TeamDeleteModal`, which was already the lone correct instance. This covers both halves of a confirm flow — the trigger and the confirm — since `ConfirmDialog` already pairs `destructive` confirm with `ghost` cancel. Twelve `Button variant="destructive"` sites now exist where there was one.

**5.2 The responsive twins are gone.** See §3.6 — six pairs collapsed into six components behind a new `ResponsiveTable`.

**5.3 `focusRing` no longer names a background.** Rewritten from Tailwind's `ring` to a real CSS `outline`. Tailwind's ring paints its offset gap a solid colour, so the recipe had to name the ground it sat on (`ring-offset-surface`, #FFFCF7) — and this one recipe is composed by controls on all four rungs of the ladder, so every segmented control on `sunk` (#E9DDCA) drew a near-white halo. An outline leaves its offset transparent: the gap shows whatever ground the control is actually on, with no per-ground variant. It also moves focus out of `box-shadow`, so a component's `shadow-*` and its focus state can no longer clobber each other.

**5.4 The vote ballot is keyboard-operable.** See §3.5 — `RadioCardGroup`.

**5.5 Dead code — removed.** Five exports had no non-test, non-story importer and are gone: `AvatarImage` (no player-photo feature exists; `Avatar` is only ever used with `AvatarFallback`), `TableFooter` (no table in the app has a footer row), `CardFooter` (every card puts its actions inside `CardContent`), `AlertTitle` (every `Alert` in the app is a single line of error text), and `eventUpdateScopeLabel` together with the lookup `Map` that existed only to back it — its `EVENT_UPDATE_SCOPE_OPTIONS` is used in three files and stays. The stories and tests that were the only remaining references were updated rather than deleted, so `Alert` and `Card` keep their coverage.

A second sweep, run after the refactors above rather than before, found four more exports that nothing outside their own module used. Those were **un-exported, not deleted** — the code is live, only the export was dead: `voteWindowClosesAt`, `VOTE_OPEN_DELAY_HOURS`, `VOTE_CLOSE_DELAY_DAYS` and `PLAYER_IMPORT_STEP_LABELS`.

Three exports look unused to a naive sweep and were deliberately kept: `isVoteWindowOpen` (used inside `voteWindow.ts` and covered by five assertions), `DESKTOP_BREAKPOINT_PX` (used by the hook and by two test files that need the breakpoint), and `__resetToastsForTests` (a test hook, named for it). Exported prop/variant interfaces — `ButtonProps`, `TextProps`, `RadioCardGroupProps` and the rest — are a component's public typed contract, not dead code; `BadgeProps` being imported by `PlayerImportPreviewStep` is the proof that they do get consumed. The rule now lives in `CLAUDE.md`.

## 6. Accessibility notes

No consolidation in this pass removed a contrast-safe variant. Two pre-existing risks are flagged above (§5.3, §5.4) rather than silently fixed. One new tone pair is worth watching: `Badge` `solid`/`muted` puts `text-cream` on `bg-muted` (#5B564F) — that combination is not currently used by any call site and was added for matrix completeness; check its contrast before adopting it.
