import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * A hairline between two groups — decorative, so hidden from assistive tech
 * (the grouping is carried by the markup, not by the line).
 *
 * `tone` follows the surface it sits on: `neutral` on the ordinary ladder,
 * `brand` inside a brand-toned container (the decision band), where a grey
 * line reads as a hole in the tint. Length is the caller's (`h-4` on a
 * vertical one in a row of figures): that is composition, not look.
 */
const dividerVariants = cva('shrink-0', {
  variants: {
    orientation: {
      horizontal: 'h-px w-full',
      vertical: 'w-px self-stretch',
    },
    tone: {
      neutral: 'bg-border',
      brand: 'bg-orange/40',
    },
  },
  defaultVariants: { orientation: 'horizontal', tone: 'neutral' },
});

export interface DividerProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'>, VariantProps<typeof dividerVariants> {}

export function Divider({ orientation, tone, className, ...props }: DividerProps) {
  return (
    <span
      aria-hidden="true"
      className={cn('block', dividerVariants({ orientation, tone }), className)}
      {...props}
    />
  );
}
