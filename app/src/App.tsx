import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from '@basketeasy/ui/toaster';
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

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/clubs/new" element={<ClubCreatePage />} />
          <Route path="/clubs/:clubId/members" element={<MembersPage />} />
          <Route path="/clubs/:clubId/teams/:teamId" element={<TeamDetailPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
