/**
 * The single focus-visible recipe for every interactive primitive.
 *
 * Before this existed the package had five different recipes: Button set
 * ring-offset-2 with no ring-offset colour (so the halo rendered white on a
 * cream page), Checkbox set the colour but not the width, Select used
 * `focus:` where Input used `focus-visible:`, and Tabs/DropdownMenu had
 * nothing at all. Change the ring here, not at a call site.
 *
 * Implemented with `outline`, not `ring`. Tailwind's ring paints the offset
 * gap with a solid colour, which means the recipe has to name the background
 * it sits on — and this one recipe is composed by controls on all four rungs
 * of the surface ladder. `ring-offset-surface` (#FFFCF7) was rendering a
 * near-white halo around every segmented control, which sits on `sunk`
 * (#E9DDCA). A real outline leaves its offset transparent, so the gap shows
 * whatever ground the control is actually on, and the recipe stays correct
 * everywhere without a per-ground variant.
 *
 * It also keeps focus out of `box-shadow`, so a component's own `shadow-*`
 * and its focus state can no longer clobber each other.
 */
export const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange';
