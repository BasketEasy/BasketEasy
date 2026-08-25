import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';
import { Spinner } from './icons/Spinner';

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    focusRing,
  ),
  {
    variants: {
      variant: {
        default: 'bg-orange-text text-cream hover:bg-orange-hover shadow-sm hover:shadow',
        secondary: 'bg-blue-green text-cream hover:bg-blue-green-2',
        // hover:bg-cream used to be invisible: the page itself was cream.
        outline: 'border border-border-strong bg-surface text-charcoal hover:bg-sunk',
        ghost: 'bg-transparent text-charcoal hover:bg-blue-green-tint',
        destructive: 'bg-error text-cream hover:bg-error/90',
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
    { className, variant, size, loading = false, asChild = false, disabled, children, ...props },
    ref,
  ) => {
    // asChild renders a <Link> (or any single child) with button styling, so
    // navigation stays a real anchor instead of a button with an onClick.
    // The button-only attributes are omitted in that mode.
    const Comp = asChild ? Slot : 'button';
    const buttonOnly = asChild
      ? {}
      : {
          type: props.type ?? 'button',
          disabled: disabled || loading,
          'aria-busy': loading || undefined,
        };

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...buttonOnly}
        {...props}
      >
        {loading && !asChild && (
          <Spinner className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        )}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
