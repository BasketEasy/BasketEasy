import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';

/** A row's own "tap for more" affordance — never a call to action on its own. */
export function ChevronRightIcon({ tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ tone }), className)}
      {...props}
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}
