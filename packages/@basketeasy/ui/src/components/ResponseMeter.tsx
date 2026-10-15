import { cn } from '../lib/cn';

/**
 * How a squad has answered a convocation, as one proportional bar: oui /
 * peut-être / non / sans réponse.
 *
 * The four buckets map to a closed tone set inside the component —
 * `success` / `structure` / `danger` / `neutral` — because a caller choosing
 * the colour of "non" is exactly the caller-side colour the project forbids.
 * There is no `tone` prop for the same reason: the meaning of each segment is
 * fixed by which count it is.
 *
 * `role="img"` with the counts in the accessible name, so the bar is never a
 * colour-only signal: everything it shows is also said, in French, in the
 * order the segments are drawn. Callers commonly print the same counts as a
 * text line above it — that is a duplicate for a sighted reader, never the
 * only copy.
 *
 * Deliberately *not* merged with `PointsRepartitionBar` into one
 * `ProportionBar`: that one carries its own single-hue points ramp, in-bar
 * numerals and a documented "this is not a shooting percentage" legend rule.
 * Two proportional bars with different jobs is not yet a pattern.
 */
export interface ResponseMeterProps {
  going: number;
  maybe: number;
  notGoing: number;
  /** Roster members who have not answered at all — no `EventRsvp` row. */
  pending: number;
  size?: 'sm' | 'md';
  className?: string;
}

const SEGMENTS = [
  { key: 'going', className: 'bg-success', noun: 'oui' },
  { key: 'maybe', className: 'bg-blue-green-2', noun: 'peut-être' },
  { key: 'notGoing', className: 'bg-error', noun: 'non' },
  // The neutral tone is the track's own colour, so "sans réponse" reads as
  // the part of the bar that is not filled in rather than as a fourth answer.
  { key: 'pending', className: 'bg-sunk', noun: 'sans réponse' },
] as const;

const SIZE_CLASSES: Record<NonNullable<ResponseMeterProps['size']>, string> = {
  sm: 'h-1.5',
  md: 'h-2',
};

export function ResponseMeter({
  going,
  maybe,
  notGoing,
  pending,
  size = 'md',
  className,
}: ResponseMeterProps) {
  const counts = { going, maybe, notGoing, pending };
  const total = counts.going + counts.maybe + counts.notGoing + counts.pending;

  const track = cn('flex overflow-hidden rounded-full bg-sunk', SIZE_CLASSES[size], className);

  // Nobody on the roster at all: an empty track, and no division by zero.
  if (total <= 0) {
    return <div role="img" aria-label="Présences : aucun participant" className={track} />;
  }

  const spoken = SEGMENTS.filter((segment) => counts[segment.key] > 0)
    .map((segment) => `${counts[segment.key]} ${segment.noun}`)
    .join(', ');

  return (
    <div role="img" aria-label={`Présences : ${spoken}`} className={track}>
      {SEGMENTS.map((segment) => {
        const count = counts[segment.key];
        if (count <= 0) {
          return null;
        }
        return (
          <span
            key={segment.key}
            style={{ width: `${(count / total) * 100}%` }}
            className={segment.className}
          />
        );
      })}
    </div>
  );
}
