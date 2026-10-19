import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';
/** Remove a row from a list (« Retirer … du match »). */
export function TrashIcon({ size, tone, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn(iconVariants({ size, tone }), className)}
      {...props}
    >
      <path d="M5 7h14" />
      <path d="M10 7V4h4v3" />
      <path d="M7 7l1 13h8l1-13" />
    </svg>
  );
}
