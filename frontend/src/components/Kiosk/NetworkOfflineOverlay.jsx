import React, { useState, useEffect } from 'react';
import { maintenanceApi } from '../../api/maintenanceApi';
import {
  SignalSlashIcon,
  ArrowPathIcon,
  WrenchScrewdriverIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';

export const NetworkOfflineOverlay = ({ onOpenMaintenance }) => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [checking, setChecking] = useState(false);
  const [retryingIn, setRetryingIn] = useState(3);

  // Monitor browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      checkConnectivity();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Periodic heartbeat check when offline or every 30s
  const checkConnectivity = async () => {
    setChecking(true);
    try {
      const isReachable = await maintenanceApi.pingBackend();
      if (isReachable && navigator.onLine) {
        setIsOffline(false);
      } else {
        setIsOffline(true);
      }
    } catch (e) {
      setIsOffline(true);
    } finally {
      setChecking(false);
      setRetryingIn(3);
    }
  };

  useEffect(() => {
    let interval;
    if (isOffline) {
      interval = setInterval(() => {
        setRetryingIn((prev) => {
          if (prev <= 1) {
            checkConnectivity();
            return 3;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOffline]);

  if (!isOffline) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-slate-950/95 backdrop-blur-xl text-center select-none animate-fade-in">
      <div className="w-full max-w-lg p-8 sm:p-12 rounded-3xl bg-slate-900 border-2 border-rose-600/80 shadow-2xl relative overflow-hidden">
        {/* Pulsing Alert Icon */}
        <div className="w-20 h-20 mx-auto rounded-3xl bg-rose-600/10 border border-rose-500/30 flex items-center justify-center text-rose-500 mb-6 shadow-lg shadow-rose-600/10">
          <SignalSlashIcon className="w-10 h-10 animate-pulse" />
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
          Terminal Temporarily Offline
        </h2>

        <p className="text-sm text-slate-300 mt-3 leading-relaxed">
          The voting booth lost secure connection to the campus election server. Ballots cannot be submitted without encrypted transmission.
        </p>

        {/* Reassurance banner */}
        <div className="mt-6 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 text-left flex items-start gap-3">
          <ShieldExclamationIcon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-slate-200">Ballot Integrity Protected</p>
            <p className="mt-0.5 leading-relaxed text-[11px]">
              No voter data has been compromised. Please notify the presiding polling officer. The terminal will automatically resume once connectivity is restored.
            </p>
          </div>
        </div>

        {/* Auto-reconnect countdown */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs font-mono text-slate-400">
          <ArrowPathIcon className={`w-4 h-4 text-indigo-400 ${checking ? 'animate-spin' : ''}`} />
          <span>
            {checking ? 'Checking network link...' : `Automatic reconnect attempt in ${retryingIn}s`}
          </span>
        </div>

        {/* Staff Diagnostics Shortcut Button */}
        <div className="mt-8 pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Shortcuts: Ctrl+Alt+Shift+N</span>
          {onOpenMaintenance && (
            <button
              onClick={onOpenMaintenance}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors"
            >
              <WrenchScrewdriverIcon className="w-4 h-4 text-amber-400" />
              <span>Staff Diagnostics</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NetworkOfflineOverlay;
