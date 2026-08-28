/**
 * The semantic colours a status indicator can take, shared by the roster,
 * RSVP and convocation breakdowns.
 *
 * These used to be raw Tailwind strings passed between components as
 * `colorClassName` / `statusClassName` props — a caller choosing another
 * component's colour, which is exactly what the closed-prop-API rule
 * forbids. It is a subset of `Text`'s own `tone` axis, so a status indicator
 * hands the value straight to `Text` rather than translating it.
 */
export type StatusTone = 'brand' | 'structure' | 'secondary' | 'success' | 'danger';
