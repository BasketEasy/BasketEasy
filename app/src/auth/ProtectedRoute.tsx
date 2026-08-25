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
      {/* A plain div, not <main> — every protected page already renders its
          own <main> via PageContainer (packages/@basketeasy/ui/src/components/PageContainer.tsx),
          so a <main> here would nest a second <main> landmark inside the
          first on every route, which is invalid HTML and confusing to
          assistive tech. This div exists solely to give the skip link a
          single, un-droppable id="contenu" target that lives above the
          per-page Outlet instead of on each page individually. */}
      <div id="contenu">
        <Outlet />
      </div>
    </>
  );
}
