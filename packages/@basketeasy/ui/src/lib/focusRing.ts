/**
 * The single focus-visible recipe for every interactive primitive.
 *
 * Before this existed the package had five different recipes: Button set
 * ring-offset-2 with no ring-offset colour (so the halo rendered white on a
 * cream page), Checkbox set the colour but not the width, Select used
 * `focus:` where Input used `focus-visible:`, and Tabs/DropdownMenu had
 * nothing at all. Change the ring here, not at a call site.
 */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
