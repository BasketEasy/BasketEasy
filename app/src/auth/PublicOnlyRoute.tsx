import { Navigate, Outlet } from 'react-router-dom';
import { useAccount } from './useAccount';

// Guards routes like /login and /register that only make sense for a
// logged-out visitor — an already-authenticated user is sent straight to
// their dashboard instead of seeing the auth forms again.
export function PublicOnlyRoute() {
  const { user, isLoading } = useAccount();

  // Unlike ProtectedRoute, this stays a bare `null` while loading —
  // deliberately asymmetric. /login has no app shell worth preserving
  // (no nav, no brand-plus-skeleton state to paint early); the auth form
  // itself is the only content on this route.
  if (isLoading) {
    return null;
  }

  if (user) {
    if (!user.firstName) {
      return <Navigate to="/account" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
