import { Navigate } from 'react-router-dom';
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

  // No AppHeader skeleton here, unlike ProtectedRoute: this shell has no
  // chrome whose shape is known before the session is.
  if (isLoading) {
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
