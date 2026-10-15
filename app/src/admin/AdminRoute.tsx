import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { isImpersonating, useImpersonation } from '../impersonation/impersonationSession';
import { useImpersonationControls } from '../impersonation/useImpersonationControls';
import { useAccount } from '../auth/useAccount';
import { AdminLoginForm } from './AdminLoginForm';
import { AdminShell } from './AdminShell';
import { usePlatformSession } from './platformSession';

/**
 * Gates the whole /admin/* subtree on a live step-up session.
 *
 * Advisory only, and deliberately so: this decides what to *render*, never
 * what is allowed. The real enforcement is PlatformAdminGuard, which requires
 * both the ordinary access token and the step-up token on every request — so
 * a user who forces this component to render gets nothing but 403s.
 */
export function AdminRoute() {
  const { user, isLoading } = useAccount();
  const { session } = usePlatformSession();
  const impersonation = useImpersonation();
  const { exit } = useImpersonationControls();
  // Read once, at mount: a session this shell has just *started* (the
  // dialog's success, on its way to /dashboard) must not be ended by it.
  const [liveAtMount] = useState(isImpersonating);

  // Back into the back-office (the browser's Back button, a typed URL) with
  // an impersonation still live: that is leaving it. The back-office is never
  // shown while "me" is someone else.
  useEffect(() => {
    if (liveAtMount) exit('exited');
  }, [liveAtMount, exit]);

  // No AppHeader skeleton here, unlike ProtectedRoute: this shell has no
  // chrome whose shape is known before the session is.
  if (isLoading || impersonation) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ground p-4">
        <AdminLoginForm />
      </div>
    );
  }

  return <AdminShell />;
}
