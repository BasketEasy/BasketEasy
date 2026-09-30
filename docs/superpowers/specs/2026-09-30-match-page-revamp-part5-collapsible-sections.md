# Match page revamp: Part 5, collapsible sections

Status: spec (implements « Part 5 » of [`2026-09-30-match-page-revamp-implementation-plan.md`](./2026-09-30-match-page-revamp-implementation-plan.md))
Date: 2026-09-30
Design: [Claude Design canvas](https://claude.ai/artifact/VHmwSUJyvYhmHQmTuPi7yo), artboards « Sections repliables » (390) and « Desktop » (1280). Source in [`assets/2026-09-30-match-page-revamp/`](./assets/2026-09-30-match-page-revamp/).

The manager's event page (`EventDetailManagerView`) turns its secondary sections into an accordion,
so the two blocks most visits need stay on screen. Depends on Part 2 (hero and scroll margin). The
player view (`EventDetailPlayerView`) is out of scope.

## 1. Corrections to the plan that shape this part

- **There is no URL hash to keep open state in.** Deep links reach the page as `?tab=` (`effectif`,
  `vote`, `partage`, `scoresheet`, mapped by `EVENT_TAB_ANCHORS`) and `?partage=<shareId>` (the
  WhatsApp notification, `whatsapp-reminder.scheduler.ts`); nothing reads or writes `location.hash`.
  And `EventDetailPage` documents `?tab=` as « read, never written ». So: open state is component
  state, **seeded** from the incoming anchor and never written back to the URL. No hash, no
  localStorage, as the plan wants, and the existing notification links keep working unchanged.
- **The pilot band and the coach's own RSVP stay out of the accordion.** The plan lists « header,
  Logistique » as always open and the canvas draws no pilot band, but `EventPilotBand` is the answer to
  « ai-je un groupe pour samedi ? », the reason a coach opens the page. Always open: hero, pilot band,
  `CoachOwnRsvpCard` (when rostered), Logistique. The canvas simplified them away.
- **« Notes du coach » keeps hiding when empty.** The canvas shows a « Vide » summary, but the section
  renders only when `event.notes` is set today, and notes are edited through `EventEditModal`, not in
  the section. An empty item that opens onto nothing is noise.
- **Présences is not an accordion item on desktop.** The « Desktop » artboard draws it as a plain
  section in the right column beside Logistique, heading with the court line, no trigger. On mobile it
  is the first accordion item, open by default. The structure differs, so the view branches on
  `useIsDesktopViewport()` (the one existing breakpoint hook, `md`), not CSS.
- **« Effectif de la rencontre / de la séance » becomes « Présences »**, the canvas's name for the
  same block (id `presences` is unchanged).
- **Collapsed content is unmounted** (Radix default). A closed section's queries don't run, which is
  the point, and also why every summary must come from `event` (the `TeamEvent` the page already
  holds): nothing inside a closed item can feed its own summary line.
- **Summaries only where `TeamEvent` has the fact** (plan rule). Scoresheet status needs its own query,
  so « Après la rencontre » shows a summary only once `event.result` exists; the canvas's « Feuille de
  match » placeholder is dropped. The canvas's « 1 message à partager » counts shares, but `TeamEvent`
  carries one `whatsAppShare`, so the copy has no count.

## 2. `SectionAccordion` (`packages/@basketeasy/ui/src/components/SectionAccordion.tsx`)

- Dependency: `@radix-ui/react-accordion` (same major family as the Dialog/Tabs already in
  `packages/@basketeasy/ui/package.json`). This file is its only importer; `exports` entry
  `./section-accordion`. Record the choice in `docs/frontend-stack.md` (component primitives row:
  headless, keyboard model and `aria-expanded`/`aria-controls` come with it, same reason as Dialog).
- API:

  ```tsx
  <SectionAccordion value={string[]} onValueChange={(v: string[]) => void}>
    <SectionAccordionItem value="partage" id="partage" title="Partage WhatsApp" summary="Message à partager">
      …content…
    </SectionAccordionItem>
  </SectionAccordion>
  ```

  Always `type="multiple"`, controlled. `SectionAccordion` is `div.flex.flex-col.gap-2.5`.

- `SectionAccordionItem` = `Accordion.Item` rendered as `Card variant="flush"` (`asChild`). It takes
  `id` and a layout `className` (the caller's `scroll-mt-*`), so an anchor can scroll to a closed item.
- Trigger: `Accordion.Header asChild` → `<h2 className="m-0">`, `Accordion.Trigger` =
  `flex min-h-14 w-full items-center gap-3 px-4 text-left` + `focusRing`. Inside:
  - title with `SectionHeading`'s type (`font-heading text-lg font-bold uppercase tracking-section
text-blue-green`, `flex-1`). Extract those classes from `SectionHeading.tsx` into one exported
    constant (`sectionHeadingText`) that both use, rather than a second copy: the court-line rule is
    not drawn in a trigger (the canvas has none).
  - `summary` as `Text as="span" variant="meta"` (optional; absent → nothing rendered).
  - chevron: new `@basketeasy/ui/icons/chevron-down` (`tone="secondary"`), `transition-transform`
    and `group-data-[state=open]:rotate-180` on the trigger's `group`. This is a state selector, not a
    colour or size, so it stays in the component.
- Content: `Accordion.Content className="px-4 pb-4"`. No height animation (none in the app; add later
  in the wrapper if wanted).
- Summaries sit inside the button, so they are part of its accessible name: « Présences, 8 / 12 » is
  read as is. Where the visual is terse, pass a `summaryLabel` (sr-only text, visual `aria-hidden`):
  Présences uses visual « 8 / 12 », label « 8 présents sur 12 ».

## 3. `EventDetailManagerView` layout

```
EventDetailHero
EventPilotBand                               (always)
CoachOwnRsvpCard                             (if isRostered)
mobile:  section#logistique  (heading + EventLogisticsCard)
         SectionAccordion [presences, partage, notes, vote, apres-la-rencontre]
desktop: div.grid.grid-cols-2.items-start.gap-6
           section#logistique | section#presences (heading « Présences » + EventRosterList)
         SectionAccordion [partage, notes, vote, apres-la-rencontre]
EventEditModal + EventDeleteModal row        (unchanged, last)
```

Items keep today's conditions: partage only `isUpcoming`, notes only with `event.notes`, vote only
`showVote`, après only for a MATCH. Order follows the canvas.

| Item               | `id`                      | Summary (from `event`)                                                                                                                       |
| ------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Présences (mobile) | `presences`               | `{going} / {answering}` from `rsvpSummary`, label « {going} présents sur {answering} » (`answering` is already convocation-scoped or roster) |
| Partage WhatsApp   | `partage`                 | `whatsAppShare.state`: `PENDING` « Message à partager », `SCHEDULED` « Programmé », `SENT` « Envoyé »; otherwise none                        |
| Notes du coach     | (none today, add `notes`) | first line of `event.notes`, `truncate`                                                                                                      |
| Vote du match      | `vote`                    | before `voteWindowOpensAt`: « Ouvre après le match »; `isVoteWindowOpen`: « Vote ouvert »; `hasVoteWindowClosed`: « Résultats »              |
| Après la rencontre | `apres-la-rencontre`      | `event.result` → « {ourScore} – {theirScore} » with `.tabular`; otherwise none                                                               |

Add `notes: 'notes'` to `EVENT_SECTION_IDS` (no `?tab=` maps to it). Each item's `className` carries
`EVENT_SECTION_SCROLL_MARGIN` from Part 2.

## 4. Open state and deep links

- `const [open, setOpen] = useState<string[]>(() => initialOpen())`, where `initialOpen` =
  `isDesktop ? [] : ['presences']`, plus the incoming anchor's id when it names an item.
- The anchor reaches the view as a prop: `EventDetailPage` already computes
  `searchParams.get('tab') ?? (cameFromShareNotification ? 'partage' : null)`; pass the resolved
  section id (`EVENT_TAB_ANCHORS[tab]`) down as `openSection`. An effect adds it to `open` when it
  changes (a second notification tap on the mounted page), never removes anything.
- `useEventSectionAnchor` is unchanged: the item's `id` is always in the DOM, so its retry loop finds
  it. Opening happens in the same render as the seed, so the content is mounted by the time the scroll
  lands; `WhatsAppShareCard`'s `focusOnLoad` still works because the card mounts only once opened.
- `eventId` changing resets `open` to `initialOpen()` (a new event in the same mounted page, same rule
  as `cameFromShareNotification`).
- On desktop `presences` in `openSection` needs no opening (plain section); the scroll is enough.

## 5. Tests and screenshots

- `SectionAccordion.test.tsx`: renders closed items with `aria-expanded="false"`; Enter and Space
  toggle; ArrowDown/ArrowUp/Home/End move focus between triggers (Radix); summary text and
  `summaryLabel` in the accessible name; content unmounted while closed; multiple open at once.
  Plus a `SectionAccordion.stories.tsx`.
- `EventDetailManagerView` (new test file or `EventDetailPage.test.tsx`):
  - mobile: Présences open, others closed; desktop (mock `useIsDesktopViewport`): Logistique and
    Présences sections both visible, no Présences trigger;
  - `?tab=vote`, `?tab=scoresheet`, `?tab=effectif` and `?partage=` each open their item;
  - each summary per the table, and absent where the table says none;
  - each opened section still reaches `error → loading → empty → data` (one case per query-backed
    section: roster, share, vote results, scoresheet status), using the existing MSW handlers.
- Screenshots: 390 px default state (Présences open) and with Partage opened from `?partage=`; 1280 px
  default state. Next to the « Sections repliables » and « Desktop » artboards in the PR.
