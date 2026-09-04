import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const countBadgeVariants = cva(
  'inline-flex items-center justify-center rounded-full px-1 text-center font-bold tabular',
  {
    variants: {
      // Orange is the rare, sharp accent — an outstanding count is exactly
      // the "something is waiting for you" signal it exists for. `structure`
      // is for a count that is merely informational.
      tone: {
        brand: 'bg-orange-text text-cream',
        structure: 'bg-blue-green text-cream',
      },
      size: {
        // The bottom bar's pip: small enough to overlap an icon.
        sm: 'min-w-4 text-bar-count leading-4',
        md: 'min-w-5 text-xs leading-5',
      },
    },
    defaultVariants: { tone: 'brand', size: 'sm' },
  },
);

export interface CountBadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof countBadgeVariants> {
  count: number;
  /**
   * Counts above this render as "N+". Keeps a three-digit unread count from
   * stretching a pip that overlaps an icon.
   */
  max?: number;
}

/**
 * The unread/outstanding-count pip, shared by the bottom bar's tab items and
 * the header's notification bell so the two can't drift.
 *
 * It renders `null` at zero rather than an empty circle, and is
 * `aria-hidden` throughout: the number is a graphic here, and has to reach a
 * screen reader through the accessible name of whatever it decorates (see
 * `TabBarItem`'s `accessibleName`, and `NotificationBell`'s `aria-label`).
 * A count announced twice — once as the control's name, once as loose text
 * inside it — is worse than one announced well.
 */
export const CountBadge = forwardRef<HTMLSpanElement, CountBadgeProps>(
  ({ count, max = 99, tone, size, className, ...props }, ref) => {
    if (count <= 0) return null;

    return (
      <span
        ref={ref}
        aria-hidden="true"
        className={cn(countBadgeVariants({ tone, size }), className)}
        {...props}
      >
        {count > max ? `${max}+` : count}
      </span>
    );
  },
);
CountBadge.displayName = 'CountBadge';
