import { Navigate, Outlet } from 'react-router-dom';
import { PageContainer } from '@basketeasy/ui/page-container';
import { QueryError } from '@basketeasy/ui/query-error';
import { useAccount } from './useAccount';
import { ActiveClubProvider } from './ActiveClubContext';
import { AppHeader } from '../components/AppHeader';
import { AppBottomNav } from '../components/AppBottomNav';
import { EmailVerificationBanner } from './EmailVerificationBanner';
import { ActingAsProvider } from '../guardians/ActingAsContext';
import { ActingAsBanner } from '../guardians/ActingAsBanner';
import { PersonaSheet } from '../guardians/PersonaSheet';
import { ImpersonationBanner } from '../impersonation/ImpersonationBanner';

export function ProtectedRoute() {
  const { user, isLoading, isError, retry } = useAccount();

  // Returning null here used to paint a blank white screen on every hard
  // load of a protected route — the header's shape is known before the
  // user is, so render it and let the nav fill in once the session
  // resolves.
  if (isLoading) {
    return <AppHeader isResolving />;
  }

  // The restore gave up on a network or server failure: that is not "signed
  // out", so say so and offer a retry instead of bouncing to /login.
  if (isError) {
    return (
      <>
        <AppHeader isResolving />
        <PageContainer>
          <QueryError
            title="Connexion impossible"
            description="Nous n’avons pas pu vérifier votre session. Vérifiez votre connexion, puis réessayez."
            onRetry={retry}
          />
        </PageContainer>
      </>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    // ActiveClubProvider needs `user` already resolved (per its own comment
    // in ActiveClubContext.tsx), so it wraps only this branch — never the
    // isLoading one above, which renders AppHeader in its isResolving mode
    // precisely so it doesn't touch club data yet — and never the public
    // routes outside ProtectedRoute, none of which read useActiveClub().
    <ActiveClubProvider>
      {/* Inside the router and the session, around everything that reads a
          « me »: the header chip, the banner, and every persona-scoped query
          on the page. */}
      <ActingAsProvider>
        {/* safe-area-top lives here rather than on AppHeader itself: AppHeader
          renders a different bar at each breakpoint (a compact one on a
          phone, where AppBottomNav carries the nav), so this wrapper is the
          one element that pads the notch the same way in both. flex-col +
          min-h-dvh + the flex-1 content wrapper is what lets AppBottomNav sit
          in normal document flow (`position: sticky`, not `fixed` — see
          TabBar) instead of floating above content: a `fixed` bar is pinned to
          the layout viewport, which iOS Safari can leave shorter than the
          actually-visible area once its own chrome auto-hides, opening a gap of
          page background below the bar. */}
        <div className="safe-area-top flex min-h-dvh flex-col">
          <AppHeader />
          {/* First under the header, above every other banner: while it
            shows, nothing on the page is the reader's own. */}
          <ImpersonationBanner />
          {/* The one place that renders on every protected page at *both*
            breakpoints — inside AppHeader the banner would be invisible on a
            phone, inside AppBottomNav invisible on a desktop. It renders
            nothing once the address is confirmed. */}
          <EmailVerificationBanner />
          <ActingAsBanner />
          {/* min-w-0: without it this flex item (and PageContainer's <main>
            inside it, itself a flex item here for the first time now that
            Outlet is wrapped) refuses to shrink below its content's intrinsic
            width — a wide unwrapped row (e.g. TeamDetailPage's five-tab
            TabsList) then pushes the whole flex-col chain wider than the
            viewport, which is what forces mobile Safari/Chrome to zoom the
            entire page out instead of letting TabsList's own overflow-x-auto
            scroll it in place. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <Outlet />
          </div>
          {/* Mounted beside the header, and only here: the bar is the primary
            navigation of the logged-in app, so it must never appear on a
            public route. It renders nothing above the desktop breakpoint. */}
          <AppBottomNav />
          <PersonaSheet />
        </div>
      </ActingAsProvider>
    </ActiveClubProvider>
  );
}
