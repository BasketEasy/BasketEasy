import { type SVGProps } from 'react';

/** Team admins (Administrateurs). */
export function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 3.5 5 6v5.5c0 4.6 3 7.6 7 9 4-1.4 7-4.4 7-9V6l-7-2.5Z" />
      <path d="m9.5 12 1.8 1.8L14.5 10" />
    </svg>
  );
}
