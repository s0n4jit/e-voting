import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Navbar from './components/common/Navbar';
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

  return <Navigate to={role === 'admin' ? '/admin/dashboard' : '/voter/dashboard'} replace />;
};

// Authenticated Layout wrapper with Navbar
const AuthenticatedLayout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <Navbar />
      <main className="flex-1 pb-12">{children}</main>
      <footer className="py-6 border-t border-slate-200/60 bg-white/50 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Campus e-Voting System • Cryptographically Verified Tally Ledger</span>
          <span>TOTP RFC 6238 • Blind Tokenized Ballots</span>
        </div>
      </footer>
    </div>
  );
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
        path="/admin/desk"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
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
