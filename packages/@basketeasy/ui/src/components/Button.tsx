import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';
import { Spinner } from './icons/Spinner';

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-1.5 rounded-md font-bold transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    focusRing,
  ),
  {
    variants: {
      variant: {
        default: 'bg-orange-text text-cream hover:bg-orange-hover shadow-segment-active',
        secondary: 'bg-blue-green text-cream hover:bg-blue-green-2 shadow-segment-active',
        // hover:bg-cream used to be invisible: the page itself was cream.
        outline: 'border border-border-strong bg-surface-2 text-charcoal hover:bg-sunk',
        ghost: 'bg-transparent text-charcoal hover:bg-blue-green-tint',
        destructive: 'bg-error text-cream hover:bg-error/90 shadow-segment-active',
        /** An outline control on a filled dark ground (a `critical` Alert). */
        inverse: 'border border-cream/70 bg-transparent text-cream hover:bg-cream/10',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        default: 'h-11 px-4 text-sm md:h-10',
        lg: 'h-12 px-6 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      asChild = false,
      disabled,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) => {
    // asChild renders a <Link> (or any single child) with button styling, so
    // navigation stays a real anchor instead of a button with an onClick.
    // Branched (rather than a shared Comp) because Slot requires exactly one
    // React element child — a `{loading && …}` sibling next to `children`,
    // even when it collapses to `false`, still counts as a second child and
    // makes Slot throw at runtime.
    if (asChild) {
      if (process.env.NODE_ENV !== 'production' && (loading || disabled)) {
        console.warn(
          'Button: `loading` and `disabled` have no effect with `asChild`; render a disabled button instead of a link.',
        );
      }
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
        type={type}
      >
        {loading && <Spinner className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
