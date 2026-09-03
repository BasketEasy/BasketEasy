import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';
/**
 * Directions to a venue (« Itinéraire ») — two waypoints joined by a winding
 * path, rather than a map pin: the action is "take me there", not "here is a
 * place".
 */
export function RouteIcon({ tone, className, ...props }: IconProps) {
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
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18h6a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H15" />
    </svg>
  );
}
