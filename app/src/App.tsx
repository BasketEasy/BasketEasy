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
import { GuardianInvitePage } from './pages/GuardianInvitePage';
import { ChildProfilePage } from './pages/ChildProfilePage';
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
import { MentionsLegalesPage } from './pages/legal/MentionsLegalesPage';
import { PolitiqueConfidentialitePage } from './pages/legal/PolitiqueConfidentialitePage';
import { CGUPage } from './pages/legal/CGUPage';
import { RegistreTraitementsPage } from './pages/legal/RegistreTraitementsPage';

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
const AdminClubsPage = lazy(() =>
  import('./admin/AdminClubsPage').then((m) => ({ default: m.AdminClubsPage })),
);
const AdminClubDetailPage = lazy(() =>
  import('./admin/AdminClubDetailPage').then((m) => ({ default: m.AdminClubDetailPage })),
);
const AdminTeamsPage = lazy(() =>
  import('./admin/AdminTeamsPage').then((m) => ({ default: m.AdminTeamsPage })),
);
const AdminTeamDetailPage = lazy(() =>
  import('./admin/AdminTeamDetailPage').then((m) => ({ default: m.AdminTeamDetailPage })),
);
const AdminUsersPage = lazy(() =>
  import('./admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })),
);
const AdminUserDetailPage = lazy(() =>
  import('./admin/AdminUserDetailPage').then((m) => ({ default: m.AdminUserDetailPage })),
);
const AdminPlayersPage = lazy(() =>
  import('./admin/AdminPlayersPage').then((m) => ({ default: m.AdminPlayersPage })),
);
const AdminPlayerDetailPage = lazy(() =>
  import('./admin/AdminPlayerDetailPage').then((m) => ({ default: m.AdminPlayerDetailPage })),
);
const AdminEventsPage = lazy(() =>
  import('./admin/AdminEventsPage').then((m) => ({ default: m.AdminEventsPage })),
);
const AdminEventDetailPage = lazy(() =>
  import('./admin/AdminEventDetailPage').then((m) => ({ default: m.AdminEventDetailPage })),
);
const AdminScoresheetsPage = lazy(() =>
  import('./admin/AdminScoresheetsPage').then((m) => ({ default: m.AdminScoresheetsPage })),
);
const AdminDashboardPage = lazy(() =>
  import('./admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
);
const AdminSearchPage = lazy(() =>
  import('./admin/AdminSearchPage').then((m) => ({ default: m.AdminSearchPage })),
);
const AdminAuditLogPage = lazy(() =>
  import('./admin/AdminAuditLogPage').then((m) => ({ default: m.AdminAuditLogPage })),
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
        <Route path="/guardian-invite/:token" element={<GuardianInvitePage />} />
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        {/* Legal documents: reachable by anyone, logged in or not, without
            being routed through PublicOnlyRoute (a logged-in user must be
            able to read them too) or ProtectedRoute. */}
        <Route path="/mentions-legales" element={<MentionsLegalesPage />} />
        <Route path="/confidentialite" element={<PolitiqueConfidentialitePage />} />
        <Route path="/cgu" element={<CGUPage />} />
        <Route path="/registre-traitements" element={<RegistreTraitementsPage />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/children/:playerId" element={<ChildProfilePage />} />
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
          <Route index element={<AdminDashboardPage />} />
          <Route path="clubs" element={<AdminClubsPage />} />
          <Route path="clubs/:clubId" element={<AdminClubDetailPage />} />
          <Route path="teams" element={<AdminTeamsPage />} />
          <Route path="teams/:teamId" element={<AdminTeamDetailPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:userId" element={<AdminUserDetailPage />} />
          <Route path="players" element={<AdminPlayersPage />} />
          <Route path="players/:playerId" element={<AdminPlayerDetailPage />} />
          <Route path="events" element={<AdminEventsPage />} />
          <Route path="events/:eventId" element={<AdminEventDetailPage />} />
          <Route path="scoresheets" element={<AdminScoresheetsPage />} />
          <Route path="retention" element={<AdminRetentionPage />} />
          <Route path="audit-log" element={<AdminAuditLogPage />} />
          <Route path="search" element={<AdminSearchPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </AppErrorBoundary>
  );
}
