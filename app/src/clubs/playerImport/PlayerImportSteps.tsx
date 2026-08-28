import { Check } from '@basketeasy/ui/icons/check';
import { cn } from '@basketeasy/ui/cn';

const PLAYER_IMPORT_STEP_LABELS = ['Fichier', 'Colonnes', 'Aperçu'] as const;

/**
 * Three-stop step indicator for the import wizard. Kept local to this
 * feature rather than promoted to @basketeasy/ui: it composes only
 * existing tokens, and nothing else in the app needs a numbered step row
 * yet. The repo's own precedent for a small bespoke on-brand control
 * living next to its one caller is EventRsvpControl's segmented toggle
 * (app/src/clubs/EventRsvpControl.tsx), not a shared primitive — a
 * generic multi-purpose Stepper component would be speculative for a
 * single 3-step flow, so it isn't built here.
 */
export function PlayerImportSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol aria-label="Étapes de l'import" className="flex list-none items-center gap-2">
      {PLAYER_IMPORT_STEP_LABELS.map((label, index) => {
        const isDone = index < current;
        const isCurrent = index === current;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  isDone && 'bg-blue-green text-cream',
                  isCurrent && 'bg-orange-text text-cream',
                  !isDone && !isCurrent && 'border border-border-strong bg-sunk text-muted',
                )}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={cn('text-sm font-medium', isCurrent ? 'text-charcoal' : 'text-muted')}
              >
                {label}
                {isCurrent && <span className="sr-only"> (étape actuelle)</span>}
              </span>
            </div>
            {index < PLAYER_IMPORT_STEP_LABELS.length - 1 && (
              <span aria-hidden="true" className="h-0.5 flex-grow rounded-sm bg-blue-green/20" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
