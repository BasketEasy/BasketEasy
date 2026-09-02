import { cn } from '../lib/cn';

/**
 * How a player's season points were scored, as one stacked bar: three-point
 * baskets, two-point baskets, free throws.
 *
 * It is a **composition of points scored, never a shooting accuracy** — the
 * FFBB scoresheet records makes and no attempts, so there is no made/attempted
 * ratio to show. That is why the bar carries raw point counts rather than
 * percentages, and why callers pair it with a legend that says so: a "45 %"
 * printed next to a basketball player's name reads as shooting percentage to
 * everyone who has ever seen a box score.
 *
 * Colour is a single-hue ramp (`points.three` → `points.two` → `points.free`),
 * darkest for the most expensive basket, because the three buckets are
 * ordered. Segments are separated by a 2px gap in the surface colour rather
 * than by hue distance, so adjacent steps stay distinguishable for a viewer
 * who can't separate them by colour at all.
 *
 * The counts are always readable in *some* text form, but not necessarily
 * twice: a caller pairing the bar with its own per-bucket legend (a count
 * next to each swatch) should set `showSegmentCounts={false}` — printing the
 * same number both inside a wide segment and again in the legend right below
 * it is the one thing worth avoiding. Leave it on for a caller with no
 * per-row legend (e.g. one shared legend above a whole table).
 *
 * A total of zero renders an empty sunk track. That covers both "hasn't
 * played" and "the running-score column was unreadable" — which of the two it
 * is, is the caller's to say next to the bar, since only the caller knows.
 */
export interface PointsRepartitionBarProps {
  threePointPoints: number;
  twoPointPoints: number;
  freeThrowPoints: number;
  /** Accessible name, e.g. "Répartition des points de Camille Roy". */
  label: string;
  /** Off for a caller that already prints each count in its own legend. */
  showSegmentCounts?: boolean;
  className?: string;
}

// Below this share a segment is too narrow to hold its own number legibly, so
// the count is left to the legend rather than clipped inside the bar.
const MIN_SHARE_FOR_INLINE_COUNT = 0.18;

const SEGMENTS = [
  { key: 'three', className: 'bg-points-three text-cream', name: '3 points' },
  { key: 'two', className: 'bg-points-two text-cream', name: '2 points' },
  // The lightest step of the ramp needs dark text on it, not cream.
  { key: 'free', className: 'bg-points-free text-charcoal', name: 'lancers francs' },
] as const;

export function PointsRepartitionBar({
  threePointPoints,
  twoPointPoints,
  freeThrowPoints,
  label,
  showSegmentCounts = true,
  className,
}: PointsRepartitionBarProps) {
  const counts = {
    three: threePointPoints,
    two: twoPointPoints,
    free: freeThrowPoints,
  };
  const total = counts.three + counts.two + counts.free;

  if (total <= 0) {
    return (
      <div
        role="img"
        aria-label={`${label} : aucun point`}
        className={cn('h-3.5 rounded bg-sunk', className)}
      />
    );
  }

  const spoken = SEGMENTS.filter((segment) => counts[segment.key] > 0)
    .map((segment) => `${counts[segment.key]} points sur ${segment.name}`)
    .join(', ');

  return (
    <div
      role="img"
      aria-label={`${label} : ${spoken}`}
      className={cn('flex h-3.5 items-stretch gap-0.5 overflow-hidden rounded', className)}
    >
      {SEGMENTS.map((segment) => {
        const count = counts[segment.key];
        if (count <= 0) {
          return null;
        }
        const share = count / total;
        return (
          <span
            key={segment.key}
            style={{ width: `${share * 100}%` }}
            className={cn(
              'flex items-center justify-center text-bar-count font-bold tabular',
              segment.className,
            )}
          >
            {showSegmentCounts && share >= MIN_SHARE_FOR_INLINE_COUNT ? count : null}
          </span>
        );
      })}
    </div>
  );
}
