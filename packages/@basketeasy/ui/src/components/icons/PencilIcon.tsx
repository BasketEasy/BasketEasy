import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';
/** Edit a record by hand (« Modifier les stats »). */
export function PencilIcon({ size, tone, className, ...props }: IconProps) {
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
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </svg>
  );
}
