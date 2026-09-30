import { cn } from '../../lib/cn';
import { iconVariants, type IconProps } from '../../lib/iconVariants';

/** The open/closed affordance of a disclosure — `SectionAccordion`'s trigger. */
export function ChevronDownIcon({ tone, className, ...props }: IconProps) {
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
      <path d="M5 9l7 7 7-7" />
    </svg>
  );
}
