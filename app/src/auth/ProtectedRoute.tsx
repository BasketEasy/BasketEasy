import { Navigate, Outlet } from 'react-router-dom';
import { useAccount } from './useAccount';
import { AppHeader } from '../components/AppHeader';

export function ProtectedRoute() {
  const { user, isLoading } = useAccount();

  // Returning null here used to paint a blank white screen on every hard
  // load of a protected route — the header's shape is known before the
  // user is, so render it and let the nav fill in once the session
  // resolves.
  if (isLoading) {
    return <AppHeader isResolving />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <AppHeader />
      <Outlet />
    </>
  );
}
