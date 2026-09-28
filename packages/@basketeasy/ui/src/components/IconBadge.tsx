import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const iconBadgeVariants = cva(
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
  {
    variants: {
      tone: {
        structure: 'bg-blue-green-tint text-blue-green',
        danger: 'bg-error-tint text-error',
      },
    },
    defaultVariants: { tone: 'structure' },
  },
);

export interface IconBadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof iconBadgeVariants> {}

/**
 * The tinted circle an icon sits in at the head of a row or an empty state.
 * It owns both the tint and the icon colour through `tone`, so a call site
 * never pairs a `bg-*-tint` with a matching text colour by hand. The icon
 * inside inherits the colour. Size stays caller-side (`h-7 w-7`, `h-14
 * w-14`): dimensions are composition; `h-10 w-10` is the default.
 */
export const IconBadge = forwardRef<HTMLSpanElement, IconBadgeProps>(
  ({ tone, className, ...props }, ref) => (
    <span ref={ref} className={cn(iconBadgeVariants({ tone }), className)} {...props} />
  ),
);
IconBadge.displayName = 'IconBadge';
