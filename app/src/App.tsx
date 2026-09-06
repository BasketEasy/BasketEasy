import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Toaster } from '@basketeasy/ui/toaster';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PublicOnlyRoute } from './auth/PublicOnlyRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { InviteAcceptPage } from './pages/InviteAcceptPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClubCreatePage } from './pages/ClubCreatePage';
import { MembersPage } from './pages/MembersPage';
import { PlayerImportPage } from './pages/PlayerImportPage';
import { AccountPage } from './pages/AccountPage';
import { TeamDetailPage } from './pages/TeamDetailPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { MyTeamsPage } from './pages/MyTeamsPage';
import { ResultsPage } from './pages/ResultsPage';
import { NotFoundPage } from './pages/NotFoundPage';

// The back-office is lazy-loaded, and that is the point rather than an
// optimisation: it must never render, fetch, or *bundle* admin-only code for
// the overwhelming majority of users who are not platform staff. A static
// import would ship it to every club volunteer's browser.
const AdminRoute = lazy(() =>
  import('./admin/AdminRoute').then((m) => ({ default: m.AdminRoute })),
);
const AdminRetentionPage = lazy(() =>
  import('./admin/AdminRetentionPage').then((m) => ({ default: m.AdminRetentionPage })),
);
const AdminUsersPage = lazy(() =>
  import('./admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })),
);
const AdminUserDetailPage = lazy(() =>
  import('./admin/AdminUserDetailPage').then((m) => ({ default: m.AdminUserDetailPage })),
);

export default function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        {/* Top level, beside /invite/:token and for the same reason: each of
            these is opened from an inbox and must work regardless of session
            state — PublicOnlyRoute would bounce a visitor who still holds a
            stale session straight to the dashboard mid-recovery. */}
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/my-teams" element={<MyTeamsPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/clubs/new" element={<ClubCreatePage />} />
          <Route path="/clubs/:clubId/members" element={<MembersPage />} />
          <Route path="/clubs/:clubId/import-players" element={<PlayerImportPage />} />
          <Route path="/clubs/:clubId/teams/:teamId" element={<TeamDetailPage />} />
          <Route
            path="/clubs/:clubId/teams/:teamId/events/:eventId"
            element={<EventDetailPage />}
          />
          <Route path="/clubs/*" element={<NotFoundPage />} />
        </Route>

        {/* Its own top-level subtree, outside ProtectedRoute: the back-office
            deliberately wears no product chrome — no AppHeader, no club
            switcher, no bottom nav — so that it never reads as a support
            dashboard to browse. AdminRoute does its own session check. */}
        <Route
          path="/admin"
          element={
            <Suspense fallback={null}>
              <AdminRoute />
            </Suspense>
          }
        >
          <Route index element={<AdminRetentionPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:userId" element={<AdminUserDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </AppErrorBoundary>
  );
}
