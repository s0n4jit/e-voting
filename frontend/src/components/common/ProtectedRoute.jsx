import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

export const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, role, loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <LoadingSpinner size="lg" text="Authenticating session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role === 'admin' && user && !user.otp_enabled && location.pathname !== '/secure-account') {
    return <Navigate to="/secure-account" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    // If authenticated but wrong role, redirect to appropriate home
    const fallbackPath =
      role === 'admin'
        ? '/admin/dashboard'
        : role === 'polling_officer'
        ? '/desk'
        : '/kiosk/vote';
    return <Navigate to={fallbackPath} replace />;
  }

  return children;
};

export default ProtectedRoute;
