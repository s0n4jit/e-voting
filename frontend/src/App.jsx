import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import LoadingSpinner from './components/common/LoadingSpinner';

// Pages & Components
import LoginPage from './components/Auth/LoginPage';
import VoterDashboard from './components/Voter/VoterDashboard';
import VotingPage from './components/Voter/VotingPage';
import ResultsPage from './components/Results/ResultsPage';
import AdminDashboard from './components/Admin/AdminDashboard';
import ElectionManager from './components/Admin/ElectionManager';
import CandidateManager from './components/Admin/CandidateManager';
import VoterManager from './components/Admin/VoterManager';
import AuditLog from './components/Admin/AuditLog';
import PollingDesk from './components/Admin/PollingDesk';
import KioskManager from './components/Admin/KioskManager';
import OfficerManager from './components/Admin/OfficerManager';
import KioskLogin from './components/Kiosk/KioskLogin';
import KioskVoting from './components/Kiosk/KioskVoting';

// Root redirect handler based on authenticated user's role
const RootRedirect = () => {
  const { isAuthenticated, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size="lg" text="Initialising application session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (role === 'polling_officer') return <Navigate to="/desk" replace />;
  return <Navigate to="/voter/dashboard" replace />;
};

// Authenticated Layout wrapper with AppShell
const AuthenticatedLayout = ({ children }) => {
  return <AppShell>{children}</AppShell>;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Kiosk Mode Routes (Isolated, distraction-free booth immersion) */}
      <Route path="/kiosk" element={<KioskLogin />} />
      <Route path="/kiosk/vote/:electionId" element={<KioskVoting />} />

      {/* Root Route: Role based redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Voter Routes */}
      <Route
        path="/voter/dashboard"
        element={
          <ProtectedRoute allowedRoles={['voter', 'admin']}>
            <AuthenticatedLayout>
              <VoterDashboard />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/voter/vote/:electionId"
        element={
          <ProtectedRoute allowedRoles={['voter', 'admin']}>
            <AuthenticatedLayout>
              <VotingPage />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/voter/results/:electionId"
        element={
          <ProtectedRoute allowedRoles={['voter', 'admin']}>
            <AuthenticatedLayout>
              <ResultsPage />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      {/* Polling Desk (Accessible to Polling Officers & Admins) */}
      <Route
        path="/desk"
        element={
          <ProtectedRoute allowedRoles={['polling_officer', 'admin']}>
            <AuthenticatedLayout>
              <PollingDesk />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AuthenticatedLayout>
              <AdminDashboard />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/officers"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AuthenticatedLayout>
              <OfficerManager />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/desk"
        element={
          <ProtectedRoute allowedRoles={['admin', 'polling_officer']}>
            <AuthenticatedLayout>
              <PollingDesk />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/kiosks"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AuthenticatedLayout>
              <KioskManager />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/elections"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AuthenticatedLayout>
              <ElectionManager />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/candidates/:electionId"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AuthenticatedLayout>
              <CandidateManager />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/voters"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AuthenticatedLayout>
              <VoterManager />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/audit"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AuthenticatedLayout>
              <AuditLog />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/results/:electionId"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AuthenticatedLayout>
              <ResultsPage />
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />

      {/* Catch-all Fallback */}
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
