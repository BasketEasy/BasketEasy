import { Button } from './Button';
import { cn } from '../lib/cn';

/**
 * The failure branch of a query. Before this existed, a failed request fell
 * through to the list's EmptyState — so the app told the user their data did
 * not exist when it had merely failed to load.
 */
export function QueryError({
  title = 'Chargement impossible',
  description = 'Les données n’ont pas pu être récupérées. Vérifiez votre connexion.',
  onRetry,
  isRetrying = false,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-lg border border-error/40 bg-error-tint p-4',
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        aria-hidden="true"
        className="h-5 w-5 shrink-0 text-error"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.4h.01" />
      </svg>
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-error">{title}</span>
        <span className="text-sm text-muted">{description}</span>
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          loading={isRetrying}
          onClick={onRetry}
          className="ml-auto"
        >
          Réessayer
        </Button>
      )}
    </div>
  );
}
