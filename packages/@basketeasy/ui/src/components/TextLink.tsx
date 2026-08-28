import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';

/**
 * An inline navigation link — text, not a button-shaped control.
 *
 * Three call sites hand-wrote three different recipes for this one role:
 * `font-semibold text-blue-green`, `text-sm font-bold text-blue-green` and
 * `text-sm font-semibold text-orange-text`. Colour and weight are now the
 * component's, not the caller's; `Button variant="ghost"` was never the
 * answer because it is a 44px-tall padded box.
 *
 * `asChild` renders a router `<Link>` with this styling, so in-app
 * navigation stays a real anchor.
 */
const textLinkVariants = cva(cn('rounded-sm font-semibold hover:underline', focusRing), {
  variants: {
    tone: {
      structure: 'text-blue-green',
      brand: 'text-orange-text',
    },
    size: {
      sm: 'text-sm',
      md: 'text-base',
    },
  },
  defaultVariants: { tone: 'structure', size: 'sm' },
});

export interface TextLinkProps
  extends AnchorHTMLAttributes<HTMLAnchorElement>, VariantProps<typeof textLinkVariants> {
  asChild?: boolean;
}

export const TextLink = forwardRef<HTMLAnchorElement, TextLinkProps>(
  ({ className, tone, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'a';
    return (
      <Comp ref={ref} className={cn(textLinkVariants({ tone, size }), className)} {...props} />
    );
  },
);
TextLink.displayName = 'TextLink';

export { textLinkVariants };
