# Match page revamp: Part 1, responsive modals

Status: spec (implements « Part 1 » of [`2026-09-30-match-page-revamp-implementation-plan.md`](./2026-09-30-match-page-revamp-implementation-plan.md))
Date: 2026-09-30
Design: [Claude Design canvas](https://claude.ai/artifact/VHmwSUJyvYhmHQmTuPi7yo), artboards « Ajouter le lieu » and « Modifier le lieu » (`.sheet`, `.sheet-handle`).

Every `DialogContent` opens as a bottom sheet on a phone and as the centred card on a desktop, with no
change at any call site. No dependency on the other parts; Part 3's `EventVenueDialog` relies on it.

## 1. Corrections to the plan that shape this part

- **The breakpoint is `md`, not `sm`.** The app's one « desktop » line is `DESKTOP_BREAKPOINT_PX = 768`
  (`packages/@basketeasy/ui/src/lib/useIsDesktopViewport.ts`), Tailwind's `md`. It decides
  `MobileTopBar` vs the desktop header and whether `AppBottomNav` renders, and it is the line
  `AdminActionDialogFrame` switches on today. With `sm:` (640) a 700 px tablet would get a centred
  dialog over the phone chrome, and the admin dialogs would move their switch point by 128 px as a
  side effect of a refactor. So every `sm:` in the plan's class list reads `md:` here.
- **The grab handle is a real element, not a `::before`.** It must hide from `md` up and carry
  `aria-hidden`; a child `<span>` does both with plain utilities.
- **`ConfirmDialog` (`@basketeasy/ui/confirm-dialog`) changes too.** It renders `DialogContent` with no
  `variant`, so it inherits the new default. Intended: it is a modal like any other.

## 2. `Dialog.tsx`

`DIALOG_PLACEMENT` gains `responsive` and it becomes `DialogContent`'s default:

```ts
responsive:
  'inset-x-0 bottom-0 w-full rounded-t-2xl border-t ' +
  'md:right-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[calc(100%-2rem)] md:max-w-md ' +
  'md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border',
```

- `md:w-[calc(100%-2rem)]` is the existing `dialog` width, moved behind the prefix, not a new arbitrary
  value (its comment on `%` vs `vw` stays next to it). `dialog` and `sheet` keep their current strings
  as explicit opt-outs.
- The shared base (`max-h-[calc(100dvh-2rem)] overflow-y-auto … p-6 shadow-lg`) is unchanged; the
  canvas's sheet padding (24 px) and radius (20 px = `rounded-t-2xl`) already match it.
- **Handle**: when the placement is `responsive` or `sheet`, the first child is
  `<span aria-hidden="true" className="absolute left-1/2 top-2 block h-1 w-10 -translate-x-1/2 rounded-full bg-border-strong" />`,
  plus `md:hidden` for `responsive` (a `sheet` shows it at every width: `PersonaSheet` stays a sheet on
  desktop). `border-strong` is `#D6C8B2`, the canvas's handle colour, so no new token.
- The close button (`absolute right-2 top-2`, 44 × 44) keeps its place in every placement. It sits
  under the handle's row on the right, never over it (handle is centred, 40 px wide).
- Update the placement comment to say: responsive is the default, `sheet` is for a picker that stays a
  sheet everywhere, `dialog` for a centred card at every width (no current caller; keep it for a flow
  that must never cover the bottom edge).

## 3. Call sites

- `app/src/admin/actions/AdminActionDialog.tsx`: `AdminActionDialogFrame` drops
  `useIsDesktopViewport` and `variant={isDesktop ? 'dialog' : 'sheet'}`; its comment « A centred dialog
  on desktop, a bottom sheet on a phone » moves to describing the default. If that was the file's only
  use of the hook, remove the import.
- `app/src/guardians/PersonaSheet.tsx`: keeps `variant="sheet"`.
- Every other `DialogContent` (about 25, listed by `grep -rn "<DialogContent" app/src`) is untouched and
  becomes responsive.

## 4. CLAUDE.md

One sentence in « Modals vs. inline editing », after the sentence naming `Dialog` as the one modal
primitive: « `DialogContent` opens as a bottom sheet below `md` and as a centred card from `md` up by
default; pass `variant="sheet"` only for a picker that stays a sheet on desktop (`PersonaSheet`). »

## 5. Tests and screenshots

- `Dialog.test.tsx`:
  - default placement: has `bottom-0`, `rounded-t-2xl`, `md:top-1/2`, `md:rounded-xl`; the handle is
    present with `aria-hidden="true"` and `md:hidden`;
  - `variant="dialog"`: no handle, `top-1/2` without prefix;
  - the existing `sheet` case also asserts the handle, without `md:hidden`.
  - jsdom has no media queries, so class assertions are the test; the screenshots are the proof.
- `Dialog.stories.tsx`: the default story becomes the responsive one; keep a `Sheet` story.
- `AdminActionDialog` tests still pass with the hook gone (no test should mock the viewport for it any
  more; drop such a mock if one exists).
- Screenshots: `EventEditModal` open at 390 px (sheet with handle) and 1280 px (centred card), plus
  one `ConfirmDialog` at 390 px. Put them in the PR next to the « Ajouter le lieu » artboard.
