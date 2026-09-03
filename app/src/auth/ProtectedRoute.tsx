import { Navigate, Outlet } from 'react-router-dom';
import { useAccount } from './useAccount';
import { AppHeader } from '../components/AppHeader';
import { AppBottomNav } from '../components/AppBottomNav';

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
    // safe-area-top lives here rather than on AppHeader itself: AppHeader
    // renders nothing on a phone (AppBottomNav carries the nav there
    // instead), so the header can no longer be trusted to pad the notch —
    // and this wrapper is the one element present in both cases. flex-col +
    // min-h-dvh + the flex-1 content wrapper is what lets AppBottomNav sit
    // in normal document flow (`position: sticky`, not `fixed` — see
    // TabBar) instead of floating above content: a `fixed` bar is pinned to
    // the layout viewport, which iOS Safari can leave shorter than the
    // actually-visible area once its own chrome auto-hides, opening a gap of
    // page background below the bar.
    <div className="safe-area-top flex min-h-dvh flex-col">
      <AppHeader />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      {/* Mounted beside the header, and only here: the bar is the primary
          navigation of the logged-in app, so it must never appear on a
          public route. It renders nothing above the desktop breakpoint. */}
      <AppBottomNav />
    </div>
  );
}
