import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';

/** The back affordance of a page bar or link — mirrors `ChevronRightIcon`. */
export function ChevronLeftIcon({ size, tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ size, tone }), className)}
      {...props}
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}
