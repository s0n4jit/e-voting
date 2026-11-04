import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CheckCircleIcon, ClockIcon, ShieldCheckIcon, TicketIcon } from '@heroicons/react/24/outline';
import { authApi } from '../../api/authApi';
import { useBooth } from '../../hooks/useBooth';
import BoothSetup from './BoothSetup';
import LoadingSpinner from '../common/LoadingSpinner';
import { BoothClock, BrandMark, ThemeToggle, errorMessage, formatSchedule } from '../ui';
import NetworkOfflineOverlay from './NetworkOfflineOverlay';
import NumPad from './NumPad';

export const KioskLogin = () => {
  const navigate = useNavigate();
  const kioskToken = localStorage.getItem('kiosk_token') || '';

  const { state: booth, info, activated } = useBooth();
  const election = booth === 'ready' ? info?.election || null : undefined;
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pinRef = useRef(null);

  // Focus PIN input automatically
  useEffect(() => {
    pinRef.current?.focus();
  }, [booth]);

  // Clean slate on kiosk load
  useEffect(() => {
    ['access_token', 'refresh_token', 'user', 'voting_id'].forEach((k) => localStorage.removeItem(k));
    document.body.classList.add('kiosk-screen');
    const handleDrag = (e) => e.preventDefault();
    const handleSelect = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      e.preventDefault();
    };
    const handleCopy = (e) => e.preventDefault();
    window.addEventListener('dragstart', handleDrag, true);
    window.addEventListener('selectstart', handleSelect, true);
    window.addEventListener('copy', handleCopy, true);
    return () => {
      document.body.classList.remove('kiosk-screen');
      window.removeEventListener('dragstart', handleDrag, true);
      window.removeEventListener('selectstart', handleSelect, true);
      window.removeEventListener('copy', handleCopy, true);
    };
  }, []);

  const open = Boolean(info?.voting_open);
  const ended = Boolean(info?.voting_ended);
  const boothNumber = info?.booth_number || 1;
  const boothId = info?.booth_id || localStorage.getItem('kiosk_name') || `BOOTH-${String(boothNumber).padStart(2, '0')}`;
  const currentVotingId = info?.current_voting_id || null;
  const isExhausted = Boolean(info?.is_exhausted);

  const digit = (d) => {
    if (pin.length < 4) {
      const next = (pin + d).slice(0, 4);
      setPin(next);
      setError('');
    }
  };

  const backspace = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  const clear = () => {
    setPin('');
    setError('');
    pinRef.current?.focus();
  };

  const submit = useCallback(async (e) => {
    if (e) e.preventDefault();
    if (pin.length !== 4 || busy) return;

    if (!currentVotingId) {
      setError('No active voting slip available for this booth. Please contact the polling officer.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const res = await authApi.boothPinLogin({
        kioskToken,
        votingId: currentVotingId,
        pin,
      });

      localStorage.setItem('access_token', res.access_token);
      localStorage.setItem('voting_id', res.voting_id);
      localStorage.setItem('booth_id', res.booth_id);

      navigate(`/kiosk/vote/${res.election_id || election?.id}`);
    } catch (err) {
      // Clear PIN and display friendly error; allow immediate retry
      setPin('');
      setError(errorMessage(err, 'Incorrect PIN. Please check your voting slip and try again.'));
      pinRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }, [pin, busy, currentVotingId, kioskToken, election?.id, navigate]);

  if (booth === 'setup') return <BoothSetup onActivated={activated} />;
  if (booth === 'checking') return <LoadingSpinner size="lg" />;

  return (
    <div
      className="min-h-screen bg-bg flex flex-col select-none kiosk-screen"
      data-kiosk="true"
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <BrandMark />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-surface border border-line text-xs font-mono font-bold text-fg shadow-2xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-brand font-black">{boothId}</span>
          </div>
          <BoothClock />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-4xl animate-page-in">
          {/* Election Title */}
          <div className="mb-6 text-center">
            <h1 className="text-3xl font-black tracking-tight text-fg">Enter Voting PIN</h1>
            {election === undefined ? (
              <div className="skeleton h-5 w-56 mx-auto mt-3" />
            ) : election ? (
              <>
                <p className="text-muted text-sm mt-1">{election.title}</p>
                <p className="text-xs text-muted mt-1 inline-flex items-center gap-1.5">
                  <ClockIcon className="w-3.5 h-3.5" />
                  Scheduled: {formatSchedule(election.start_time, election.end_time)}
                </p>
              </>
            ) : (
              <p className="text-muted mt-2">There is no election available right now.</p>
            )}
          </div>

          {ended ? (
            <div className="card card-body text-center py-12 animate-pop-in max-w-md mx-auto" role="status">
              <CheckCircleIcon className="w-14 h-14 text-ok mx-auto" />
              <h2 className="text-2xl font-semibold mt-4">Voting has ended</h2>
              <p className="text-muted mt-2">Thank you for taking part. This booth is now closed.</p>
            </div>
          ) : isExhausted ? (
            <div className="card card-body text-center py-12 animate-pop-in max-w-md mx-auto" role="status">
              <TicketIcon className="w-14 h-14 text-amber-500 mx-auto" />
              <h2 className="text-2xl font-semibold mt-4">All Slips Used</h2>
              <p className="text-muted mt-2">All pre-generated voting slips for {boothId} have been cast. Please see the election officer.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 items-start">
              {/* Form Side */}
              <form onSubmit={submit} className="card card-body space-y-5">
                {election && !open && (
                  <p className="text-sm text-warn bg-warn-soft rounded-xl px-3.5 py-2.5 font-medium" role="status">
                    {election.paused
                      ? 'Voting is paused for a short while. Please wait for the officer to resume it.'
                      : 'Voting is not open at the moment. Please check with the desk.'}
                  </p>
                )}

                {/* Automatically populated current Voting ID display */}
                <div className="rounded-2xl bg-recessed/60 border border-line p-4 text-center">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1">
                    Your Voting ID
                  </span>
                  <div className="font-mono text-3xl font-black text-brand tracking-wider">
                    {currentVotingId || 'Loading…'}
                  </div>
                  <p className="text-[11px] text-muted mt-1.5">
                    Verify that your paper slip displays this exact ID.
                  </p>
                </div>

                {/* 4-digit PIN input field */}
                <div className="space-y-1.5">
                  <label htmlFor="pin" className="block text-xs font-bold uppercase tracking-wider text-fg">
                    4-Digit Voting PIN
                  </label>
                  <input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    value={pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setPin(val);
                      setError('');
                    }}
                    ref={pinRef}
                    autoComplete="off"
                    autoFocus
                    required
                    className="w-full text-center text-3xl font-bold tracking-[0.5em] py-3.5 rounded-xl border border-line bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand tabular-nums shadow-2xs"
                  />
                  <p className="text-[11px] text-muted text-center pt-1">
                    Enter the 4-digit PIN printed on your voting slip.
                  </p>
                </div>

                {/* Error message */}
                {error && (
                  <div className="p-3.5 rounded-xl bg-bad-soft border border-bad/30 text-bad text-xs font-medium text-center animate-pop-in" role="alert">
                    {error}
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={busy || !open || pin.length !== 4 || !currentVotingId}
                  className="btn-primary btn-lg w-full flex items-center justify-center gap-2 font-bold"
                >
                  {busy ? 'Verifying PIN…' : (
                    <>
                      <span>Open Ballot</span>
                      <ArrowRightIcon className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              {/* Touch NumPad */}
              <div>
                <NumPad onDigit={digit} onBackspace={backspace} onClear={clear} disabled={busy || !open} />
              </div>
            </div>
          )}

          {/* Privacy footer */}
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-muted text-center">
            <ShieldCheckIcon className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Anonymous Secret Ballot: Voting slips and PINs contain no student names or personal records.</span>
          </div>
        </div>
      </main>

      <NetworkOfflineOverlay />
    </div>
  );
};

export default KioskLogin;
