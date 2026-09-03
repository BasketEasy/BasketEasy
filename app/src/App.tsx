import { Route, Routes } from 'react-router-dom';
import { Toaster } from '@basketeasy/ui/toaster';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PublicOnlyRoute } from './auth/PublicOnlyRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { InviteAcceptPage } from './pages/InviteAcceptPage';
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

export default function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/account" element={<AccountPage />} />
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

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </AppErrorBoundary>
  );
}
