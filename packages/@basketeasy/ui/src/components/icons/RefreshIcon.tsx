import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';

/** Manual refresh (Rafraîchir) — a circular arrow. */
export function RefreshIcon({ size, tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(iconVariants({ size, tone }), className)}
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-2.6-6.36" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}
