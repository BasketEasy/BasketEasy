import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { Text } from './Text';

/**
 * The Parquet signature element: the coloured column on the left of every
 * event card, carrying the kickoff time over the event's type.
 *
 * Fill is the type, and only the type — solid `bg-blue-green` for a MATCH
 * (the structural colour, at its heaviest weight, so a match reads as the
 * event that matters from across a scrolling list), a bordered `surface-2`
 * step for a TRAINING. That is why there is no `tone` prop: a caller cannot
 * choose the colour, it follows from what the event is.
 *
 * It lived inline inside `TeamEventsAgenda`'s card until the player-first
 * revamp put the same block on the event detail hero, the player home, the
 * results feed and the manager's pilot band. Five copies of a two-branch
 * colour ternary is exactly the drift the closed-prop rule exists to stop.
 *
 * `type` is spelled out as a union rather than imported as `EventType`: the
 * design system deliberately has no dependency on `@basketeasy/types`, and
 * the union is structurally identical, so a `TeamEvent['type']` still passes.
 */
export type TimeBlockEventType = 'MATCH' | 'TRAINING';

const TYPE_SHORT_LABELS: Record<TimeBlockEventType, string> = {
  // Abbreviated because the column is 80-96px wide and the label is set
  // uppercase with wide-caps tracking — "Entraînement" does not fit. Every
  // wider surface spells the word out in full.
  TRAINING: 'Entraîn.',
  MATCH: 'Match',
};

const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

const timeBlockVariants = cva(
  'flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-md text-center',
  {
    variants: {
      type: {
        MATCH: 'bg-blue-green text-cream',
        TRAINING: 'border border-border-strong bg-surface-2 text-charcoal',
      },
      size: {
        sm: 'w-16 py-3',
        md: 'w-20 py-4 sm:w-24',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

// The sm column is 64px: "ENTRAÎN." at wide-caps tracking is wider than that
// and truncated to "ENTRA…" (even eyebrow tracking overflows by 2px when the
// heading font falls back), so the compact block drops the tracking.
const LABEL_TRACKING_CLASSES: Record<
  NonNullable<VariantProps<typeof timeBlockVariants>['size']>,
  string
> = {
  sm: 'tracking-normal',
  md: 'tracking-wide-caps',
};

const TIME_SIZE_CLASSES: Record<
  NonNullable<VariantProps<typeof timeBlockVariants>['size']>,
  string
> = {
  sm: 'text-xl',
  md: 'text-2xl sm:text-3xl',
};

export interface TimeBlockProps extends VariantProps<typeof timeBlockVariants> {
  type: TimeBlockEventType;
  /** ISO timestamp. Only its time-of-day is rendered. */
  startsAt: string;
  /**
   * False for an imported fixture whose kickoff the federation has not set
   * yet — the row carries a midnight placeholder that must never be rendered
   * as if it were a real time.
   */
  timeConfirmed: boolean;
  className?: string;
}

export function TimeBlock({ type, startsAt, timeConfirmed, size, className }: TimeBlockProps) {
  return (
    <div className={cn(timeBlockVariants({ type, size }), className)}>
      {timeConfirmed ? (
        <Text
          as="span"
          variant="display"
          size="2xl"
          tone="inherit"
          className={cn('tabular leading-none', TIME_SIZE_CLASSES[size ?? 'md'])}
        >
          {timeFormatter.format(new Date(startsAt))}
        </Text>
      ) : (
        // w-full + text-center (rather than letting the span shrink-to-fit
        // and get centered by the flex column) keeps this two-word label from
        // overflowing the narrow column and getting clipped by the card's
        // overflow-hidden — it was rendering as a mangled fragment
        // ("ONFIRME") on a narrow viewport before this.
        <Text
          as="span"
          variant="eyebrow"
          tone="inherit"
          className="w-full break-words px-0.5 leading-tight tracking-wide-caps"
        >
          à confirmer
        </Text>
      )}
      <Text
        as="span"
        variant="eyebrow"
        tone="inherit"
        className={cn(
          'min-w-0 max-w-full truncate opacity-80',
          LABEL_TRACKING_CLASSES[size ?? 'md'],
        )}
      >
        {TYPE_SHORT_LABELS[type]}
      </Text>
    </div>
  );
}

export { timeBlockVariants };
