import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, NoSymbolIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { voterApi } from '../../api/voterApi';
import { useBooth } from '../../hooks/useBooth';
import { AnimatedCheck, BoothClock, BrandMark, ThemeToggle, errorMessage, photoSrc } from '../ui';
import Modal from '../common/Modal';
import PrintPortal from '../common/PrintPortal';
import { useBrand } from '../../context/BrandContext';
import LoadingSpinner from '../common/LoadingSpinner';
import StaffMaintenanceModal from './StaffMaintenanceModal';
import NetworkOfflineOverlay from './NetworkOfflineOverlay';
import { useMaintenanceShortcuts } from '../../hooks/useMaintenanceShortcuts';

const IDLE_RESET_MS = 5 * 60 * 1000;
const RESET_AFTER_VOTE_S = 30; // long enough to print and collect the vote copy

/** The paper copy of the vote: the voter checks it and drops it into the box at the booth. */
const VoteReceipt = ({ receipt }) => {
  const { branding } = useBrand();
  return (
    <PrintPortal>
      <div className="print-page">
        <div className="print-slip border border-slate-400 rounded-xl overflow-hidden bg-white text-slate-900">
          <div className="px-4 py-3 border-b border-dashed border-slate-400 flex items-center gap-3">
            {branding.logo && <img src={branding.logo} alt="" className="w-10 h-10 object-contain" />}
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight">{branding.institution_name}</p>
              <p className="text-xs text-slate-600">{receipt.election} · Vote copy</p>
            </div>
          </div>
          <div className="px-4 py-3 text-center">
            <p className="text-[10px] uppercase tracking-widest text-slate-600">Voter Slip ID</p>
            <p className="font-mono text-2xl font-semibold tracking-wider">{receipt.slip}</p>
          </div>
          <table className="w-full text-sm border-t border-dashed border-slate-400">
            <tbody>
              {receipt.lines.map((l) => (
                <tr key={l.position} className="border-b border-slate-200 last:border-0">
                  <td className="px-4 py-1.5 text-slate-600">{l.position}</td>
                  <td className="px-4 py-1.5 font-semibold text-right">{l.choice}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[10px] text-slate-600 text-center border-t border-dashed border-slate-400">
            Booth {receipt.booth} · {receipt.time}. Check your choices, then drop this slip into the box at the booth.
          </p>
        </div>
      </div>
    </PrintPortal>
  );
};

const initials = (name) => name.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase();

const Avatar = ({ candidate, size = 'w-16 h-16', text = '', rounded = 'rounded-xl' }) => {
  const [failed, setFailed] = useState(false);
  return candidate.photo_url && !failed ? (
    <img src={photoSrc(candidate.photo_url)} alt="" className={`${size} ${rounded} object-cover bg-recessed shrink-0`} onError={() => setFailed(true)} />
  ) : (
    <div className={`${size} ${rounded} bg-brand-soft text-brand-fg font-semibold flex items-center justify-center shrink-0 ${text}`}>
      {initials(candidate.name)}
    </div>
  );
};

/** Ballot dropping into a box while the vote is being recorded. */
const SubmittingAnimation = () => (
  <div className="fixed inset-0 z-50 bg-bg/95 flex flex-col items-center justify-center animate-fade-in" role="status" aria-live="polite">
    <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
      <g className="animate-ballot-drop" style={{ transformOrigin: 'center' }}>
        <rect x="40" y="10" width="40" height="52" rx="5" fill="rgb(var(--surface))" stroke="rgb(var(--brand))" strokeWidth="3" />
        <path d="M49 26h22M49 36h22M49 46h13" stroke="rgb(var(--brand))" strokeWidth="3" strokeLinecap="round" />
      </g>
      <path d="M22 66h76l-8 40H30z" fill="rgb(var(--brand))" />
      <rect x="44" y="62" width="32" height="6" rx="3" fill="rgb(var(--bg))" />
    </svg>
    <p className="mt-6 font-medium">Recording your vote…</p>
    <p className="text-sm text-muted mt-1">Please don't close this screen.</p>
  </div>
);

export const KioskVoting = () => {
  const { electionId } = useParams();
  const navigate = useNavigate();
  const kioskToken = localStorage.getItem('kiosk_token') || '';
  const { state: boothState, info: boothInfo } = useBooth();
  useEffect(() => {
    if (boothState === 'setup') navigate('/kiosk/vote', { replace: true }); // booth deleted: back to set-up
  }, [boothState, navigate]);
  const voter = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);

  const [stage, setStage] = useState('loading'); // loading | error | intro | ballot | review | submitting | done
  const [error, setError] = useState('');
  const [election, setElection] = useState(null);
  const [positions, setPositions] = useState([]);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState('next');
  const [choices, setChoices] = useState({}); // position -> candidate | 'NOTA'  (memory only, never persisted)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [alreadyRecorded, setAlreadyRecorded] = useState(false);
  const [countdown, setCountdown] = useState(RESET_AFTER_VOTE_S);
  const [receipt, setReceipt] = useState(null);
  const submitting = useRef(false);

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

  const finish = useCallback(() => {
    voterApi.endSession(localStorage.getItem('access_token')).catch(() => {}); // the desk list stops showing this student as active
    ['access_token', 'refresh_token', 'user'].forEach((k) => localStorage.removeItem(k));
    navigate('/kiosk/vote', { replace: true });
  }, [navigate]);

  // The officer closed voting: reset this booth at once, even in the middle of a ballot.
  useEffect(() => {
    if (boothInfo?.voting_ended) finish();
  }, [boothInfo, finish]);

  useEffect(() => {
    voterApi
      .getElectionBallot(electionId)
      .then((data) => {
        const list = (data.positions || []).filter((p) => p.candidates?.length);
        if (!list.length) {
          setError('There are no candidates on this ballot yet. Please speak to the desk.');
          setStage('error');
          return;
        }
        setElection(data.election || { title: data.title });
        setPositions(list);
        setStage('intro');
      })
      .catch((err) => {
        setError(errorMessage(err, 'The ballot could not be loaded. Please speak to the desk.'));
        setStage('error');
      });
  }, [electionId]);

  // Shared booth: return to the start page when left unattended.
  useEffect(() => {
    if (stage === 'done' || stage === 'submitting') return undefined;
    let timer;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(finish, IDLE_RESET_MS);
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, arm));
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, [stage, finish]);

  // the paper copy prints by itself once the vote is recorded
  useEffect(() => {
    if (stage !== 'done' || !receipt) return undefined;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [stage, receipt]);

  useEffect(() => {
    if (stage !== 'done') return undefined;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [stage]);
  useEffect(() => {
    if (stage === 'done' && countdown <= 0) finish();
  }, [stage, countdown, finish]);

  const total = positions.length;
  const current = positions[step];
  const answered = positions.filter((p) => choices[p.position]).length;

  const go = (to, dir) => {
    setDirection(dir || (to > step ? 'next' : 'prev'));
    setStep(to);
    setStage(to >= total ? 'review' : 'ballot');
  };

  // Enter moves on once the position has an answer (on the review screen it opens the submit prompt)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Enter' || confirmOpen || maintenanceOpen || e.target.closest?.('button,[role="radio"]')) return;
      if (stage === 'ballot' && choices[positions[step]?.position]) go(step + 1, 'next');
      else if (stage === 'review' && answered === total) setConfirmOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const select = (value) => setChoices((c) => ({ ...c, [current.position]: value }));

  const submit = async () => {
    if (submitting.current) return; // guards against double taps
    submitting.current = true;
    setConfirmOpen(false);
    setSubmitError('');
    setStage('submitting');
    const selections = positions.map((p) => {
      const c = choices[p.position];
      return { position: p.position, candidate_id: c === 'NOTA' ? null : c.id, is_nota: c === 'NOTA' };
    });
    const minimum = new Promise((r) => setTimeout(r, 1400)); // let the animation be seen
    try {
      await Promise.all([voterApi.castMultiPositionBallot(electionId, selections, kioskToken), minimum]);
      setReceipt({
        slip: voter.student_id,
        election: election.title,
        booth: localStorage.getItem('kiosk_name') || '',
        time: new Date().toLocaleString(),
        lines: positions.map((p) => ({ position: p.position, choice: choices[p.position] === 'NOTA' ? 'NOTA' : choices[p.position].name })),
      });
      setChoices({});
      setStage('done');
    } catch (err) {
      await minimum;
      const msg = errorMessage(err, 'Your vote could not be recorded. Please try again or ask the desk.');
      if (/already voted/i.test(msg)) {
        setAlreadyRecorded(true);
        setChoices({});
        setStage('done');
      } else {
        setSubmitError(msg);
        setStage('review');
      }
    } finally {
      submitting.current = false;
    }
  };

  const chrome = (children, { progress = true } = {}) => (
    <div className="min-h-screen bg-bg flex flex-col select-none">
      <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <BrandMark />
          <div className="flex items-center gap-4"><BoothClock /><ThemeToggle /></div>
        </div>
        {progress && (
          <div className="h-1 bg-recessed" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}>
            <div className="h-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${(answered / total) * 100}%` }} />
          </div>
        )}
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">{children}</main>
      <StaffMaintenanceModal isOpen={maintenanceOpen} onClose={() => setMaintenanceOpen(false)} initialTab={maintenanceTab} />
      <NetworkOfflineOverlay onOpenMaintenance={() => { setMaintenanceTab('network'); setMaintenanceOpen(true); }} />
    </div>
  );

  if (stage === 'loading') return chrome(<LoadingSpinner size="lg" />, { progress: false });

  if (stage === 'error') {
    return chrome(
      <div className="text-center py-16 animate-page-in">
        <ExclamationCircleIcon className="w-12 h-12 text-bad mx-auto" />
        <h1 className="text-xl font-semibold mt-4">Ballot unavailable</h1>
        <p className="text-muted mt-2">{error}</p>
        <button className="btn-primary mt-6" onClick={finish}>Back to start</button>
      </div>,
      { progress: false }
    );
  }

  if (stage === 'intro') {
    return chrome(
      <div className="max-w-xl mx-auto text-center py-8 animate-page-in">
        {voter.name && (
          <div className="card card-body text-left mb-6 space-y-1" role="status">
            <p className="text-xs uppercase tracking-widest text-muted">Please check that this is you</p>
            <p className="text-2xl font-semibold">{voter.name}</p>
            <p className="text-muted">{[voter.department, voter.year ? `Semester / year ${voter.year}` : ''].filter(Boolean).join(' · ')}</p>
            <p className="font-mono text-sm text-muted">{voter.student_id}</p>
          </div>
        )}
        <p className="text-sm text-muted">Welcome{voter.name ? `, ${voter.name.split(' ')[0]}` : ''}</p>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">{election.title}</h1>
        {election.description && <p className="text-muted mt-3">{election.description}</p>}
        <div className="card card-body text-left mt-8 space-y-3 text-sm">
          <p className="font-medium">How voting works</p>
          <ul className="space-y-2 text-muted">
            <li className="flex gap-2"><CheckIcon className="w-4 h-4 mt-0.5 text-ok shrink-0" />There {total === 1 ? 'is' : 'are'} {total} {total === 1 ? 'position' : 'positions'} on your ballot.</li>
            <li className="flex gap-2"><CheckIcon className="w-4 h-4 mt-0.5 text-ok shrink-0" />Choose one candidate for each, or abstain.</li>
            <li className="flex gap-2"><CheckIcon className="w-4 h-4 mt-0.5 text-ok shrink-0" />You will review everything before you submit.</li>
            <li className="flex gap-2"><CheckIcon className="w-4 h-4 mt-0.5 text-ok shrink-0" />Once submitted, your vote cannot be changed.</li>
          </ul>
        </div>
        <button className="btn-primary btn-lg mt-8" onClick={() => go(0, 'next')} autoFocus>
          This is me, start voting <ArrowRightIcon className="w-5 h-5" />
        </button>
        <button className="btn-ghost mt-3 block mx-auto" onClick={finish}>This is not me</button>
      </div>,
      { progress: false }
    );
  }

  if (stage === 'done') {
    return chrome(
      <div className="max-w-md mx-auto text-center py-16 flex flex-col items-center animate-page-in">
        <AnimatedCheck size={96} />
        <h1 className="text-3xl font-semibold tracking-tight mt-8">{alreadyRecorded ? 'Your vote is already recorded' : 'Your vote has been recorded'}</h1>
        <p className="text-muted mt-3">Thank you for taking part in {election.title}.</p>
        {receipt && <p className="text-sm mt-4">Your vote copy is printing. Check it and drop it into the box.</p>}
        <div className="flex gap-3 mt-10">
          {receipt && <button className="btn-secondary btn-lg" onClick={() => window.print()}>Print again</button>}
          <button className="btn-primary btn-lg" onClick={finish}>Finish</button>
        </div>
        {receipt && <VoteReceipt receipt={receipt} />}
        <p className="text-xs text-muted mt-4">This screen clears itself in {Math.max(countdown, 0)}s for the next voter.</p>
      </div>,
      { progress: false }
    );
  }

  const animation = direction === 'next' ? 'animate-step-next' : 'animate-step-prev';

  return (
    <>
      {chrome(
        stage === 'review' || stage === 'submitting' ? (
          <div key="review" className={animation}>
            <p className="text-sm text-muted">Final step</p>
            <h1 className="text-2xl font-semibold tracking-tight mt-1">Review your choices</h1>
            <p className="text-muted mt-1 text-sm">Check each choice. You can change any of them before submitting.</p>

            <ul className="card divide-y divide-line mt-6">
              {positions.map((p, i) => {
                const c = choices[p.position];
                return (
                  <li key={p.position} className="flex items-center gap-4 p-4">
                    {c && c !== 'NOTA' ? <Avatar candidate={c} size="w-12 h-12" /> : <div className="w-12 h-12 rounded-xl bg-recessed shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">{p.position}</p>
                      <p className="font-medium truncate">{c === 'NOTA' ? 'NOTA — none of the above' : c ? c.name : 'Not selected'}</p>
                    </div>
                    <button className="btn-ghost btn-sm" onClick={() => go(i, 'prev')}>Change</button>
                  </li>
                );
              })}
            </ul>

            {submitError && (
              <p className="text-sm text-bad bg-bad-soft rounded-lg px-3 py-2 mt-4 animate-pop-in" role="alert">{submitError}</p>
            )}
            <div className="flex items-center justify-between mt-8">
              <button className="btn-secondary" onClick={() => go(total - 1, 'prev')}><ArrowLeftIcon className="w-4 h-4" /> Back</button>
              <button className="btn-primary btn-lg" disabled={answered < total} onClick={() => setConfirmOpen(true)}>Submit my vote</button>
            </div>
          </div>
        ) : (
          <div key={step} className={animation}>
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Position {step + 1} of {total}</span>
              <span className="flex gap-1.5" aria-hidden="true">
                {positions.map((p, i) => (
                  <span key={p.position} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-brand' : choices[p.position] ? 'w-1.5 bg-brand/60' : 'w-1.5 bg-line'}`} />
                ))}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mt-2">{current.position}</h1>
            <p className="text-muted mt-1 text-sm">Choose one candidate.</p>

            <div role="radiogroup" aria-label={current.position} className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5 mt-6">
              {current.candidates.map((c) => {
                const on = choices[current.position]?.id === c.id;
                return (
                  <div
                    key={c.id}
                    role="radio"
                    aria-checked={on}
                    aria-label={c.name}
                    tabIndex={0}
                    onClick={() => select(c)}
                    onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), e.key === 'Enter' && on ? go(step + 1, 'next') : select(c))}
                    className={`relative flex flex-col rounded-2xl border-2 cursor-pointer bg-surface overflow-hidden transition-all duration-200 active:scale-[0.98] ${
                      on ? 'border-brand ring-4 ring-brand/25 shadow-card-hover -translate-y-0.5' : 'border-line hover:border-brand/40 hover:shadow-card-hover'
                    }`}
                  >
                    <Avatar candidate={c} size="w-full aspect-square" rounded="rounded-none" text="text-7xl sm:text-8xl" />
                    <span
                      className={`absolute top-3 right-3 w-9 h-9 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                        on ? 'bg-brand border-brand scale-100' : 'bg-surface/90 border-line'
                      }`}
                    >
                      {on && <CheckIcon className="w-5 h-5 text-white animate-pop-in" strokeWidth={3} />}
                    </span>
                    <div className={`px-4 py-4 text-center flex-1 ${on ? 'bg-brand-soft/60' : ''}`}>
                      <p className="text-xl sm:text-2xl font-bold leading-tight break-words">{c.name}</p>
                      <p className="text-sm font-bold mt-1 min-h-[2.5rem]">
                        {c.department ? `Student of Department of ${c.department}` : ''}{c.semester ? `, ${c.semester}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}

              <div
                role="radio"
                aria-checked={choices[current.position] === 'NOTA'}
                tabIndex={0}
                onClick={() => select('NOTA')}
                onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), e.key === 'Enter' && choices[current.position] === 'NOTA' ? go(step + 1, 'next') : select('NOTA'))}
                className={`relative flex flex-col rounded-2xl border-2 cursor-pointer overflow-hidden transition-all duration-200 active:scale-[0.98] ${
                  choices[current.position] === 'NOTA' ? 'border-brand ring-4 ring-brand/25 shadow-card-hover -translate-y-0.5' : 'border-slate-500 bg-recessed hover:border-brand/60'
                }`}
              >
                <div className="w-full aspect-square flex items-center justify-center bg-slate-200 dark:bg-slate-700">
                  <NoSymbolIcon className="w-1/2 h-1/2 text-slate-600 dark:text-slate-200" strokeWidth={1.5} />
                </div>
                <span className={`absolute top-3 right-3 w-9 h-9 rounded-full border-2 flex items-center justify-center ${choices[current.position] === 'NOTA' ? 'bg-brand border-brand' : 'bg-surface/90 border-line'}`}>
                  {choices[current.position] === 'NOTA' && <CheckIcon className="w-5 h-5 text-white animate-pop-in" strokeWidth={3} />}
                </span>
                <div className={`px-4 py-4 text-center flex-1 ${choices[current.position] === 'NOTA' ? 'bg-brand-soft/60' : ''}`}>
                  <p className="text-xl sm:text-2xl font-bold leading-tight">NOTA</p>
                  <p className="text-sm text-muted mt-1">None of the above</p>
                  <p className="text-sm text-muted min-h-[1.25rem]">I do not choose anyone</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-8">
              <button className="btn-secondary" onClick={() => go(step - 1, 'prev')} disabled={step === 0}><ArrowLeftIcon className="w-4 h-4" /> Back</button>
              <button className="btn-primary btn-lg" onClick={() => go(step + 1, 'next')} disabled={!choices[current.position]}>
                {step === total - 1 ? 'Review' : 'Next'} <ArrowRightIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        )
      )}

      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Submit your vote?">
        <p className="text-sm text-muted">You are voting for {total} {total === 1 ? 'position' : 'positions'}. After you submit, your vote can't be changed.</p>
        <div className="flex justify-end gap-2 mt-6">
          <button className="btn-ghost" onClick={() => setConfirmOpen(false)}>Go back</button>
          <button className="btn-primary" onClick={submit} autoFocus>Yes, submit my vote</button>
        </div>
      </Modal>

      {stage === 'submitting' && <SubmittingAnimation />}
    </>
  );
};

export default KioskVoting;
