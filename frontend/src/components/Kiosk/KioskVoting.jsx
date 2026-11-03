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
const RESET_AFTER_VOTE_S = 10;

/** The paper copy of the vote: the voter checks it and drops it into the box at the booth.
 * Laid out on A4 paper, positioned at the top center with college logo and clear VVPAT structure. */
const VoteReceipt = ({ receipt }) => {
  const { branding } = useBrand();
  const cachedBrand = (() => {
    try {
      return JSON.parse(localStorage.getItem('evote_branding') || '{}');
    } catch {
      return {};
    }
  })();
  const logo =
    receipt.logo ||
    sessionStorage.getItem('ballot_logo') ||
    branding.logo ||
    cachedBrand.logo ||
    '';
  const institution =
    receipt.institution_name ||
    sessionStorage.getItem('ballot_inst') ||
    branding.institution_name ||
    cachedBrand.institution_name ||
    'ELECTION COMMISSION';

  const lines = Array.isArray(receipt.lines) ? receipt.lines : [];
  const mid = Math.ceil(lines.length / 2);
  const col1 = lines.slice(0, mid);
  const col2 = lines.slice(mid);
  const isMock = Boolean(receipt.is_mock);

  return (
    <PrintPortal>
      <div
        className="print-receipt-page"
        style={{
          width: '100%',
          maxWidth: '100%',
          margin: '0 auto',
          padding: '4mm 0 0 0',
          display: 'block',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div
          className="print-receipt-card"
          style={{
            width: '184mm',
            maxWidth: '184mm',
            marginLeft: 'auto',
            marginRight: 'auto',
            marginTop: 0,
            marginBottom: 0,
            display: 'block',
            textAlign: 'left',
            border: isMock ? '1.5px solid #d97706' : '1.5px solid #0f172a',
            borderRadius: '3mm',
            background: '#ffffff',
            color: '#0f172a',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {/* Header with College Logo */}
          <div
            className="print-receipt-header"
            style={{
              padding: '2.5mm 4mm 2mm',
              textAlign: 'center',
              borderBottom: isMock ? '1.2px dashed #f59e0b' : '1.2px dashed #64748b',
              background: isMock ? '#fffbeb' : '#fafafa',
            }}
          >
            {logo ? (
              <img
                src={logo}
                alt="College Logo"
                className="receipt-logo"
                decoding="sync"
                loading="eager"
                style={{
                  height: '12mm',
                  maxWidth: '14mm',
                  maxHeight: '12mm',
                  objectFit: 'contain',
                  margin: '0 auto 1.5mm',
                  display: 'block',
                }}
              />
            ) : null}
            <h2
              className="receipt-inst-name"
              style={{
                fontSize: '8.5pt',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
                lineHeight: 1.15,
                margin: 0,
                color: isMock ? '#92400e' : '#0f172a',
                textAlign: 'center',
              }}
            >
              {institution}
            </h2>
            <p
              className="receipt-election-name"
              style={{
                fontSize: '7pt',
                color: isMock ? '#b45309' : '#334155',
                margin: '0.5mm 0',
                fontWeight: 500,
                textAlign: 'center',
              }}
            >
              {receipt.election}
            </p>
            <div style={{ textAlign: 'center', marginTop: '0.5mm' }}>
              <span
                className="receipt-badge"
                style={{
                  display: 'inline-block',
                  fontSize: '5.5pt',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: isMock ? '#92400e' : '#0f172a',
                  background: isMock ? '#fef3c7' : '#ffffff',
                  border: isMock ? '0.8px solid #d97706' : '0.8px solid #0f172a',
                  borderRadius: '1mm',
                  padding: '0.2mm 2mm',
                }}
              >
                {isMock ? 'MOCK ELECTION · PRACTICE SLIP' : 'Official Vote Receipt · VVPAT'}
              </span>
            </div>
          </div>

          {/* Banner: Booth, Slip ID, Timestamp */}
          <div
            className="receipt-banner"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.5mm 4mm',
              borderBottom: isMock ? '1px dashed #f59e0b' : '1px dashed #94a3b8',
              background: '#ffffff',
              fontSize: '6.5pt',
            }}
          >
            <div style={{ color: '#475569', fontWeight: 500 }}>
              Booth: {receipt.booth || 'Kiosk'}
            </div>
            <div style={{ textAlign: 'center' }}>
              <span
                style={{
                  fontSize: '5pt',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: '#64748b',
                  fontWeight: 700,
                  display: 'block',
                }}
              >
                Voter Slip ID
              </span>
              <span
                className="receipt-slip-id"
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  fontSize: '10.5pt',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: '#0f172a',
                }}
              >
                {receipt.slip}
              </span>
            </div>
            <div style={{ color: '#475569', fontWeight: 500 }}>
              Time: {receipt.time}
            </div>
          </div>

          {/* Ballot Choices Grid (2-column layout for <= 140mm height) */}
          {lines.length <= 4 ? (
            <table
              className="receipt-table"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.2pt' }}
            >
              <thead>
                <tr style={{ background: isMock ? '#fef3c7' : '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '1.2mm 3mm', fontSize: '6pt', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', textAlign: 'left' }}>
                    Contested Position
                  </th>
                  <th style={{ padding: '1.2mm 3mm', fontSize: '6pt', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', textAlign: 'right' }}>
                    Selected Choice
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.position} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1.2mm 3mm', color: '#334155', fontWeight: 500 }}>{l.position}</td>
                    <td style={{ padding: '1.2mm 3mm', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{l.choice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div
              className="receipt-grid"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, background: '#ffffff' }}
            >
              <table
                className="receipt-table"
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.2pt', borderRight: '1px solid #cbd5e1' }}
              >
                <thead>
                  <tr style={{ background: isMock ? '#fef3c7' : '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '1.2mm 3mm', fontSize: '6pt', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', textAlign: 'left' }}>
                      Contested Position
                    </th>
                    <th style={{ padding: '1.2mm 3mm', fontSize: '6pt', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', textAlign: 'right' }}>
                      Selected Choice
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {col1.map((l) => (
                    <tr key={l.position} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '1.2mm 3mm', color: '#334155', fontWeight: 500 }}>{l.position}</td>
                      <td style={{ padding: '1.2mm 3mm', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{l.choice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table
                className="receipt-table"
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.2pt' }}
              >
                <thead>
                  <tr style={{ background: isMock ? '#fef3c7' : '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '1.2mm 3mm', fontSize: '6pt', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', textAlign: 'left' }}>
                      Contested Position
                    </th>
                    <th style={{ padding: '1.2mm 3mm', fontSize: '6pt', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', textAlign: 'right' }}>
                      Selected Choice
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {col2.map((l) => (
                    <tr key={l.position} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '1.2mm 3mm', color: '#334155', fontWeight: 500 }}>{l.position}</td>
                      <td style={{ padding: '1.2mm 3mm', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{l.choice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer with Verification Note */}
          <div
            className="receipt-footer"
            style={{
              padding: '1.5mm 3mm',
              borderTop: isMock ? '1.2px dashed #f59e0b' : '1.2px dashed #64748b',
              background: isMock ? '#fffbeb' : '#fafafa',
              textAlign: 'center',
            }}
          >
            <p
              className="receipt-instructions"
              style={{
                fontSize: '5.5pt',
                color: isMock ? '#b45309' : '#64748b',
                lineHeight: 1.2,
                margin: 0,
                textAlign: 'center',
              }}
            >
              {isMock
                ? '*** PRACTICE BALLOT — NOT AN OFFICIAL VOTE *** Check your choices above, then drop this practice slip into the mock box.'
                : 'Check your choices above, then fold this slip and drop it into the box at the booth.'}
            </p>
          </div>
        </div>

        {/* Tear or Cut Guide Line (Half A4 Mark) */}
        <div
          className="receipt-tear-guide"
          style={{
            width: '184mm',
            margin: '5mm auto 0',
            display: 'flex',
            alignItems: 'center',
            gap: '2mm',
            color: '#94a3b8',
            fontSize: '6pt',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <span>✂</span>
          <div style={{ flex: 1, borderTop: '1px dashed #94a3b8' }} />
          <span>TEAR OR CUT HERE (HALF A4 · 148.5 MM)</span>
          <div style={{ flex: 1, borderTop: '1px dashed #94a3b8' }} />
          <span>✂</span>
        </div>
      </div>
    </PrintPortal>
  );
};

const AGENT = 'http://127.0.0.1:9631'; // the booth agent on this machine: prints silently and keeps a copy on disk

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
  <div className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-xl flex flex-col items-center justify-center animate-fade-in" role="status" aria-live="polite">
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
  const [electionLogo, setElectionLogo] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [isMock, setIsMock] = useState(false);
  const [printState, setPrintState] = useState('idle'); // idle | sending | printed | failed | browser | off
  const { branding } = useBrand();
  const [fromReview, setFromReview] = useState(false);
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
        if (data.logo) {
          setElectionLogo(data.logo);
          try { sessionStorage.setItem('ballot_logo', data.logo); } catch {}
        }
        if (data.institution_name) {
          setInstitutionName(data.institution_name);
          try { sessionStorage.setItem('ballot_inst', data.institution_name); } catch {}
        }
        if (data.is_mock !== undefined) {
          setIsMock(Boolean(data.is_mock));
        } else if (data.election?.is_mock !== undefined) {
          setIsMock(Boolean(data.election.is_mock));
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

  // The vote copy goes to the booth agent, which saves it on this machine's disk and prints it silently.
  // Without an agent (a browser on an ordinary PC) the browser's own print dialog is used instead.
  const printReceipt = useCallback(async (r) => {
    const settings = boothInfo?.print || { enabled: true, printer: '', copies: 1 };
    if (!settings.enabled) return setPrintState('off');
    setPrintState('sending');
    const cachedBrand = (() => {
      try {
        return JSON.parse(localStorage.getItem('evote_branding') || '{}');
      } catch {
        return {};
      }
    })();
    const activeLogo =
      r.logo ||
      electionLogo ||
      sessionStorage.getItem('ballot_logo') ||
      branding.logo ||
      cachedBrand.logo ||
      '';
    const activeInst =
      r.institution_name ||
      institutionName ||
      sessionStorage.getItem('ballot_inst') ||
      branding.institution_name ||
      cachedBrand.institution_name ||
      '';
    const payload = {
      ...r,
      institution: activeInst,
      logo: activeLogo,
      is_mock: Boolean(r.is_mock),
      printer: settings.printer,
      copies: settings.copies,
    };
    if (window.evoteApp) { // the Campus E-Voting Booth desktop app prints and keeps the copy itself
      try {
        const out = await window.evoteApp.printReceipt(payload);
        setPrintState(out.printed ? 'printed' : 'failed');
      } catch {
        setPrintState('failed');
      }
      return;
    }
    try {
      const res = await fetch(`${AGENT}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Evote-Booth': '1' },
        body: JSON.stringify(payload),
      });
      const out = await res.json();
      setPrintState(out.printed ? 'printed' : 'failed');
    } catch {
      setPrintState('browser'); // no agent here
      // Decode image in memory before triggering print preview so pixels are ready in GPU/bitmap cache
      if (activeLogo) {
        try {
          const preImg = new Image();
          preImg.src = activeLogo;
          if (preImg.decode) {
            await preImg.decode().catch(() => {});
          } else {
            await new Promise((res) => {
              preImg.onload = res;
              preImg.onerror = res;
            });
          }
        } catch {}
      }
      setTimeout(() => window.print(), 350);
    }
  }, [boothInfo, branding.institution_name, branding.logo, electionLogo, institutionName]);

  useEffect(() => {
    if (stage === 'done' && receipt) printReceipt(receipt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (stage === 'ballot' && choices[positions[step]?.position]) next();
      else if (stage === 'review' && answered === total) setConfirmOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // after "Change" on the review screen, Next returns to the review instead of the following position
  const next = () => {
    if (fromReview) {
      setFromReview(false);
      go(total, 'next');
    } else go(step + 1, 'next');
  };

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
      const cachedBrand = (() => {
        try {
          return JSON.parse(localStorage.getItem('evote_branding') || '{}');
        } catch {
          return {};
        }
      })();
      const activeLogo =
        electionLogo ||
        sessionStorage.getItem('ballot_logo') ||
        branding.logo ||
        cachedBrand.logo ||
        '';
      const activeInst =
        institutionName ||
        sessionStorage.getItem('ballot_inst') ||
        branding.institution_name ||
        cachedBrand.institution_name ||
        '';
      setReceipt({
        slip: voter.student_id,
        election: election.title,
        booth: localStorage.getItem('kiosk_name') || '',
        time: new Date().toLocaleString(),
        logo: activeLogo,
        institution_name: activeInst,
        is_mock: Boolean(isMock || election?.is_mock),
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
            <p className="eyebrow text-muted">Please check that this is you</p>
            <p className="text-2xl font-semibold">{voter.name}</p>
            <p className="text-muted">{[voter.department, voter.year ? `Semester / year ${voter.year}` : ''].filter(Boolean).join(' · ')}</p>
            {voter.roll_no && <p className="text-muted text-sm">Roll or enrollment no.: {voter.roll_no}</p>}
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
        {receipt && printState === 'sending' && <p className="text-sm mt-4">Printing your vote copy…</p>}
        {receipt && ['printed', 'browser'].includes(printState) && <p className="text-sm mt-4">Your vote copy has been printed. Check it and drop it into the box.</p>}
        {receipt && printState === 'failed' && <p className="text-sm mt-4 text-bad">The vote copy could not be printed. Your vote is recorded. Please tell the desk.</p>}
        <div className="flex gap-3 mt-10">
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
                      <p className="font-medium truncate">{c === 'NOTA' ? 'NOTA' : c ? c.name : 'Not selected'}</p>
                    </div>
                    <button className="btn-ghost btn-sm" onClick={() => { setFromReview(true); go(i, 'prev'); }}>Change</button>
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
                    onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), e.key === 'Enter' && on ? next() : select(c))}
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
                onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), e.key === 'Enter' && choices[current.position] === 'NOTA' ? next() : select('NOTA'))}
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
                  <p className="text-sm text-muted mt-1">I do not choose anyone</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-8">
              <button className="btn-secondary" onClick={() => go(step - 1, 'prev')} disabled={step === 0}><ArrowLeftIcon className="w-4 h-4" /> Back</button>
              <button className="btn-primary btn-lg" onClick={() => next()} disabled={!choices[current.position]}>
                {fromReview || step === total - 1 ? 'Review' : 'Next'} <ArrowRightIcon className="w-5 h-5" />
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
