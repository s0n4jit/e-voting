import React, { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useBrand } from './context/BrandContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import SessionGuard from './components/common/SessionGuard';
import AppShell from './components/layout/AppShell';
import LoadingSpinner from './components/common/LoadingSpinner';

import SetupWizard from './components/Setup/SetupWizard';
import LoginPage from './components/Auth/LoginPage';
import PublicResults from './components/Results/PublicResults';
import KioskLogin from './components/Kiosk/KioskLogin';
import KioskVoting from './components/Kiosk/KioskVoting';

// Officer and Admin views dynamically imported to keep booth kiosk bundle lean
const ResultsPage = React.lazy(() => import('./components/Results/ResultsPage'));
const ResultsPresenter = React.lazy(() => import('./components/Results/ResultsPresenter'));
const AdminDashboard = React.lazy(() => import('./components/Admin/AdminDashboard'));
const ElectionManager = React.lazy(() => import('./components/Admin/ElectionManager'));
const CandidateManager = React.lazy(() => import('./components/Admin/CandidateManager'));
const AuditLog = React.lazy(() => import('./components/Admin/AuditLog'));
const KioskManager = React.lazy(() => import('./components/Admin/KioskManager'));
const OfficerManager = React.lazy(() => import('./components/Admin/OfficerManager'));
const SettingsPage = React.lazy(() => import('./components/Admin/SettingsPage'));
const SystemPage = React.lazy(() => import('./components/Admin/SystemPage'));
const ReceiptManager = React.lazy(() => import('./components/Admin/ReceiptManager'));
const VoterSlipsManager = React.lazy(() => import('./components/Admin/VoterSlipsManager'));
const ProfilePage = React.lazy(() => import('./components/Profile/ProfilePage'));
const SecureAccount = React.lazy(() => import('./components/Profile/SecureAccount'));

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

const suspense = (el) => (
  <React.Suspense fallback={<div className="p-12 flex justify-center"><LoadingSpinner size="lg" /></div>}>
    {el}
  </React.Suspense>
);

const page = (roles, element) => (
  <ProtectedRoute allowedRoles={roles}>
    <AppShell>{suspense(element)}</AppShell>
  </ProtectedRoute>
);

/**
 * A browser that has been set up as a voting booth stays on the booth screens: any other address
 * (typed, refreshed or reached with the back button) returns to /kiosk/vote.
 * shortcut: this guards the web view; the desktop booth app enforces full-screen kiosk lock and blocks navigation.
 */
function BoothLock({ children }) {
  const { pathname } = useLocation();
  const locked = Boolean(localStorage.getItem('kiosk_token'));
  useEffect(() => {
    if (!locked) return undefined;
    const stay = () => window.history.pushState(null, '', window.location.href);
    stay();
    window.addEventListener('popstate', stay);
    return () => window.removeEventListener('popstate', stay);
  }, [locked, pathname]);
  if (locked && !pathname.startsWith('/kiosk/vote')) return <Navigate to="/kiosk/vote" replace />;
  return children;
}

function AppRoutes() {
  return (
    <BoothLock>
    <SessionGuard />
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

      <Route path="/secure-account" element={<ProtectedRoute allowedRoles={ADMIN}>{suspense(<SecureAccount />)}</ProtectedRoute>} />
      <Route path="/profile" element={page(STAFF, <ProfilePage />)} />

      {/* Desk Officers (and Election Officers): Voter Slips & Booth Monitoring */}
      <Route path="/desk" element={page(STAFF, <VoterSlipsManager />)} />
      <Route path="/desk/registrations" element={<Navigate to="/desk" replace />} />
      <Route path="/desk/check-in" element={<Navigate to="/desk" replace />} />
      <Route path="/admin/slips" element={page(STAFF, <VoterSlipsManager />)} />

      {/* Election Officers */}
      <Route path="/admin/dashboard" element={page(ADMIN, <AdminDashboard />)} />
      <Route path="/admin/elections" element={page(ADMIN, <ElectionManager />)} />
      <Route path="/admin/candidates" element={page(ADMIN, <CandidateManager />)} />
      <Route path="/admin/officers" element={page(ADMIN, <OfficerManager />)} />
      <Route path="/admin/kiosks" element={page(ADMIN, <KioskManager />)} />
      <Route path="/admin/receipts" element={page(ADMIN, <ReceiptManager />)} />
      <Route path="/admin/audit" element={page(ADMIN, <AuditLog />)} />
      <Route path="/admin/settings" element={page(ADMIN, <SettingsPage />)} />
      <Route path="/admin/system" element={page(ADMIN, <SystemPage />)} />
      <Route path="/admin/results" element={page(ADMIN, <ResultsPage />)} />
      <Route path="/admin/results/:electionId/present" element={<ProtectedRoute allowedRoles={ADMIN}>{suspense(<ResultsPresenter />)}</ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </BoothLock>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
