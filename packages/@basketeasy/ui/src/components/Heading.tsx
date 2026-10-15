import { type HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

/**
 * `font-heading`/`text-charcoal` are baked in here rather than left to callers.
 *
 * They used to come from a global `h1,h2,h3 { font-family: ... }` rule in
 * globals.css, which meant Heading only rendered correctly by accident of the
 * tag it happened to emit: not one of the app's call sites passed the font
 * class the component's own contract asked for, and any h4-h6 level (or a
 * Heading rendering a non-heading tag) would silently fall back to the body
 * font. CardTitle and AlertTitle already own their font and colour; this
 * brings the one text primitive that didn't into line.
 */
// break-words is in the base string, not left to call sites: an h1 whose
// content can be a single unbroken token (an email address in the dashboard
// greeting) otherwise widens the page rather than wrapping.
const headingVariants = cva('break-words font-heading uppercase', {
  variants: {
    /** Colour is a tone, never a caller-side text-* class. */
    tone: {
      primary: 'text-charcoal',
      inverse: 'text-cream',
    },
    size: {
      /** The event page's h1: one step smaller on a phone. */
      hero: 'text-4xl md:text-5xl',
      /** A marketing page's h1 (the landing hero): the largest step, two smaller on a phone. */
      display: 'text-5xl md:text-7xl',
      /** A marketing page's section title (« Vous reconnaissez cette semaine ? »). */
      section: 'text-4xl md:text-5xl',
      /** A marketing page's feature title, under a section. */
      feature: 'text-3xl md:text-4xl',
      '6xl': 'text-6xl',
      '5xl': 'text-5xl',
      '4xl': 'text-4xl',
      '3xl': 'text-3xl',
      '2xl': 'text-2xl',
      xl: 'text-xl',
    },
  },
  defaultVariants: { tone: 'primary' },
});

export type HeadingLevel = 'h1' | 'h2' | 'h3';

const defaultSizeByLevel: Record<
  HeadingLevel,
  NonNullable<VariantProps<typeof headingVariants>['size']>
> = {
  h1: '4xl',
  h2: '3xl',
  h3: 'xl',
};

export interface HeadingProps
  extends HTMLAttributes<HTMLHeadingElement>, VariantProps<typeof headingVariants> {
  as?: HeadingLevel;
}

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ as = 'h2', size, tone, className, ...props }, ref) => {
    const Tag = as;
    return (
      <Tag
        ref={ref}
        className={cn(headingVariants({ size: size ?? defaultSizeByLevel[as], tone }), className)}
        {...props}
      />
    );
  },
);
Heading.displayName = 'Heading';
