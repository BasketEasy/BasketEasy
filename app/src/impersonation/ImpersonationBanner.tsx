import { useEffect, useState } from 'react';
import { Alert } from '@basketeasy/ui/alert';
import { Button } from '@basketeasy/ui/button';
import { Text } from '@basketeasy/ui/text';
import { subscribeToImpersonationExpiry } from '../api/client';
import { useImpersonation } from './impersonationSession';
import { useImpersonationControls } from './useImpersonationControls';

const TICK_MS = 15_000;

function minutesLeft(expiresAt: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAt - now) / 60_000));
}

/**
 * « Vue en tant que Jean Dupont · lecture seule · 12 min · Quitter ».
 * Mounted in ProtectedRoute right under AppHeader, the one place that renders
 * on every product page at both breakpoints. Solid danger fill on purpose:
 * it must never be mistaken for product chrome, so a screenshot taken during
 * a session can't be passed off as the subject's own.
 *
 * It also owns the two ways a session ends by itself: its own clock reaching
 * `expiresAt`, and a product call whose token the server refused (the
 * session was ended elsewhere, or the admin's grant was revoked).
 */
export function ImpersonationBanner() {
  const impersonation = useImpersonation();
  const { exit } = useImpersonationControls();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => subscribeToImpersonationExpiry(() => exit('expired')), [exit]);

  const expiresAt = impersonation?.expiresAt;
  useEffect(() => {
    if (expiresAt === undefined) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= expiresAt) exit('expired');
    };
    tick();
    const interval = window.setInterval(tick, TICK_MS);
    // The last tick can land up to TICK_MS late; this one lands on time.
    const deadline = window.setTimeout(tick, Math.max(0, expiresAt - Date.now()));
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(deadline);
    };
  }, [expiresAt, exit]);

  if (!impersonation) return null;

  const minutes = minutesLeft(impersonation.expiresAt, now);

  return (
    <Alert variant="critical" role="status" className="flex items-center gap-3">
      <Text as="p" size="sm" tone="inherit" className="min-w-0 flex-1">
        <Text as="strong" variant="label" size="sm" tone="inherit">
          Vue en tant que {impersonation.displayName}
        </Text>{' '}
        · lecture seule ·{' '}
        <Text as="span" size="sm" tone="inherit" className="tabular">
          {minutes} min
        </Text>
      </Text>
      <Button variant="inverse" size="sm" onClick={() => exit('exited')}>
        Quitter
      </Button>
    </Alert>
  );
}
