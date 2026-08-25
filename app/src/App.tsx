import { Route, Routes } from 'react-router-dom';
import { Toaster } from '@basketeasy/ui/toaster';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { PublicOnlyRoute } from './auth/PublicOnlyRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ClubCreatePage } from './pages/ClubCreatePage';
import { MembersPage } from './pages/MembersPage';
import { AccountPage } from './pages/AccountPage';
import { TeamDetailPage } from './pages/TeamDetailPage';
import { MyTeamsPage } from './pages/MyTeamsPage';
import { AboutPage } from './pages/AboutPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <AppErrorBoundary>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/my-teams" element={<MyTeamsPage />} />
          <Route path="/clubs/new" element={<ClubCreatePage />} />
          <Route path="/clubs/:clubId/members" element={<MembersPage />} />
          <Route path="/clubs/:clubId/teams/:teamId" element={<TeamDetailPage />} />
          <Route path="/clubs/*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </AppErrorBoundary>
  );
}
