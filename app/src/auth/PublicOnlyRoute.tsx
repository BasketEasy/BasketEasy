import { Navigate, Outlet } from 'react-router-dom';
import { useAccount } from './useAccount';

// Guards routes like /login and /register that only make sense for a
// logged-out visitor — an already-authenticated user is sent straight to
// their dashboard instead of seeing the auth forms again.
export function PublicOnlyRoute() {
  const { user, isLoading } = useAccount();

  if (isLoading) {
    return null;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
