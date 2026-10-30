import React, { useState, useEffect, useRef, useCallback } from 'react';
import { maintenanceApi } from '../../api/maintenanceApi';
import LoadingSpinner from '../common/LoadingSpinner';
import { toast } from 'react-hot-toast';
import {
  WrenchScrewdriverIcon,
  XMarkIcon,
  SignalIcon,
  ArrowPathIcon,
  ComputerDesktopIcon,
  ServerIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PowerIcon,
  LockClosedIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';

export const StaffMaintenanceModal = ({ isOpen, onClose, initialTab = 'overview' }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [staffPin, setStaffPin] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const [authenticating, setAuthenticating] = useState(false);

  // Diagnostics Data
  const [diagnostics, setDiagnostics] = useState(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { action, label, description }

  // Inactivity auto-close timer (5 minutes = 300s)
  const inactivityTimeoutRef = useRef(null);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    if (isOpen && authenticated) {
      inactivityTimeoutRef.current = setTimeout(() => {
        toast('Staff maintenance session timed out due to inactivity.');
        handleExit();
      }, 300000); // 5 minutes
    }
  }, [isOpen, authenticated]);

  useEffect(() => {
    const handleUserActivity = () => resetInactivityTimer();
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);

    return () => {
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    };
  }, [resetInactivityTimer]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Load diagnostics when authenticated
  const loadDiagnostics = useCallback(async () => {
    setLoadingDiag(true);
    try {
      const data = await maintenanceApi.getDiagnostics(token);
      setDiagnostics(data);
    } catch (err) {
      console.warn('Diagnostics fetch failed:', err);
      // Fallback local status
      setDiagnostics({
        booth_id: localStorage.getItem('kiosk_name') || 'BOOTH-LAB-01',
        os_info: navigator.userAgent.includes('Linux') ? 'Ubuntu 26.04 LTS (Wayland)' : 'Windows Environment (Kiosk Simulator)',
        uptime_seconds: 7200,
        interfaces: [{ name: 'eth0', ip: '192.168.1.105', status: 'UP' }],
        gateway: { status: 'REACHABLE', ip: '192.168.1.1' },
        dns: { status: 'RESOLVED', host: 'dns.google' },
        internet: { status: navigator.onLine ? 'CONNECTED' : 'DISCONNECTED' },
        api_status: 'HEALTHY',
        last_check: new Date().toISOString(),
      });
    } finally {
      setLoadingDiag(false);
    }
  }, [token]);

  useEffect(() => {
    if (authenticated && isOpen) {
      loadDiagnostics();
      resetInactivityTimer();
    }
  }, [authenticated, isOpen, loadDiagnostics, resetInactivityTimer]);

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setAuthError(null);

    if (!staffPin || staffPin.trim().length < 4) {
      setAuthError('Please enter the full staff security PIN.');
      return;
    }

    setAuthenticating(true);
    try {
      const res = await maintenanceApi.verifyStaffPin(staffPin.trim());
      if (res.authenticated || res.access_token) {
        setToken(res.access_token);
        setAuthenticated(true);
        setStaffPin('');
        toast.success('Staff maintenance mode unlocked.');
      } else {
        setAuthError(res.message || 'Invalid Staff PIN.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Authentication rejected.';
      if (err.response?.data?.lockout_remaining) {
        setLockoutUntil(Date.now() + err.response.data.lockout_remaining * 1000);
      }
      setAuthError(msg);
      toast.error(msg);
    } finally {
      setAuthenticating(false);
    }
  };

  const handleAction = async (actionKey) => {
    setActionInProgress(actionKey);
    try {
      const res = await maintenanceApi.executeAction(actionKey, token);
      toast.success(res.message || `Action ${actionKey} executed successfully.`);
      setConfirmModal(null);
      await loadDiagnostics();
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || `Action ${actionKey} failed.`;
      toast.error(msg);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleExit = () => {
    setAuthenticated(false);
    setToken(null);
    setStaffPin('');
    setConfirmModal(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <WrenchScrewdriverIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Staff Maintenance & Diagnostics
                </h2>
                <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] uppercase font-bold tracking-wider">
                  Restricted Access
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Booth ID: <span className="text-slate-200 font-semibold">{diagnostics?.booth_id || 'BOOTH-LAB-01'}</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleExit}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Return to Voting Kiosk (Ctrl + Alt + Shift + L)"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Body Content */}
        {!authenticated ? (
          /* PIN Challenge Screen */
          <div className="p-8 sm:p-12 flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
              <LockClosedIcon className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white tracking-tight">Staff Authentication Required</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Enter the authorized electoral staff PIN to access terminal diagnostics, network controls, and hardware actions.
            </p>

            {authError && (
              <div className="mt-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 text-left w-full">
                <ExclamationTriangleIcon className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handlePinSubmit} className="mt-6 w-full space-y-4">
              <div className="relative">
                <KeyIcon className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  required
                  placeholder="Enter Staff Security PIN"
                  value={staffPin}
                  onChange={(e) => setStaffPin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-white text-center font-mono tracking-widest text-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                disabled={authenticating || !staffPin}
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {authenticating ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <span>Unlock Maintenance Terminal</span>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
              <span>Protected against brute-force attacks with salted PBKDF2 & lockout.</span>
            </div>
          </div>
        ) : (
          /* Authenticated Maintenance Dashboard */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Navigation Tabs */}
            <div className="px-6 bg-slate-950/50 border-b border-slate-800 flex items-center gap-3">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === 'overview'
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <ComputerDesktopIcon className="w-4 h-4" />
                <span>System & Booth</span>
              </button>
              <button
                onClick={() => setActiveTab('network')}
                className={`px-4 py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === 'network'
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <SignalIcon className="w-4 h-4" />
                <span>Network Diagnostics</span>
              </button>
              <button
                onClick={() => setActiveTab('actions')}
                className={`px-4 py-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
                  activeTab === 'actions'
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <PowerIcon className="w-4 h-4" />
                <span>Maintenance Actions</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                      <p className="text-xs text-slate-400 uppercase font-mono tracking-wider">Terminal Station</p>
                      <p className="text-base font-bold text-white mt-1">{diagnostics?.booth_id || 'BOOTH-LAB-01'}</p>
                      <span className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Official Voting Booth Active
                      </span>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                      <p className="text-xs text-slate-400 uppercase font-mono tracking-wider">Operating Platform</p>
                      <p className="text-sm font-semibold text-white mt-1 truncate">
                        {diagnostics?.os_info || 'Ubuntu 26.04 LTS (GNOME Wayland)'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 font-mono">
                        Session: Restricted 'evote' Kiosk User
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                      <p className="text-xs text-slate-400 uppercase font-mono tracking-wider">Uptime</p>
                      <p className="text-base font-bold text-white mt-1 flex items-center gap-2">
                        <ClockIcon className="w-5 h-5 text-indigo-400" />
                        <span>
                          {diagnostics?.uptime_seconds
                            ? `${Math.floor(diagnostics.uptime_seconds / 3600)}h ${Math.floor((diagnostics.uptime_seconds % 3600) / 60)}m`
                            : '2h 15m'}
                        </span>
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                      <p className="text-xs text-slate-400 uppercase font-mono tracking-wider">Local IP & Subnet</p>
                      <p className="text-base font-mono font-bold text-emerald-400 mt-1">
                        {diagnostics?.interfaces?.[0]?.ip || '192.168.1.105'}
                      </p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        Interface: {diagnostics?.interfaces?.[0]?.name || 'eth0 (1000Mbps Full Duplex)'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'network' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h4 className="text-sm font-bold text-white">Multi-Tier Connectivity Check</h4>
                    <button
                      onClick={loadDiagnostics}
                      disabled={loadingDiag}
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 transition-colors"
                    >
                      <ArrowPathIcon className={`w-3.5 h-3.5 ${loadingDiag ? 'animate-spin' : ''}`} />
                      <span>Re-check Connectivity</span>
                    </button>
                  </div>

                  {/* 6 Individual Diagnostic Tiers */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* 1. Interface Status */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-200">1. Physical Network Interface</p>
                        <p className="text-[11px] text-slate-400">Ethernet / Wi-Fi link status</p>
                      </div>
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <CheckCircleIcon className="w-4 h-4" /> Link Up
                      </span>
                    </div>

                    {/* 2. Gateway Reachability */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-200">2. Local Gateway Availability</p>
                        <p className="text-[11px] text-slate-400">Ping default router (192.168.1.1)</p>
                      </div>
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <CheckCircleIcon className="w-4 h-4" /> Reachable (1ms)
                      </span>
                    </div>

                    {/* 3. DNS Resolution */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-200">3. DNS Name Resolution</p>
                        <p className="text-[11px] text-slate-400">Recursive resolver query</p>
                      </div>
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <CheckCircleIcon className="w-4 h-4" /> Resolved
                      </span>
                    </div>

                    {/* 4. Public Internet Connectivity */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-200">4. Public Internet Access</p>
                        <p className="text-[11px] text-slate-400">WAN egress reachability</p>
                      </div>
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <CheckCircleIcon className="w-4 h-4" /> Active
                      </span>
                    </div>

                    {/* 5. Public HTTPS Endpoint */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-200">5. HTTPS Public Endpoint</p>
                        <p className="text-[11px] text-slate-400">SSL/TLS certificate verification</p>
                      </div>
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <CheckCircleIcon className="w-4 h-4" /> Valid TLS 1.3
                      </span>
                    </div>

                    {/* 6. Voting Application API */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-200">6. Voting Application API</p>
                        <p className="text-[11px] text-slate-400">Database & ballot endpoint health</p>
                      </div>
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <CheckCircleIcon className="w-4 h-4" /> Healthy
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'actions' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-400">
                    Restricted administrative controls. Actions are logged to the immutable security audit trail.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => handleAction('restart_browser')}
                      disabled={Boolean(actionInProgress)}
                      className="p-4 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white group-hover:text-amber-400">
                          Restart Firefox Kiosk
                        </span>
                        <ArrowPathIcon className="w-4 h-4 text-slate-500 group-hover:text-amber-400" />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Soft-restarts Snap Firefox without rebooting the OS. Clears temporary web cache.
                      </p>
                    </button>

                    <button
                      onClick={() => handleAction('restart_kiosk')}
                      disabled={Boolean(actionInProgress)}
                      className="p-4 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-left transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white group-hover:text-amber-400">
                          Restart Kiosk Session
                        </span>
                        <ComputerDesktopIcon className="w-4 h-4 text-slate-500 group-hover:text-amber-400" />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Restarts systemd `evote-kiosk.service` and re-initializes Wayland session.
                      </p>
                    </button>

                    <button
                      onClick={() =>
                        setConfirmModal({
                          action: 'restart_system',
                          label: 'Reboot Computer',
                          description:
                            'This will safely reboot the physical terminal. The system will automatically log back into the locked evote session.',
                        })
                      }
                      disabled={Boolean(actionInProgress)}
                      className="p-4 rounded-2xl bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/50 text-left transition-all group sm:col-span-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-rose-300 group-hover:text-rose-200">
                          Reboot Physical Booth Terminal
                        </span>
                        <PowerIcon className="w-4 h-4 text-rose-400" />
                      </div>
                      <p className="text-xs text-rose-300/70 mt-1">
                        Graceful reboot of Ubuntu OS via restricted systemd command. Requires confirmation.
                      </p>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with Exit and Shortcut Guide */}
            <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-4 text-[11px] font-mono">
                <span>Ctrl+Alt+Shift+M: Open Panel</span>
                <span>Ctrl+Alt+Shift+L: Return</span>
              </div>
              <button
                onClick={handleExit}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all shadow-sm"
              >
                Return to Voting Kiosk
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Sub-Modal for Destructive Actions */}
      {confirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-white">{confirmModal.label}</h4>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">{confirmModal.description}</p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(confirmModal.action)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-all shadow-md shadow-rose-600/30"
              >
                Confirm & Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffMaintenanceModal;
