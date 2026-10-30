import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { BrandMark } from '../ui';
import { TwoStep } from './ProfilePage';

/** Election Officers cannot use the panel until two-step verification is on. */
export default function SecureAccount() {
  const { user } = useAuth();
  if (user?.otp_enabled) return <Navigate to="/admin/dashboard" replace />;
  return (
    <div className="min-h-screen bg-bg">
      <header className="px-6 py-4"><BrandMark /></header>
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-6 animate-page-in">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Turn on two-step verification</h1>
          <p className="text-muted mt-2">
            This is required for Election Officers. The authenticator app also approves new voting booths and lets you reset a forgotten password.
          </p>
        </div>
        <TwoStep />
      </main>
    </div>
  );
}
