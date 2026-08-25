import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { focusRing } from '../lib/focusRing';

const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
    focusRing,
  ),
  {
    variants: {
      variant: {
        default: 'bg-orange-text text-cream hover:bg-orange-text/90',
        secondary: 'bg-blue-green text-cream hover:bg-blue-green/90',
        outline: 'border border-border bg-transparent text-charcoal hover:bg-cream',
        ghost: 'bg-transparent text-charcoal hover:bg-cream',
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
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
