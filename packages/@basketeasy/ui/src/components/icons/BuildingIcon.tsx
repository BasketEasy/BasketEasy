import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';
/** Partner clubs / CTC (Clubs partenaires). */
export function BuildingIcon({ size, tone, className, ...props }: IconProps) {
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
      <rect x="4" y="3" width="10" height="18" />
      <rect x="14" y="9" width="6" height="12" />
      <path d="M7 7h1M10 7h1M7 11h1M10 11h1M7 15h1M10 15h1" />
      <path d="M17 12.5h.01M17 16h.01" />
    </svg>
  );
}
