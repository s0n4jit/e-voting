import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../../api/authApi';
import { voterApi } from '../../api/voterApi';
import LoadingSpinner from '../common/LoadingSpinner';
import { toast } from 'react-hot-toast';
import {
  ShieldCheckIcon,
  IdentificationIcon,
  KeyIcon,
  ArrowRightIcon,
  ComputerDesktopIcon,
  LockClosedIcon,
  ExclamationCircleIcon,
  BuildingLibraryIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

export const KioskLogin = () => {
  const navigate = useNavigate();

  // Kiosk Terminal details from local storage
  const [kioskName] = useState(() => localStorage.getItem('kiosk_name') || 'Lab Station #01');
  const [kioskToken] = useState(() => localStorage.getItem('kiosk_token') || 'booth-standalone-token');

  // Elections
  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState('');
  const [loadingElections, setLoadingElections] = useState(true);

  // Form inputs
  const [studentId, setStudentId] = useState('');
  const [votingPin, setVotingPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    const fetchActiveElections = async () => {
      try {
        setLoadingElections(true);
        const res = await voterApi.getActiveElections();
        const list = Array.isArray(res) ? res : (res?.elections || []);
        setElections(list);

        if (list.length > 0) {
          // Default to first active or first in list
          const active = list.find((e) => e.is_active);
          setSelectedElectionId(active ? String(active.id) : String(list[0].id));
        }
      } catch (err) {
        console.error('Failed to load active elections for kiosk:', err);
      } finally {
        setLoadingElections(false);
      }
    };

    fetchActiveElections();
  }, []);

  const handlePinChange = (e) => {
    // Only allow numbers and limit to 6 digits
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setVotingPin(val);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanStudentId = studentId.trim().toUpperCase();
    const cleanPin = votingPin.trim();

    if (!cleanStudentId) {
      setErrorMessage('Please scan or enter your Student ID.');
      return;
    }

    if (cleanPin.length !== 6) {
      setErrorMessage('Please enter the complete 6-digit Voting PIN from your paper slip.');
      return;
    }

    if (!selectedElectionId) {
      setErrorMessage('No active election slate selected for this voting booth.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await authApi.voterPinLogin(
        cleanStudentId,
        cleanPin,
        selectedElectionId,
        kioskToken
      );

      // Save token to localStorage so ballot submission can authenticate
      if (response.access_token) {
        localStorage.setItem('access_token', response.access_token);
      }
      if (response.user) {
        localStorage.setItem('user', JSON.stringify(response.user));
      } else {
        localStorage.setItem(
          'user',
          JSON.stringify({ student_id: cleanStudentId, role: 'voter', name: cleanStudentId })
        );
      }

      toast.success('PIN verified! Loading your electronic ballot...');
      navigate(`/kiosk/vote/${selectedElectionId}`);
    } catch (err) {
      console.error('Kiosk login failed:', err);
      const detail =
        err.response?.data?.message ||
        err.response?.data?.error ||
        'Invalid Student ID or Voting PIN. The PIN may have expired or already been used.';
      setErrorMessage(detail);
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-primary-500 selection:text-white">
      {/* Top Kiosk Header Bar */}
      <header className="px-6 py-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-primary-500/30">
            <ShieldCheckIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-white flex items-center gap-2">
              Campus Polling Booth
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Official Terminal
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
              <ComputerDesktopIcon className="w-3.5 h-3.5 text-indigo-400" />
              Terminal Station: <span className="text-white font-semibold">{kioskName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <span className="hidden sm:inline-block px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/50">
            Privacy Filter Active
          </span>
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Booth Ready
          </span>
        </div>
      </header>

      {/* Main Terminal Center */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-lg bg-slate-950/90 rounded-3xl border border-slate-800/80 shadow-2xl p-6 sm:p-10 backdrop-blur-xl relative overflow-hidden">
          {/* Subtle glow backdrop */}
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Heading */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-700/80 text-primary-400 flex items-center justify-center mx-auto mb-4 shadow-inner">
              <LockClosedIcon className="w-8 h-8" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Unlock Your Ballot
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
              Scan or enter your Student ID and the 6-Digit Voting PIN from your physical slip.
            </p>
          </div>

          {/* Election Selector if multiple exist */}
          {elections.length > 1 && (
            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Target Election Slate
              </label>
              <select
                value={selectedElectionId}
                onChange={(e) => setSelectedElectionId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {elections.map((elec) => (
                  <option key={elec.id} value={elec.id}>
                    {elec.title} {elec.is_active ? '● (Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Error Alert */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-950/50 border border-rose-800/80 text-rose-200 text-sm flex items-start gap-3 animate-fade-in">
              <ExclamationCircleIcon className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-300">Authentication Failed</p>
                <p className="text-xs text-rose-200/90 mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Student ID */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                1. Student ID
              </label>
              <div className="relative">
                <IdentificationIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="e.g. CS-2024-001"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="w-full bg-slate-900 border-2 border-slate-700/80 rounded-2xl pl-12 pr-4 py-3.5 text-base sm:text-lg font-mono font-bold text-white uppercase placeholder-slate-600 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  autoFocus
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 pl-1">
                Scan barcode on your Student ID card or type your ID manually.
              </p>
            </div>

            {/* 6-Digit PIN */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                2. 6-Digit Voting PIN
              </label>
              <div className="relative">
                <KeyIcon className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="••••••"
                  value={votingPin}
                  onChange={handlePinChange}
                  className="w-full bg-slate-900 border-2 border-slate-700/80 rounded-2xl pl-12 pr-4 py-3.5 text-2xl font-mono font-black tracking-widest text-center text-primary-400 placeholder-slate-700 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 pl-1">
                Found in the large center box of your physical polling desk slip.
              </p>
            </div>

            {/* Big Touch/Click Button */}
            <button
              type="submit"
              disabled={submitting || !studentId.trim() || votingPin.length !== 6}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white font-extrabold text-lg shadow-lg shadow-primary-600/30 flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Verifying PIN Slip...</span>
                </>
              ) : (
                <>
                  <span>Proceed to Ballot</span>
                  <ArrowRightIcon className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Privacy Notice */}
          <div className="mt-8 pt-6 border-t border-slate-800 text-center">
            <p className="text-xs text-slate-500 leading-relaxed">
              <span className="font-semibold text-slate-400">Strict Ballot Secrecy:</span> Once your ballot is cast, your voting PIN is instantly destroyed. Your individual votes cannot be linked to your Student ID.
            </p>
          </div>
        </div>
      </main>

      {/* Footer & Discreet Staff Exit */}
      <footer className="px-6 py-4 bg-slate-950/80 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <span>Campus Electoral Committee • Secure Polling Station</span>
        <div className="flex items-center gap-4">
          <Link
            to="/login"
            className="text-slate-600 hover:text-slate-400 transition-colors"
            title="Administrator or Desk Login"
          >
            Staff Exit / Unlock
          </Link>
        </div>
      </footer>
    </div>
  );
};

export default KioskLogin;
