import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowRightIcon, ClockIcon } from '@heroicons/react/24/outline';
import { authApi } from '../../api/authApi';
import { useBooth } from '../../hooks/useBooth';
import BoothSetup from './BoothSetup';
import LoadingSpinner from '../common/LoadingSpinner';
import { BoothClock, BrandMark, Field, ThemeToggle, errorMessage } from '../ui';
import StaffMaintenanceModal from './StaffMaintenanceModal';
import NetworkOfflineOverlay from './NetworkOfflineOverlay';
import { useMaintenanceShortcuts } from '../../hooks/useMaintenanceShortcuts';

export const KioskLogin = () => {
  const navigate = useNavigate();
  const kioskToken = localStorage.getItem('kiosk_token') || '';

  const { state: booth, info, activated } = useBooth();
  const election = booth === 'ready' ? info?.election || null : undefined; // undefined = loading, null = none
  const [slip, setSlip] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceTab, setMaintenanceTab] = useState('overview');
  useMaintenanceShortcuts({
    onOpenMaintenance: (tab = 'overview') => {
      setMaintenanceTab(tab);
      setMaintenanceOpen(true);
    },
    onCloseMaintenance: () => setMaintenanceOpen(false),
    isMaintenanceOpen: maintenanceOpen,
  });

  // A previous voter's session never survives on a shared booth.
  useEffect(() => {
    ['access_token', 'refresh_token', 'user'].forEach((k) => localStorage.removeItem(k));
  }, []);

  const open = Boolean(info?.voting_open);
  const prefix = info?.slip_prefix || 'SUE';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await authApi.voterPinLogin(`${prefix}${slip}`, pin, election?.id, kioskToken);
      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('user', JSON.stringify(res.user));
      navigate(`/kiosk/vote/${res.election_id || election?.id}`);
    } catch (err) {
      setError(errorMessage(err, 'We could not verify those details. Check your slip and try again.'));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  if (booth === 'setup') return <BoothSetup onActivated={activated} />;
  if (booth === 'checking') return <LoadingSpinner size="lg" />;

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <BrandMark />
        <div className="flex items-center gap-4"><BoothClock /><ThemeToggle /></div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md animate-page-in">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Cast your vote</h1>
            {election === undefined ? (
              <div className="skeleton h-5 w-56 mx-auto mt-3" />
            ) : election ? (
              <>
                <p className="text-muted mt-2">{election.title}</p>
                <p className="text-xs text-muted mt-1 inline-flex items-center gap-1.5">
                  <ClockIcon className="w-3.5 h-3.5" />
                  {format(new Date(election.start_time), 'PP p')} – {format(new Date(election.end_time), 'p')}
                </p>
              </>
            ) : (
              <p className="text-muted mt-2">There is no election available right now.</p>
            )}
          </div>

          <form onSubmit={submit} className="card card-body space-y-5">
            {election && !open && (
              <p className="text-sm text-warn bg-warn-soft rounded-lg px-3 py-2" role="status">
                Voting is not open at the moment. Please check with the desk.
              </p>
            )}
            <Field label="Voter slip ID" htmlFor="slip" hint="Type only the 6 digits printed at the end of your slip ID.">
              <div className="flex items-stretch rounded-lg border border-line focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25 overflow-hidden bg-surface">
                <span className="px-3 flex items-center bg-recessed text-muted font-mono text-base sm:text-lg select-none">{prefix}</span>
                <input
                  id="slip"
                  className="flex-1 min-w-0 bg-transparent px-3 py-3 font-mono text-base sm:text-lg tracking-widest outline-none tabular-nums"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={slip}
                  onChange={(e) => setSlip(e.target.value.replace(/\D/g, ''))}
                  autoComplete="off"
                  autoFocus
                  required
                />
              </div>
            </Field>
            <Field label="Voting PIN" htmlFor="pin" hint="The 6-digit PIN given to you at the desk.">
              <input
                id="pin"
                className="input text-center text-2xl tracking-[0.5em] py-3 tabular-nums"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                autoComplete="off"
                required
              />
            </Field>
            {error && (
              <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2 animate-pop-in" role="alert">
                {error}
              </p>
            )}
            <button className="btn-primary btn-lg w-full" disabled={busy || !open || slip.length !== 6 || pin.length !== 6}>
              {busy ? 'Checking…' : (<>Continue <ArrowRightIcon className="w-5 h-5" /></>)}
            </button>
          </form>

          <p className="text-xs text-muted text-center mt-6">
            Your vote is secret. It is never linked to your name.
          </p>
        </div>
      </main>


      <StaffMaintenanceModal isOpen={maintenanceOpen} onClose={() => setMaintenanceOpen(false)} initialTab={maintenanceTab} />
      <NetworkOfflineOverlay onOpenMaintenance={() => { setMaintenanceTab('network'); setMaintenanceOpen(true); }} />
    </div>
  );
};

export default KioskLogin;
