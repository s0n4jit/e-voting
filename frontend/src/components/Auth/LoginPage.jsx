import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { authApi } from '../../api/authApi';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { BrandMark, Field, ThemeToggle, errorMessage } from '../ui';

const home = (role) => (role === 'admin' ? '/admin/dashboard' : role === 'polling_officer' ? '/desk' : '/kiosk/vote');

export const LoginPage = () => {
  const { login, verifyOtp, isAuthenticated, role } = useAuth();
  const { installed, ready } = useBrand();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [tempToken, setTempToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [forgot, setForgot] = useState(null); // null, or { identifier, code, next, confirm, done }

  if (ready && !installed) return <Navigate to="/setup" replace />;
  if (isAuthenticated && role) return <Navigate to={home(role)} replace />;

  const finish = (user) => navigate(location.state?.from?.pathname || home(user?.role), { replace: true });

  const submitCredentials = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await login(identifier.trim(), password);
      if (res?.mfa_required) setTempToken(res.temp_token);
      else finish(res.user);
    } catch (err) {
      setError(errorMessage(err, 'The email, username or password is incorrect.'));
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    if (forgot.next !== forgot.confirm) return setError('The two passwords do not match.');
    setBusy(true);
    setError('');
    try {
      await authApi.forgotPassword(forgot.identifier.trim(), forgot.code.trim(), forgot.next);
      setForgot({ ...forgot, done: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await verifyOtp({ temp_token: tempToken, otp: code.trim() });
      finish(res.user);
    } catch (err) {
      setError(errorMessage(err, 'That code is not valid. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <BrandMark />
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm animate-page-in">
          <h1 className="text-2xl font-semibold tracking-tight">{forgot ? 'Reset your password' : tempToken ? 'Two-step verification' : 'Staff sign in'}</h1>
          <p className="text-sm text-muted mt-1.5 mb-8">
            {forgot
              ? 'Available when two-step verification is turned on for your account.'
              : tempToken
              ? 'Enter the 6-digit code from your authenticator app.'
              : 'For Election Officers and Desk Officers.'}
          </p>

          {forgot ? (
            forgot.done ? (
              <div className="text-center space-y-4 animate-pop-in" role="status">
                <CheckCircleIcon className="w-14 h-14 text-ok mx-auto" />
                <p className="font-medium">Your password has been reset.</p>
                <button className="btn-primary w-full" onClick={() => { setForgot(null); setError(''); }}>Back to sign in</button>
              </div>
            ) : (
              <form onSubmit={submitForgot} className="space-y-4">
                <Field label="Email or username" htmlFor="f-id">
                  <input id="f-id" className="input" value={forgot.identifier} onChange={(e) => setForgot({ ...forgot, identifier: e.target.value })} autoFocus required />
                </Field>
                <Field label="Code from your authenticator app" htmlFor="f-code">
                  <input id="f-code" className="input text-center text-xl tracking-[0.4em] tabular-nums" inputMode="numeric" maxLength={6} value={forgot.code} onChange={(e) => setForgot({ ...forgot, code: e.target.value.replace(/\D/g, '') })} autoComplete="one-time-code" required />
                </Field>
                <Field label="New password" htmlFor="f-new" hint="At least 8 characters with a letter and a number.">
                  <input id="f-new" type="password" className="input" value={forgot.next} onChange={(e) => setForgot({ ...forgot, next: e.target.value })} autoComplete="new-password" required />
                </Field>
                <Field label="Confirm new password" htmlFor="f-confirm">
                  <input id="f-confirm" type="password" className="input" value={forgot.confirm} onChange={(e) => setForgot({ ...forgot, confirm: e.target.value })} autoComplete="new-password" required />
                </Field>
                {error && <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2 animate-pop-in" role="alert">{error}</p>}
                <button className="btn-primary w-full" disabled={busy || forgot.code.length !== 6 || !forgot.next}>{busy ? 'Resetting…' : 'Reset password'}</button>
                <p className="text-xs text-muted">No two-step verification on your account? Ask the Election Officer to reset your password (Desk Officers), or the person who runs the server (Election Officers).</p>
                <button type="button" className="btn-ghost w-full" onClick={() => { setForgot(null); setError(''); }}>Back to sign in</button>
              </form>
            )
          ) : !tempToken ? (
            <form onSubmit={submitCredentials} className="space-y-5">
              <Field label="Email or username" htmlFor="identifier">
                <input id="identifier" className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoFocus required />
              </Field>
              <Field label="Password" htmlFor="password">
                <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </Field>
              {error && (
                <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2 animate-pop-in" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={busy || !identifier || !password}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <button type="button" className="text-sm text-brand-fg hover:underline w-full text-center" onClick={() => { setForgot({ identifier, code: '', next: '', confirm: '' }); setError(''); }}>
                Forgot password?
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode} className="space-y-5">
              <Field label="Authenticator code" htmlFor="code">
                <input id="code" className="input text-center text-xl tracking-[0.4em] tabular-nums" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" autoFocus required />
              </Field>
              {error && (
                <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2 animate-pop-in" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn-primary w-full" disabled={busy || code.length !== 6}>
                {busy ? 'Verifying…' : 'Verify'}
              </button>
              <button type="button" className="btn-ghost w-full" onClick={() => { setTempToken(null); setCode(''); setError(''); }}>
                Use a different account
              </button>
            </form>
          )}

          <p className="text-sm text-muted mt-10 text-center">
            Here to vote?{' '}
            <Link to="/kiosk/vote" className="text-brand-fg font-medium inline-flex items-center gap-1 hover:underline">
              Go to the voting booth <ArrowRightIcon className="w-3.5 h-3.5" />
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
