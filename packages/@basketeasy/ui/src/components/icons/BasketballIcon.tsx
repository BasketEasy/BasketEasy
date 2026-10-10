import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';
/** A basketball: the seams of the logomark, for « fait pour le basket ». */
export function BasketballIcon({ size, tone, className, ...props }: IconProps) {
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
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5v17" />
      <path d="M6.2 5.8c2.6 3.3 2.6 9.1 0 12.4M17.8 5.8c-2.6 3.3-2.6 9.1 0 12.4" />
    </svg>
  );
}
