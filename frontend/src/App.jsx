import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useBrand } from './context/BrandContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import LoadingSpinner from './components/common/LoadingSpinner';

import SetupWizard from './components/Setup/SetupWizard';
import LoginPage from './components/Auth/LoginPage';
import ResultsPage from './components/Results/ResultsPage';
import PublicResults from './components/Results/PublicResults';
import ResultsPresenter from './components/Results/ResultsPresenter';
import AdminDashboard from './components/Admin/AdminDashboard';
import ElectionManager from './components/Admin/ElectionManager';
import CandidateManager from './components/Admin/CandidateManager';
import AuditLog from './components/Admin/AuditLog';
import KioskManager from './components/Admin/KioskManager';
import OfficerManager from './components/Admin/OfficerManager';
import ProgrammeManager from './components/Admin/ProgrammeManager';
import SettingsPage from './components/Admin/SettingsPage';
import SystemPage from './components/Admin/SystemPage';
import RegisterStudent from './components/Desk/RegisterStudent';
import Registrations from './components/Desk/Registrations';
import CheckIn from './components/Desk/CheckIn';
import ProfilePage from './components/Profile/ProfilePage';
import SecureAccount from './components/Profile/SecureAccount';
import KioskLogin from './components/Kiosk/KioskLogin';
import KioskVoting from './components/Kiosk/KioskVoting';

const ADMIN = ['admin'];
const STAFF = ['admin', 'polling_officer'];

const RootRedirect = () => {
  const { isAuthenticated, role, loading } = useAuth();
  const { ready, installed } = useBrand();
  if (loading || !ready) return <LoadingSpinner size="lg" />;
  if (!installed) return <Navigate to="/setup" replace />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (role === 'polling_officer') return <Navigate to="/desk" replace />;
  return <Navigate to="/kiosk/vote" replace />;
};

const page = (roles, element) => (
  <ProtectedRoute allowedRoles={roles}>
    <AppShell>{element}</AppShell>
  </ProtectedRoute>
);

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/setup" element={<SetupWizard />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/results/:token" element={<PublicResults />} />

      {/* Voting booth: /kiosk/vote is the only address (the others redirect to it) */}
      <Route path="/kiosk/vote" element={<KioskLogin />} />
      <Route path="/kiosk/vote/:electionId" element={<KioskVoting />} />
      <Route path="/kiosk" element={<Navigate to="/kiosk/vote" replace />} />
      <Route path="/vote" element={<Navigate to="/kiosk/vote" replace />} />
      <Route path="/vote/*" element={<Navigate to="/kiosk/vote" replace />} />

      <Route path="/secure-account" element={<ProtectedRoute allowedRoles={ADMIN}><SecureAccount /></ProtectedRoute>} />
      <Route path="/profile" element={page(STAFF, <ProfilePage />)} />

      {/* Desk Officers (and Election Officers) */}
      <Route path="/desk" element={page(STAFF, <RegisterStudent />)} />
      <Route path="/desk/registrations" element={page(STAFF, <Registrations />)} />
      <Route path="/desk/check-in" element={page(STAFF, <CheckIn />)} />

      {/* Election Officers */}
      <Route path="/admin/dashboard" element={page(ADMIN, <AdminDashboard />)} />
      <Route path="/admin/elections" element={page(ADMIN, <ElectionManager />)} />
      <Route path="/admin/candidates" element={page(ADMIN, <CandidateManager />)} />
      <Route path="/admin/officers" element={page(ADMIN, <OfficerManager />)} />
      <Route path="/admin/programmes" element={page(ADMIN, <ProgrammeManager />)} />
      <Route path="/admin/kiosks" element={page(ADMIN, <KioskManager />)} />
      <Route path="/admin/audit" element={page(ADMIN, <AuditLog />)} />
      <Route path="/admin/settings" element={page(ADMIN, <SettingsPage />)} />
      <Route path="/admin/system" element={page(ADMIN, <SystemPage />)} />
      <Route path="/admin/results" element={page(ADMIN, <ResultsPage />)} />
      <Route path="/admin/results/:electionId/present" element={<ProtectedRoute allowedRoles={ADMIN}><ResultsPresenter /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
