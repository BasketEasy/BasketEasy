import { Navigate, Outlet } from 'react-router-dom';
import { useAccount } from './useAccount';

export function ProtectedRoute() {
  const { user, isLoading } = useAccount();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
