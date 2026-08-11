import { type HTMLAttributes, type ReactNode, forwardRef } from 'react';
import { Card, CardContent } from './Card';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Presentational shell for "nothing here yet" states, composed from Card.
 * No page-specific logic or default copy — callers own icon/title/description/action.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon, title, description, action, ...props }, ref) => (
    <Card ref={ref} className={className} {...props}>
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        {icon}
        <p className="font-heading text-xl font-bold text-charcoal">{title}</p>
        {description && <p className="text-sm text-muted">{description}</p>}
        {action}
      </CardContent>
    </Card>
  ),
);
EmptyState.displayName = 'EmptyState';
