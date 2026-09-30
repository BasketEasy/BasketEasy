# Kluvo UI guidelines

Read this before you design or build any screen. It is the standing reference, so a new screen
starts from these rules and doesn't re-derive them. It collects what the Parquet revamp, the match
page revamp (#290–#294) and the screen-consistency pass settled on.

**Precedence:** `CLAUDE.md` (constraints: tokens, closed prop APIs, forms, feedback, query
branches) > this file (screen grammar and workflow) > a spec's own decisions > a canvas. When they
disagree, the higher one wins and you raise the conflict in the spec rather than copying the lower
one. Keep this file current: a PR that establishes a new pattern updates it in the same diff.

Sources: [Parquet design record](./superpowers/specs/2026-08-25-frontend-parquet-revamp-design.md),
[match page plan](./superpowers/specs/2026-09-30-match-page-revamp-implementation-plan.md),
[screen consistency record](./superpowers/specs/2026-09-30-screen-consistency-design.md),
[`brand.md`](./brand.md), [`design-system-audit.md`](./design-system-audit.md). Reference canvases:
[match page](https://claude.ai/artifact/VHmwSUJyvYhmHQmTuPi7yo),
[all screens](https://claude.ai/artifact/B3Fd4kEVqfQMhaMPfXtVpd).

---

## 1. Foundations (Parquet)

- **Tokens live in one file**, `packages/@basketeasy/ui/tailwind-preset.cjs`. A value that isn't
  there gets added there with a name. Arbitrary Tailwind values (`bg-[#…]`, `h-[76px]`,
  `tracking-[…]`) are never used.
- **Surface ladder:** `sunk` → `ground` (page) → `surface-2` (inputs, nested panels) → `surface`
  (cards, dialogs, header, sheets). An element never shares its parent's background. `Card` picks
  its step through `variant`: `raised` (default), `inset` (inside a raised container), `panel`,
  `flush` (a list or accordion item that owns its padding). `cream` is legacy and never goes in new
  code.
- **Colour weight:** orange is **rare and sharp**. It marks the primary action, the active nav, a
  convocation, the tip-off time and « Vous ». Blue-green carries **structure**: rules, avatars,
  section titles, time blocks, done steps. Gold (`accent`) means a heads-up: a missing fact, a
  « peut-être ». Colour is always a `tone`/`variant` on a component, never a class, ternary or prop
  at a call site.
- **Type:** Big Shoulders Display (`font-heading`, 700–800, uppercase) for headings, eyebrows and
  big numbers. Atkinson Hyperlegible (`font-sans`) for everything else. `.tabular` goes on any
  digits that line up or change: times, dates, scores, counts.
- **Shape:** `rounded-md` 10px (controls, time blocks), `lg` 14px (cards), `xl` 16px (dialogs),
  `2xl` 20px (sheets). **Elevation:** the warm `shadow-sm/md/lg` plus `nav-active` and
  `segment-active`.
- **Breakpoint:** one line, `md` (768px, `DESKTOP_BREAKPOINT_PX`). « Mobile » means `< md`.
  `MobileTopBar`, `AppBottomNav`, `PageBar` and the sheet/dialog placement all switch there. `sm:`
  is never used as the mobile/desktop switch. Design and screenshot at **390** and **1280**.

## 2. Page types

Pick the type from what the page is. Every page has exactly one `h1`.

| Type            | When                                                                | Top of the page                                                                                               |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Tab root**    | a bottom-nav destination or a personal collection                   | `PageHeader`: `h1` (`size="hero"`) + one meta line + at most one action. No card, no back control.            |
| **Entity page** | about one thing: event, team, club, child, guest team               | `PageHero` card (§3).                                                                                         |
| **Depth ≥ 2**   | reached from another page, not from the bottom nav                  | adds `PageBar` below `md` (sticky under `MobileTopBar`) and `PageBackLink` from `md`.                         |
| **Task flow**   | a multi-step or single-form task at depth 2 (import, create a club) | `PageBar` + eyebrow + `PageHeader` + one card.                                                                |
| **Standalone**  | public, auth, error, guest link                                     | wordmark + one centred card whose `h1` is a `Heading`, never a `CardTitle`.                                   |
| **Back-office** | `/admin/*`                                                          | its own shell (no product chrome). It uses `PageHeader`/`PageHero` inside, a breadcrumb instead of `PageBar`. |

Page containers: `PageContainer size="lg"` for data pages, `size="md"` for forms and personal
pages, `top="bar"` under a `PageBar`. Error, loading and empty states keep the plain container.

## 3. The hero and the fact tile

`PageHero` has the same shape as the event page's header:

```
Card raised · p-4 md:p-6 · stacked below md, 2 columns from md
├─ badges row        Badge soft/outline (status: Domicile, Importé, Entente CTC, Mineur·e…)
├─ eyebrow           Text variant="eyebrow" — the parent (event → team, team → club)
├─ h1 + titleAction  Heading as="h1" size="hero" · secondary action icon-responsive (§6)
├─ meta              Text variant="meta" .tabular — when / what / how many
└─ aside             one FactTile (or a 2×2 of StatTile size="sm" in the back-office)
```

A `FactTile` is `Card variant="inset"` + `IconBadge` + label (`label sm`) + detail (`meta xs`) +
actions underneath. It holds **the one fact the reader came for** on that entity: the venue of an
event, the next event of a team, a club's FFBB code, a child's consent.

- **Missing fact the reader can fix** → `tone="accent"`: gold tile, `IconBadge tone="accent"`,
  one sentence, **one filled button** (« Ajouter le lieu », « Convoquer le groupe »).
- **Missing fact the reader can't fix, or an optional one** → neutral tile. The detail says who
  can fix it; there is no button.

## 4. Sections

- A page block is a **`SectionHeading as="h2"`** (the court-line rule) above its content.
  `CardTitle` is only a card's own heading inside a grid of cards. It is never a page section
  title and never a page title.
- **Primary blocks stay open.** A primary block is the question the page is opened to answer: the
  RSVP decision, the logistics, the pilot band, the agenda.
- **Secondary blocks fold** into `SectionAccordion` (Radix, `type="multiple"`, controlled):
  - the title is at most ~20 characters (the trigger doesn't wrap);
  - a summary only when the fact is **already loaded by the page**. Never add a query to fill a
    summary line. Folded content is unmounted, so its queries don't run;
  - open state is component state, seeded from an incoming `?tab=`/deep link and never written back
    to the URL or to storage;
  - seed an item open when it holds something the reader **owes** (a ballot, an error to fix);
  - a component that renders inside an item gets a `headingless` prop instead of its own
    `SectionHeading`, and drops an inner `panel` card (the item is already a `flush` card).
- **Desktop pairs the two primary blocks side by side** (`md:grid-cols-2 items-start`). Everything
  else stacks below.
- Anchored blocks carry `EVENT_SECTION_SCROLL_MARGIN` (or the same `scroll-mt-28 md:scroll-mt-20`)
  so a deep link doesn't land under the sticky bars.
- **Tabs** are for several independent, paginated, filterable data sets on one entity (team, club,
  back-office detail). They are `?tab=` `TabsTrigger`s with `replace: true` (CLAUDE.md's documented
  ARIA exception). A page that answers one question is one scroll, not tabs.

## 5. Lists

| Record         | Shape                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Event          | `MyAgendaEventCard`: `TimeBlock` (solid blue-green = MATCH, bordered `surface-2` = TRAINING) + title + meta + status badges |
| Person         | row: `Avatar` initials + « Prénom N. » or full name + a trailing `Badge` or action                                          |
| Link to a page | row: title (`label sm`) + meta (`meta xs`) + trailing badge + chevron, all rows in one `Card variant="flush"`               |
| Table vs. card | one component in `ResponsiveTable`, branching on `useTableLayout()`, never a `…Row`/`…Card` pair                            |
| Grouped by day | `Text variant="eyebrow"` day label above each group                                                                         |
| Sequence       | the match timeline: time (display 2xl) · dot + `Divider` rail · content. The import stepper uses the same dot and rail.     |
| Figures        | `StatTile` (`md` on pages, `sm` inside a hero); `—` for unknown, never `0`                                                  |

## 6. Actions and controls

- **Primary action:** one filled `Button` per view. On mobile it goes full width inside a tile or
  card, labelled at every width.
- **Secondary header action** (edit, settings): `Button size="icon-responsive"` with `aria-label`.
  It is an icon at 36px below `md` and gains its label from `md`. Never override a button's width
  or padding at the call site.
- **Destructive action:** `outline` button at the foot of the page or section, confirmed in a
  `Dialog` (`EventDeleteModal`, `TeamDeleteModal`).
- **A decision the reader owes is answerable where it is surfaced.** If the home shows « Présent ? »
  or « Comment venez-vous ? », the answer happens there, with the same control the detail page uses
  (one component, a narrow prop shape both data types satisfy). Where there is no room (a list card),
  show the current answer in one meta line with a « Changer » link to the detail page's anchor.
- **RSVP** is always three separate buttons (Présent / Absent / Peut-être), filled by the answer.
- **Choice between cards** is `RadioCardGroup`. **Several values in one control** is
  `SegmentedControl`.
- Touch targets are at least 44px (`h-11` default, `icon` 44px). The 36px `sm`/`icon-responsive`
  is for secondary actions next to a larger target.

## 7. Modals, forms, feedback

- **`Dialog` is the one modal.** `DialogContent` defaults to a bottom sheet with a handle below
  `md` and a centred card from `md` up. `variant="sheet"` is only for a picker that stays a sheet
  on desktop (`PersonaSheet`). Never nest dialogs, and never put a multi-step flow in one (that is
  a route). Use a modal for a focused multi-field edit or a destructive confirm. Keep the control
  inline for a single-field, low-risk, frequent change.
- **Forms:** react-hook-form (+ zod with `zodResolver`). Radix controls go through `Controller`.
  A field refusal goes through `setError('<field>')`, a form refusal through `setError('root')` +
  `Alert`. A reopened dialog is cleared with `reset()`.
- **Feedback:** `FieldError`/`Alert` for validation next to the input. `toast()` for the outcome
  of a completed mutation. Never both for one event.
- **Every query consumer** branches `error → loading → empty → data`. An error never falls through
  to an `EmptyState`. Home previews render nothing when empty. A destination page (`/results`)
  shows an `EmptyState`.

## 8. Copy and data display

- French first. The tone comes from `brand.md`. Server-composed sentences (`ActionItem.message`,
  notifications) are rendered verbatim, never rebuilt client-side.
- A person shown to peers is **« Prénom N. »** (first name + last initial), never a relationship
  label. Full names appear only where the audience already manages the person (roster admin).
- Dates and times are Europe/Paris, `formatEventDayFull` / `formatEventTime`. « heure à
  confirmer » replaces a placeholder time, never « 00:00 ».
- « Lieu non communiqué » is a placeholder, not a place: no itinerary link, no geocode, no travel
  time.
- Unknown is `—`, zero is `0`. The zero-versus-unknown rule of the Team stats module applies to
  every figure. Point splits are counts (« par type de panier »), never shooting percentages.
- **Vote privacy:** who voted for whom is never shown. Leaderboards appear only after the reader's
  own BEST vote or once the window has closed. **« Joueur en difficulté » (WORST) appears only in
  the match page's vote section, never on a home, list, summary or notification.** Votes are the
  player's own and are never offered to a guardian persona.

## 9. Accessibility

- One `h1` per page. Sections are `h2` (`SectionHeading`, accordion triggers).
- Every icon-only control has an `aria-label`. Decorative icons are `aria-hidden`.
- Every interactive primitive composes `focusRing` (an outline, never `ring-offset-*`).
- A terse visual (« 8 / 12 ») gets a spoken label (`summaryLabel`, « 8 présents sur 12 »).
  `CountBadge` is `aria-hidden`, and the count reaches assistive tech through the control's name.
- Charts go through `@basketeasy/ui/chart`, which renders a visually hidden table.

## 10. Component inventory (what to reach for)

| Need                               | Use                                                        |
| ---------------------------------- | ---------------------------------------------------------- |
| Page title on a tab root           | `@basketeasy/ui/page-header` `PageHeader`                  |
| Entity header                      | `@basketeasy/ui/page-hero` `PageHero`                      |
| The one key fact / a missing fact  | `@basketeasy/ui/fact-tile` `FactTile`                      |
| Back navigation at depth ≥ 2       | `app/src/components/PageBar` `PageBar` + `PageBackLink`    |
| Section title                      | `@basketeasy/ui/section-heading` `SectionHeading`          |
| Foldable secondary sections        | `@basketeasy/ui/section-accordion`                         |
| Any non-heading text               | `@basketeasy/ui/text` `Text` (`variant` × `size` × `tone`) |
| Inline link                        | `@basketeasy/ui/text-link` `TextLink`                      |
| Status label                       | `Badge` (`variant` soft/solid/outline × `tone`)            |
| Round icon disc                    | `IconBadge` (`tone`)                                       |
| Event time                         | `TimeBlock`                                                |
| A figure                           | `StatTile`                                                 |
| Table on desktop / cards on mobile | `ResponsiveTable` + `useTableLayout()`                     |
| Modal / sheet                      | `@basketeasy/ui/dialog`, `ConfirmDialog`                   |
| Chart                              | `@basketeasy/ui/chart`                                     |
| Rich text with tokens              | `@basketeasy/ui/template-editor`                           |

`PageHeader`, `PageHero`, `FactTile`, `PageBar` and `icon-responsive` land with
[Part 0](./superpowers/specs/2026-09-30-screen-consistency-part0-shared-primitives.md). Until then,
`EventDetailHero`/`EventHeroLocation`/`EventPageBar` are the reference implementations. A missing
look is a new variant on the component, never a class at the call site. A solved problem (date
picker, drag and drop, upload) is a maintained library wrapped in one `@basketeasy/ui/<name>` file.

## 11. Design workflow

1. **Spec first.** Put a design record in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
   (why, decisions, what's out of scope), then **one plan file per part/screen**, each its own PR,
   with a status line, a `Depends on:`, files, changes, tests and screenshots.
2. **Canvas.** Make a Claude Design canvas with artboards at 390 (mobile, `.app-top` + `.tabbar`
   chrome) and 1280 (desktop header). Start every artboard from
   [`design-kit/artboard-mobile.dc.html`](./design-kit/artboard-mobile.dc.html) /
   [`artboard-desktop.dc.html`](./design-kit/artboard-desktop.dc.html). Their `<style>` is the
   **Parquet canvas kit**: every class mirrors a component and its props (`.card-inset` =
   `Card variant="inset"`, `.btn-outline.btn-sm` = `Button variant="outline" size="sm"`, `.acc` =
   `SectionAccordionItem`, …), and every value in it comes from the preset. Don't invent a class the
   kit lacks. If a design needs one, it needs a component variant too: add both and say so in the
   plan.
3. **Commit the canvas source** under `docs/superpowers/specs/assets/<date>-<topic>/` (the
   `.dc.html` files + `canvas.json`) and link the canvas URL from the spec. The spec's
   mockup-class → component table is the contract. Where the canvas and the spec disagree, the spec
   wins, and the spec says so.
4. **Implement against the artboard** at 390 and 1280 with the same content. A difference is a bug
   unless the plan names it. Screenshot with `pnpm mock-api` + `scripts/fixtures/` + Playwright and
   put the screenshots in the PR next to the artboard.

## 12. Review checklist (copy into the PR)

- [ ] Page type is right: one `h1`, `PageHeader` / `PageHero`, `PageBar` at depth ≥ 2.
- [ ] Primary blocks open, secondary folded, summaries only from loaded data.
- [ ] Missing fact: accent + button only if this reader can fix it.
- [ ] No colour, radius, padding or font weight at a call site. No arbitrary value. No `cream` in
      new code. No `sm:` as the mobile switch.
- [ ] Every query: `error → loading → empty → data`. Every form: react-hook-form. Mutation outcome:
      toast. Validation: inline.
- [ ] Icon-only controls named. Focus ring from `focusRing`. Touch targets ≥ 44px for primary
      actions.
- [ ] « Prénom N. » for peers, `.tabular` digits, `—` for unknown, no WORST outside the vote section.
- [ ] Screenshots at 390 and 1280 next to the artboard. This file updated if a new pattern landed.
