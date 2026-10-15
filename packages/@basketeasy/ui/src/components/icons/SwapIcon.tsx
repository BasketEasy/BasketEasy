import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';
/**
 * An exchange between two people (« Échange proposé ») — two opposed arrows.
 */
export function SwapIcon({ size, tone, className, ...props }: IconProps) {
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
      <path d="M4 8h14" />
      <path d="m14 4 4 4-4 4" />
      <path d="M20 16H6" />
      <path d="m10 12-4 4 4 4" />
    </svg>
  );
}
