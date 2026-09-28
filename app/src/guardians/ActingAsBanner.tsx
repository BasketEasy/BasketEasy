import { Alert, AlertDescription } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import { useActingAs } from './useActingAs';

/**
 * « Vous répondez pour Léo Martin · Changer ». Mounted in ProtectedRoute
 * beside EmailVerificationBanner, for the same reason: the one place that
 * renders on every protected page at both breakpoints. Nothing on « Moi ».
 * A `status`, not an `alert`: it is a standing cue, not news to interrupt
 * a screen reader with on every page.
 */
export function ActingAsBanner() {
  const { persona, setSwitcherOpen } = useActingAs();
  if (!persona) return null;

  return (
    <div className="px-4 pt-3 md:px-6">
      <Alert role="status" className="flex flex-wrap items-center justify-between gap-2">
        <AlertDescription>
          <Text as="span" size="sm">
            Vous répondez pour{' '}
          </Text>
          <Text as="strong" variant="label" size="sm">
            {persona.firstName} {persona.lastName}
          </Text>
        </AlertDescription>
        <Button variant="outline" size="sm" onClick={() => setSwitcherOpen(true)}>
          Changer
        </Button>
      </Alert>
    </div>
  );
}
