import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-hot-toast';
import {
  ShieldCheckIcon,
  KeyIcon,
  IdentificationIcon,
  LockClosedIcon,
  CheckBadgeIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';

export const LoginPage = () => {
  const { login, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Form states
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [tempToken, setTempToken] = useState(null);
  const [stage, setStage] = useState('credentials'); // 'credentials' | 'otp'
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Autofill helper for campus staff demos
  const setDemoCredentials = (role) => {
    if (role === 'admin') {
      setStudentId('admin@campus.edu');
      setPassword('Admin@1234');
    } else if (role === 'desk') {
      setStudentId('desk001@campus.edu');
      setPassword('Desk@1234');
    } else {
      setStudentId('STU001');
      setPassword('Student@1234');
    }
    setErrorMsg('');
  };

  const resolveTarget = (role) => {
    if (role === 'admin') return '/admin/dashboard';
    if (role === 'polling_officer') return '/desk';
    return '/voter/dashboard';
  };

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    if (!studentId.trim() || !password) {
      setErrorMsg('Please enter both ID and Password.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const response = await login(studentId.trim(), password);
      // Check if MFA is required
      if (response?.mfa_required || response?.temp_token) {
        setTempToken(response.temp_token);
        setStage('otp');
        toast.success('Credentials verified. Enter your 2FA OTP code.');
      } else {
        // Direct login succeeded
        toast.success('Login successful!');
        const userRole = response?.user?.role || (response?.access_token ? 'voter' : '');
        const target = resolveTarget(userRole);
        const destination = location.state?.from?.pathname || target;
        navigate(destination, { replace: true });
      }
    } catch (err) {
      console.error('Login error:', err);
      const detail = err.response?.data?.message || err.response?.data?.error || 'Invalid ID or password. Please try again.';
      setErrorMsg(detail);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.trim().length < 6) {
      setErrorMsg('Please enter a valid 6-digit OTP code.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const response = await verifyOtp({
        temp_token: tempToken,
        otp: otpCode.trim(),
        student_id: studentId.trim(),
      });

      toast.success('Identity verified successfully!');
      const userRole = response?.user?.role;
      const target = resolveTarget(userRole);
      const destination = location.state?.from?.pathname || target;
      navigate(destination, { replace: true });
    } catch (err) {
      console.error('OTP error:', err);
      const detail = err.response?.data?.message || err.response?.data?.error || 'Invalid or expired OTP code. Please retry.';
      setErrorMsg(detail);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleResetToCredentials = () => {
    setStage('credentials');
    setOtpCode('');
    setTempToken(null);
    setErrorMsg('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50/40 to-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary-700 to-primary-500 text-white shadow-xl shadow-primary-500/25 mb-4 transform hover:scale-105 transition-transform">
          <ShieldCheckIcon className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Campus <span className="text-primary-600">e-Voting</span>
        </h1>
        <p className="mt-2 text-sm text-gray-600 font-medium">
          Confidential • End-to-End Verifiable • Cryptographically Secure
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="card shadow-xl border-gray-100 overflow-hidden">
          {/* Demo Helper Banner for Campus Officers */}
          <div className="bg-gradient-to-r from-primary-900 via-indigo-900 to-slate-900 text-white p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider font-semibold text-primary-200 flex items-center gap-1">
                <CheckBadgeIcon className="w-4 h-4 text-primary-300" /> Official Staff Credentials
              </span>
              <span className="text-[11px] text-gray-400">Click to autofill</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setDemoCredentials('admin')}
                className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-left transition-colors border border-white/10"
              >
                <div className="font-semibold text-indigo-200">Election Officer</div>
                <div className="text-[11px] text-gray-300 font-mono">admin@campus.edu</div>
                <div className="text-[11px] text-gray-300 font-mono">PW: Admin@1234</div>
              </button>
              <button
                type="button"
                onClick={() => setDemoCredentials('desk')}
                className="bg-white/10 hover:bg-white/20 p-2 rounded-lg text-left transition-colors border border-white/10"
              >
                <div className="font-semibold text-amber-300">Desk Officer</div>
                <div className="text-[11px] text-gray-300 font-mono">desk001@campus.edu</div>
                <div className="text-[11px] text-gray-300 font-mono">PW: Desk@1234</div>
              </button>
            </div>
          </div>

          <div className="p-8">
            {errorMsg && (
              <div className="mb-6 p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-sm flex items-start gap-2">
                <span className="font-bold">Error:</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {stage === 'credentials' ? (
              <form onSubmit={handleCredentialsSubmit} className="space-y-5">
                <div>
                  <label htmlFor="student_id" className="label flex items-center justify-between">
                    <span>Email or Staff / Student ID</span>
                    <span className="text-xs text-gray-400 font-normal">e.g. admin@campus.edu or ADMIN001</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <IdentificationIcon className="h-5 w-5" />
                    </div>
                    <input
                      id="student_id"
                      type="text"
                      required
                      autoComplete="username"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder="admin@campus.edu or ID"
                      className="input pl-10 text-sm font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="label">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <LockClosedIcon className="h-5 w-5" />
                    </div>
                    <input
                      id="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="input pl-10"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn btn-primary py-2.5 text-base gap-2 shadow-md shadow-primary-500/20"
                >
                  {loading ? (
                    <>
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue to Verification</span>
                      <ArrowRightIcon className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleOtpSubmit} className="space-y-5">
                <div className="text-center pb-2">
                  <div className="inline-flex p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 mb-2">
                    <KeyIcon className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900">Authenticator 2FA (RFC 6238)</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the 6-digit rolling code from your Authenticator app (Google Authenticator / Authy).
                  </p>
                </div>

                <div>
                  <label htmlFor="otp" className="label text-center">
                    6-Digit Authenticator Code
                  </label>
                  <input
                    id="otp"
                    type="text"
                    required
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••"
                    className="input text-center font-mono text-2xl tracking-[0.5em] py-3 font-bold text-indigo-700"
                  />
                  <p className="text-[11px] text-gray-400 text-center mt-1.5 font-mono">
                    RFC 6238 Standard (30-second window). Initial demo code: 123456
                  </p>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={loading || otpCode.length < 6}
                    className="w-full btn btn-primary py-2.5 text-base gap-2 shadow-md shadow-primary-500/20"
                  >
                    {loading ? (
                      <>
                        <ArrowPathIcon className="w-5 h-5 animate-spin" />
                        <span>Verifying Code...</span>
                      </>
                    ) : (
                      <>
                        <span>Confirm & Access Ballot</span>
                        <ArrowRightIcon className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleResetToCredentials}
                    className="btn btn-ghost text-xs text-gray-500 hover:text-gray-700"
                  >
                    ← Back to Student ID & Password
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6 pt-6 border-t border-gray-100 text-center">
              <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
                <ShieldCheckIcon className="w-4 h-4 text-emerald-500" />
                <span>Protected with SHA-256 HMAC & Blind Signature Tokenization</span>
              </div>
            </div>
          </div>
        </div>

        {/* Student Voter in Campus Election Prompt */}
        <div className="mt-5 p-4 rounded-2xl bg-white border border-slate-200 shadow-sm text-center">
          <p className="text-xs font-bold text-slate-800">
            Student Voter in Campus Election?
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Voting takes place in-person on campus computer booths. Get your 6-digit Voting PIN slip from the Polling Desk and access the booth terminal.
          </p>
          <Link
            to="/kiosk"
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm"
          >
            <ComputerDesktopIcon className="w-4 h-4 text-emerald-400" />
            <span>Open Campus Polling Booth Terminal →</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
