import { cva, type VariantProps } from 'class-variance-authority';
import type { SVGProps } from 'react';

/**
 * The two axes every icon shares, both closed.
 *
 * `tone` names the colour role. Icons paint with `currentColor`, so before
 * this existed the only way to colour one was a `text-*` class at the call
 * site — 25 of them, naming raw colours the caller had to know. `inherit` is
 * the default and stays the common case: an icon inside a coloured block (a
 * Badge, a filled button, a muted row) should take its parent's colour rather
 * than restate it.
 *
 * `size` names the square the icon occupies, replacing the `h-N w-N` pair
 * every call site used to repeat. The scale (Tailwind step → px):
 * `2xs` h-2.5 10 · `xs` h-3 12 · `sm` h-3.5 14 · `md` h-4 16 · `lg` h-5 20 ·
 * `xl` h-6 24 · `2xl` h-7 28 · `3xl` h-8 32 · `4xl` h-10 40 · `5xl` h-12 48 ·
 * `6xl` h-14 56. There is deliberately no default: an icon given no `size`
 * keeps the dimensions its context gives it (a Button's `[&_svg]` rule, the
 * viewBox), exactly as before. Sizing of non-icon elements stays caller-side.
 */
export const iconVariants = cva('', {
  variants: {
    tone: {
      inherit: '',
      primary: 'text-charcoal',
      secondary: 'text-muted',
      brand: 'text-orange-text',
      structure: 'text-blue-green',
      accent: 'text-gold',
      danger: 'text-error',
      success: 'text-success',
      inverse: 'text-cream',
    },
    size: {
      '2xs': 'h-2.5 w-2.5',
      xs: 'h-3 w-3',
      sm: 'h-3.5 w-3.5',
      md: 'h-4 w-4',
      lg: 'h-5 w-5',
      xl: 'h-6 w-6',
      '2xl': 'h-7 w-7',
      '3xl': 'h-8 w-8',
      '4xl': 'h-10 w-10',
      '5xl': 'h-12 w-12',
      '6xl': 'h-14 w-14',
    },
  },
  defaultVariants: { tone: 'inherit' },
});

export type IconProps = Omit<SVGProps<SVGSVGElement>, 'color'> & VariantProps<typeof iconVariants>;
