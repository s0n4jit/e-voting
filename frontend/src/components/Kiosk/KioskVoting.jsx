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
import NetworkOfflineOverlay from './NetworkOfflineOverlay';

const IDLE_RESET_MS = 5 * 60 * 1000;
const formatCandidateClass = (dept, sem) => {
  const parts = [];
  if (dept) {
    const d = dept.trim();
    if (/^department of/i.test(d)) {
      parts.push(d.replace(/^department of/i, 'Department of'));
    } else {
      parts.push(`Department of ${d}`);
    }
  }
  if (sem) {
    const s = String(sem).trim();
    const match = s.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      const ords = ['th', 'st', 'nd', 'rd'];
      const v = num % 100;
      const ord = ords[(v - 20) % 10] || ords[v] || ords[0];
      parts.push(`Semester: ${num}${ord}`);
    } else {
      parts.push(`Semester: ${s}`);
    }
  }
  return parts.join(' | ') || '—';
};

const formatTerm = (val) => {
  if (!val && val !== 0) return '—';
  const str = String(val).trim();
  if (/sem|year/i.test(str)) return str;
  const num = parseInt(str, 10);
  if (!isNaN(num)) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = num % 100;
    const ord = s[(v - 20) % 10] || s[v] || s[0];
    return `${num}${ord} Sem`;
  }
  return str;
};

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
  const isMock = Boolean(receipt.is_mock);

  return (
    <PrintPortal>
      <div
        className="print-receipt-page"
        style={{
          width: '100%',
          maxWidth: '100%',
          margin: '0 auto',
          padding: '6mm 0 0 0',
          display: 'block',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <div
          className="print-receipt-card"
          style={{
            width: '125mm',
            maxWidth: '125mm',
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
                  maxWidth: '15mm',
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
                fontSize: '9pt',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
                lineHeight: 1.2,
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
                fontSize: '7.5pt',
                color: isMock ? '#b45309' : '#334155',
                margin: '0.6mm 0',
                fontWeight: 500,
                textAlign: 'center',
              }}
            >
              {receipt.election}
            </p>
            <div style={{ textAlign: 'center', marginTop: '0.4mm' }}>
              <span
                className="receipt-badge"
                style={{
                  display: 'inline-block',
                  fontSize: '6pt',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: isMock ? '#92400e' : '#0f172a',
                  background: isMock ? '#fef3c7' : '#ffffff',
                  border: isMock ? '0.8px solid #d97706' : '0.8px solid #0f172a',
                  borderRadius: '1mm',
                  padding: '0.2mm 2.5mm',
                }}
              >
                {isMock ? 'MOCK ELECTION' : 'Official Vote Receipt · VVPAT'}
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
              fontSize: '7pt',
            }}
          >
            <div style={{ color: '#475569', fontWeight: 500 }}>
              Booth: {receipt.booth || 'Kiosk'}
            </div>
            <div style={{ textAlign: 'center' }}>
              <span
                style={{
                  fontSize: '5.5pt',
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
                  fontSize: '11pt',
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

          {/* Single-Column Ballot Choices Table */}
          <div className="receipt-table-wrap" style={{ width: '100%', background: '#ffffff' }}>
            <table
              className="receipt-table"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.8pt' }}
            >
              <thead>
                <tr style={{ background: isMock ? '#fef3c7' : '#f1f5f9', borderBottom: isMock ? '1px solid #fde68a' : '1px solid #cbd5e1' }}>
                  <th style={{ padding: '1mm 4mm', fontSize: '6.5pt', textTransform: 'uppercase', letterSpacing: '0.05em', color: isMock ? '#92400e' : '#475569', textAlign: 'left' }}>
                    Contested Position
                  </th>
                  <th style={{ padding: '1mm 4mm', fontSize: '6.5pt', textTransform: 'uppercase', letterSpacing: '0.05em', color: isMock ? '#92400e' : '#475569', textAlign: 'right' }}>
                    Selected Choice
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.position} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1.1mm 4mm', color: '#334155', fontWeight: 500 }}>{l.position}</td>
                    <td style={{ padding: '1.1mm 4mm', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{l.choice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer with Verification Note */}
          <div
            className="receipt-footer"
            style={{
              padding: '1.5mm 4mm',
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
                lineHeight: 1.25,
                margin: 0,
                textAlign: 'center',
              }}
            >
              {isMock
                ? '*** MOCK ELECTION *** Check your choices above, then drop this slip into the box at the booth.'
                : 'Check your choices above, then fold this slip and drop it into the box at the booth.'}
            </p>
          </div>
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
    <img
      src={photoSrc(candidate.photo_url)}
      alt=""
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className={`${size} ${rounded} object-cover bg-recessed shrink-0 select-none pointer-events-none`}
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className={`${size} ${rounded} bg-brand-soft text-brand-fg font-semibold flex items-center justify-center shrink-0 select-none ${text}`}
    >
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

  const activeBoothId = boothInfo?.booth_id || localStorage.getItem('kiosk_name') || localStorage.getItem('booth_id') || 'BOOTH-01';

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
  const submitBtnRef = useRef(null);
  const autoAdvanceTimer = useRef(null);

  // When reaching final review, autoscroll smoothly to the submit button
  useEffect(() => {
    if (stage === 'review') {
      const timer = setTimeout(() => {
        submitBtnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [stage]);


  const finish = useCallback(() => {
    voterApi.endSession(localStorage.getItem('access_token')).catch(() => {}); // the desk list stops showing this student as active
    ['access_token', 'refresh_token', 'user', 'voting_id'].forEach((k) => localStorage.removeItem(k));
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
        setStage('ballot');
      })
      .catch((err) => {
        setError(errorMessage(err, 'The ballot could not be loaded. Please speak to the desk.'));
        setStage('error');
      });
  }, [electionId]);

  // Suppress drag, text selection, and copy in kiosk browser sessions
  useEffect(() => {
    document.body.classList.add('kiosk-screen');
    const handleDrag = (e) => e.preventDefault();
    const handleSelect = (e) => e.preventDefault();
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
      setTimeout(() => {
        const origTitle = document.title;
        document.title = `official-vote-receipt-${receipt.slip || 'ballot'}-${new Date().toISOString().slice(0, 10)}`;
        window.print();
        setTimeout(() => { document.title = origTitle; }, 3000);
      }, 350);
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

  const select = (value) => {
    setChoices((c) => ({ ...c, [current.position]: value }));
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
    }
    // Automatically advance to the next position after a brief visual confirmation delay
    autoAdvanceTimer.current = setTimeout(() => {
      next();
    }, 320);
  };

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
        election_id: election.id,
        booth: activeBoothId,
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
    <div
      className="h-screen w-full bg-bg flex flex-col select-none kiosk-screen overflow-hidden"
      data-kiosk="true"
      onDragStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="shrink-0 z-30 bg-bg/95 backdrop-blur border-b border-line shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 h-12 sm:h-14 flex items-center justify-between gap-4">
          <BrandMark />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-surface border border-line text-xs font-mono font-bold text-fg shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{activeBoothId}</span>
              {localStorage.getItem('voting_id') && (
                <>
                  <span className="text-muted/50">•</span>
                  <span className="text-brand">ID: {localStorage.getItem('voting_id')}</span>
                </>
              )}
            </div>
            <BoothClock />
            <ThemeToggle />
          </div>
        </div>
        {progress && (
          <div className="h-1 bg-recessed" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}>
            <div className="h-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${(answered / total) * 100}%` }} />
          </div>
        )}
      </header>
      <main className="flex-1 w-full overflow-y-auto">
        <div className="max-w-6xl mx-auto w-full px-4 pb-24">
          {children}
        </div>
      </main>
      <NetworkOfflineOverlay />
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
      <div className="max-w-xl mx-auto text-center py-6 animate-page-in">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{election.title}</h1>
        {election.description && <p className="text-muted text-sm mt-1.5">{election.description}</p>}

        <div className="card card-body text-left mt-5 space-y-2.5 text-sm">
          <p className="font-semibold text-fg">How voting works</p>
          <ul className="space-y-2 text-muted">
            <li className="flex gap-2"><CheckIcon className="w-4 h-4 mt-0.5 text-ok shrink-0" />There {total === 1 ? 'is' : 'are'} {total} {total === 1 ? 'position' : 'positions'} on your ballot.</li>
            <li className="flex gap-2"><CheckIcon className="w-4 h-4 mt-0.5 text-ok shrink-0" />Choose one candidate for each, or NOTA.</li>
            <li className="flex gap-2"><CheckIcon className="w-4 h-4 mt-0.5 text-ok shrink-0" />You will review everything before you submit.</li>
            <li className="flex gap-2"><CheckIcon className="w-4 h-4 mt-0.5 text-ok shrink-0" />Once submitted, your vote cannot be changed.</li>
          </ul>
        </div>

        {voter.name && (
          <div className="card text-left mt-5 border border-line shadow-card overflow-hidden" role="status">
            <div className="bg-recessed/60 px-4 py-2 border-b border-line flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-muted">
                <span className="w-2 h-2 rounded-full bg-brand" />
                Voter Verification
              </span>
              <span className="font-mono text-muted text-xs">
                Slip ID: <strong className="text-fg font-semibold">{voter.student_id}</strong>
              </span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                <div className="flex items-center gap-1.5 sm:col-span-2">
                  <span className="text-muted shrink-0">Student Name:</span>
                  <span className="font-bold text-fg text-base">{voter.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted shrink-0">Roll/Enrollment No.:</span>
                  <span className="font-semibold text-fg">{voter.roll_no || '—'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted shrink-0">Semester:</span>
                  <span className="font-semibold text-fg">{formatTerm(voter.year)}</span>
                </div>
                <div className="flex items-baseline gap-1.5 sm:col-span-2">
                  <span className="text-muted shrink-0">Programme:</span>
                  <span className="font-semibold text-fg truncate">{voter.department || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <button className="btn-primary btn-lg mt-6" onClick={() => go(0, 'next')} autoFocus>
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
          <div key="review" className={`${animation} max-h-screen flex flex-col justify-between`}>
            <div className="sticky top-0 z-20 bg-bg -mx-4 px-4 py-2 border-b border-line shadow-2xs flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand">Final step</span>
                  <span className="text-muted text-xs">• All positions reviewed</span>
                </div>
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-fg">Review your choices</h1>
              </div>
              <p className="text-muted text-xs hidden sm:block">You can change any choice before final submission.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3 max-w-5xl mx-auto w-full">
              {positions.map((p, i) => {
                const c = choices[p.position];
                const isNota = c === 'NOTA';
                return (
                  <div
                    key={p.position}
                    className="p-2.5 rounded-xl border border-line bg-surface shadow-2xs flex items-center gap-3 transition-colors hover:border-brand/40"
                  >
                    {isNota ? (
                      <div className="w-10 h-10 rounded-lg bg-recessed border border-line flex items-center justify-center font-bold text-xs text-muted shrink-0">
                        NOTA
                      </div>
                    ) : c ? (
                      <Avatar candidate={c} size="w-10 h-10" rounded="rounded-lg" text="text-base" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-bad-soft text-bad font-bold flex items-center justify-center text-xs shrink-0">
                        ?
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-muted uppercase tracking-wider truncate">
                        {p.position}
                      </p>
                      <p className="font-bold text-sm text-fg truncate">
                        {isNota ? 'None of the Above (NOTA)' : c ? c.name : 'Not selected'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-ghost btn-xs text-brand hover:text-brand-hover hover:bg-brand-soft font-bold px-2 py-1"
                      onClick={() => { setFromReview(true); go(i, 'prev'); }}
                    >
                      Change
                    </button>
                  </div>
                );
              })}
            </div>

            {submitError && (
              <p className="text-xs text-bad bg-bad-soft rounded-lg px-3 py-2 mt-2 animate-pop-in" role="alert">
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-between mt-3 pt-3 border-t border-line">
              <button
                type="button"
                className="btn-secondary btn-sm flex items-center gap-1.5"
                onClick={() => go(total - 1, 'prev')}
              >
                <ArrowLeftIcon className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                ref={submitBtnRef}
                type="button"
                className="btn-primary btn-lg shadow-md px-8 py-3 text-base font-black flex items-center gap-2"
                disabled={answered < total}
                onClick={() => setConfirmOpen(true)}
              >
                <span>Submit my vote</span>
                <CheckCircleIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div key={step} className={animation}>
            <div className="sticky top-0 z-20 bg-bg -mx-4 px-4 py-3 border-b border-line shadow-xs">
              <div className="flex items-center justify-between text-sm text-muted">
                <span className="font-medium">Position {step + 1} of {total}</span>
                <span className="flex gap-1.5" aria-hidden="true">
                  {positions.map((p, i) => (
                    <span key={p.position} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-brand' : choices[p.position] ? 'w-1.5 bg-brand/60' : 'w-1.5 bg-line'}`} />
                  ))}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-0.5 text-fg">{current.position}</h1>
              <p className="text-muted text-xs mt-0.5">Choose one candidate for this position.</p>
            </div>

            <div
              role="radiogroup"
              aria-label={current.position}
              className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3 max-w-5xl mx-auto w-full select-none"
            >
              {current.candidates.map((c) => {
                const on = choices[current.position]?.id === c.id;
                return (
                  <div
                    key={c.id}
                    role="radio"
                    aria-checked={on}
                    aria-label={c.name}
                    tabIndex={0}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
                    onClick={() => select(c)}
                    onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), e.key === 'Enter' && on ? next() : select(c))}
                    className={`relative flex flex-col rounded-xl border-2 cursor-pointer bg-surface overflow-hidden transition-all duration-200 select-none active:scale-[0.98] ${
                      on
                        ? 'border-brand ring-3 ring-brand/25 shadow-card-hover -translate-y-0.5'
                        : 'border-line hover:border-brand/40 hover:shadow-card-hover'
                    }`}
                  >
                    <div className="w-full flex items-center justify-center pt-3.5 pb-2 px-3 bg-recessed/30 pointer-events-none">
                      <Avatar
                        candidate={c}
                        size="w-24 h-24 sm:w-28 sm:h-28 aspect-square"
                        rounded="rounded-xl shadow-xs"
                        text="text-3xl sm:text-4xl"
                      />
                    </div>
                    <span
                      className={`absolute top-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                        on ? 'bg-brand border-brand scale-100 shadow-xs' : 'bg-surface/90 border-line'
                      }`}
                    >
                      {on && <CheckIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-pop-in" strokeWidth={3} />}
                    </span>
                    <div className={`px-3 py-2.5 text-center flex-1 flex flex-col justify-center ${on ? 'bg-brand-soft/60' : ''}`}>
                      <p className="text-base sm:text-lg font-bold leading-tight break-words">{c.name}</p>
                      <p className="text-xs sm:text-sm text-muted font-medium mt-1">
                        {formatCandidateClass(c.department, c.semester)}
                      </p>
                    </div>
                  </div>
                );
              })}

              <div
                role="radio"
                aria-checked={choices[current.position] === 'NOTA'}
                tabIndex={0}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                onClick={() => select('NOTA')}
                onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), e.key === 'Enter' && choices[current.position] === 'NOTA' ? next() : select('NOTA'))}
                className={`relative flex flex-col rounded-xl border-2 cursor-pointer overflow-hidden transition-all duration-200 select-none active:scale-[0.98] ${
                  choices[current.position] === 'NOTA'
                    ? 'border-brand ring-3 ring-brand/25 shadow-card-hover -translate-y-0.5'
                    : 'border-slate-500 bg-recessed hover:border-brand/60'
                }`}
              >
                <div className="w-full flex items-center justify-center pt-3.5 pb-2 px-3 bg-recessed/30 pointer-events-none">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 aspect-square rounded-xl flex items-center justify-center bg-slate-200 dark:bg-slate-700 shadow-xs">
                    <NoSymbolIcon className="w-12 h-12 sm:w-14 sm:h-14 text-slate-600 dark:text-slate-300" strokeWidth={1.5} />
                  </div>
                </div>
                <span className={`absolute top-2 right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 flex items-center justify-center ${choices[current.position] === 'NOTA' ? 'bg-brand border-brand' : 'bg-surface/90 border-line'}`}>
                  {choices[current.position] === 'NOTA' && <CheckIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-pop-in" strokeWidth={3} />}
                </span>
                <div className={`px-3 py-2.5 text-center flex-1 flex flex-col justify-center ${choices[current.position] === 'NOTA' ? 'bg-brand-soft/60' : ''}`}>
                  <p className="text-base sm:text-lg font-bold leading-tight">NOTA</p>
                  <p className="text-xs sm:text-sm text-muted font-medium mt-1">I do not choose anyone</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 sm:mt-5 max-w-6xl mx-auto w-full">
              <button className="btn-secondary py-2 px-5" onClick={() => go(step - 1, 'prev')} disabled={step === 0}><ArrowLeftIcon className="w-4 h-4" /> Back</button>
              <button className="btn-primary btn-lg py-2.5 px-7 text-sm font-semibold" onClick={() => next()} disabled={!choices[current.position]}>
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
