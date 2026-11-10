import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowsPointingOutIcon,
  ExclamationTriangleIcon,
  NoSymbolIcon,
  PlayIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  TrophyIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { resultsApi } from '../../api/resultsApi';
import { BrandMark, photoSrc } from '../ui';
import LoadingSpinner from '../common/LoadingSpinner';

const enterFullscreen = () => document.documentElement.requestFullscreen?.().catch(() => {});
const leaveFullscreen = () => document.fullscreenElement && document.exitFullscreen?.().catch(() => {});

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Confetti shot from both lower corners whenever `fire` changes to a truthy value. */
const COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#eab308', '#14b8a6'];
const Confetti = ({ fire }) => {
  const canvas = useRef(null);
  useEffect(() => {
    if (!fire || reduced()) return undefined;
    const el = canvas.current;
    const ctx = el.getContext('2d');
    const W = (el.width = window.innerWidth);
    const H = (el.height = window.innerHeight);
    const pieces = Array.from({ length: 220 }, (_, i) => {
      const left = i % 2 === 0;
      return {
        x: left ? 0 : W,
        y: H * 0.8,
        vx: (left ? 1 : -1) * (4 + Math.random() * 10),
        vy: -(11 + Math.random() * 13),
        size: 7 + Math.random() * 8,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.45,
        color: COLORS[i % COLORS.length],
      };
    });
    const t0 = performance.now();
    let frame;
    const tick = (now) => {
      ctx.clearRect(0, 0, W, H);
      pieces.forEach((p) => {
        p.vy += 0.36;
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      });
      if (now - t0 < 4200) frame = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);
    };
  }, [fire]);
  return <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-[110]" aria-hidden="true" />;
};

/** Number that counts up from 0 once `run` is true. */
const VoteCount = ({ votes, run }) => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return setValue(0);
    if (reduced()) return setValue(votes);
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const p = Math.min((now - start) / 1200, 1);
      setValue(Math.round(votes * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [votes, run]);
  return <span className="tabular-nums">{run ? value : '?'}</span>;
};

const Photo = ({ candidate, size }) =>
  candidate.photo_url ? (
    <img src={photoSrc(candidate.photo_url)} alt="" style={{ width: size, height: size }} className="object-cover bg-recessed" />
  ) : (
    <div style={{ width: size, height: size, fontSize: `calc(${size} * 0.5)` }} className="bg-brand-soft text-brand-fg flex items-center justify-center font-semibold">
      {candidate.name.charAt(0).toUpperCase()}
    </div>
  );

const SUSPENSE_MESSAGES = {
  10: 'Securing electronic ballot tallies...',
  9: 'Aggregating precinct ballots...',
  8: 'Verifying cryptographic checksums...',
  7: 'Auditing digital ballot boxes...',
  6: 'The auditorium holds its breath...',
  5: 'Calculating final candidate outcomes...',
  4: 'Tabulation locked and verified...',
  3: 'Winner declaration in 3...',
  2: 'Winner declaration in 2...',
  1: 'Winner declaration in 1...',
};

/**
 * Full-screen reveal for a projector with interactive 10s suspense countdown.
 * Stepping order: Space / Enter / → to start 10s countdown or reveal, ← to go back, Esc to leave.
 */
export default function ResultsPresenter() {
  const { electionId } = useParams();
  const navigate = useNavigate();
  const storeKey = `present-${electionId}`;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0); // 10..1 while active, 0 = idle
  const audioCtxRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('results-presenter-sound') !== 'false';
    } catch {
      return true;
    }
  });

  const [pos, setPos] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey));
      if (saved && typeof saved.idx === 'number') {
        return { idx: saved.idx, revealed: !!saved.revealed };
      }
    } catch {}
    return { idx: 0, revealed: false };
  });

  useEffect(() => {
    resultsApi.adminResults(electionId).then(setData).catch(() => setError('The results could not be loaded.'));
  }, [electionId]);

  const positions = data?.by_position || [];
  const total = positions.length;
  const finale = pos.idx >= total && total > 0;

  // If already at or past finale from an earlier session, reset to start from beginning
  useEffect(() => {
    if (total > 0 && pos.idx >= total) {
      setPos({ idx: 0, revealed: false });
      sessionStorage.removeItem(storeKey);
    }
  }, [total, storeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist current position, but clear storage once presentation reaches the end
  useEffect(() => {
    if (pos.idx >= total && total > 0) {
      sessionStorage.removeItem(storeKey);
    } else {
      sessionStorage.setItem(storeKey, JSON.stringify(pos));
    }
  }, [pos, storeKey, total]);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem('results-presenter-sound', String(next)); } catch {}
      return next;
    });
  }, []);

  const playSuspenseBeep = useCallback((freq, duration = 0.08, type = 'sine') => {
    if (!soundEnabled) return;
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }, [soundEnabled]);

  const playFanfare = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = audioCtxRef.current || new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') ctx.resume();
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.12 + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.12);
        osc.stop(ctx.currentTime + idx * 0.12 + 0.65);
      });
    } catch {}
  }, [soundEnabled]);

  const exit = useCallback(() => {
    sessionStorage.removeItem(storeKey);
    leaveFullscreen();
    navigate(`/admin/results?election=${electionId}`);
  }, [navigate, electionId, storeKey]);

  const restart = useCallback(() => {
    sessionStorage.removeItem(storeKey);
    setCountdown(0);
    setPos({ idx: 0, revealed: false });
  }, [storeKey]);

  const toggleFullscreen = () => (document.fullscreenElement ? leaveFullscreen() : enterFullscreen());

  useEffect(() => {
    if (!document.fullscreenElement) enterFullscreen();
  }, []);

  const revealNow = useCallback(() => {
    setCountdown(0);
    setPos((p) => ({ ...p, revealed: true }));
    playFanfare();
  }, [playFanfare]);

  const startCountdown = useCallback(() => {
    if (pos.revealed) return;
    setCountdown(10);
  }, [pos.revealed]);

  // 10s suspense timer tick
  useEffect(() => {
    if (countdown <= 0) return undefined;
    if (countdown > 3) {
      playSuspenseBeep(320 + (10 - countdown) * 25, 0.08, 'sine');
    } else if (countdown > 0) {
      playSuspenseBeep(580 + (4 - countdown) * 80, 0.14, 'triangle');
    }
    const timer = setTimeout(() => {
      if (countdown === 1) {
        setCountdown(0);
        setPos((p) => ({ ...p, revealed: true }));
        playFanfare();
      } else {
        setCountdown((c) => c - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, playSuspenseBeep, playFanfare]);

  const forward = useCallback(() => {
    if (countdown > 0) {
      revealNow();
      return;
    }
    setPos((p) => {
      if (p.idx >= total) return p;
      if (!p.revealed) {
        setCountdown(10);
        return p;
      }
      setCountdown(0);
      return { idx: p.idx + 1, revealed: false };
    });
  }, [total, countdown, revealNow]);

  const back = useCallback(() => {
    if (countdown > 0) {
      setCountdown(0);
      return;
    }
    setPos((p) => (p.idx >= total ? { idx: total - 1, revealed: true } : p.revealed ? { ...p, revealed: false } : p.idx > 0 ? { idx: p.idx - 1, revealed: true } : p));
  }, [total, countdown]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        forward();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        toggleSound();
      } else if ((e.key === 'r' || e.key === 'R') && finale) {
        restart();
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        exit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [forward, back, exit, toggleFullscreen, toggleSound, finale, restart]);

  if (error) return <p className="p-10 text-bad">{error}</p>;
  if (!data) return <LoadingSpinner size="lg" />;
  if (data.locked) {
    return (
      <div className="fixed inset-0 z-[100] bg-bg flex flex-col items-center justify-center gap-4 text-center px-6">
        <h1 className="text-2xl font-semibold">Results are not published yet</h1>
        <p className="text-muted">Publish the results on the Elections page first.</p>
        <button className="btn-primary" onClick={exit}>Back</button>
      </div>
    );
  }

  const current = positions[pos.idx];
  const o = current?.outcome;

  return (
    <div className="fixed inset-0 z-[100] bg-bg text-fg flex flex-col overflow-hidden">
      <Confetti fire={pos.revealed && o?.type === 'winner' ? `w${pos.idx}` : null} />
      <header className="px-8 h-[8vh] min-h-[3.5rem] flex items-center justify-between gap-4 border-b border-line">
        <BrandMark />
        <p className="text-lg text-muted text-center truncate">{data.election.title}</p>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
            onClick={toggleSound}
            aria-label={soundEnabled ? 'Mute suspense audio' : 'Enable suspense audio'}
            title={soundEnabled ? 'Mute suspense audio (M)' : 'Enable suspense audio (M)'}
          >
            {soundEnabled ? <SpeakerWaveIcon className="w-5 h-5 text-brand" /> : <SpeakerXMarkIcon className="w-5 h-5 text-muted" />}
            <span className="hidden md:inline text-xs font-semibold">{soundEnabled ? 'Sound ON' : 'Muted'}</span>
          </button>
          <button className="btn-ghost" onClick={toggleFullscreen} aria-label="Toggle full screen"><ArrowsPointingOutIcon className="w-5 h-5" /></button>
          <button className="btn-ghost" onClick={exit} aria-label="Leave presentation"><XMarkIcon className="w-6 h-6" /> Exit</button>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col items-center justify-center px-6">
        {total === 0 ? (
          <p className="text-2xl text-muted">There are no positions to show.</p>
        ) : finale ? (
          <div className="w-full max-w-4xl animate-page-in">
            <h1 className="font-semibold tracking-tight text-center mb-[2vh]" style={{ fontSize: '6vh' }}>Election Results Summary</h1>
            <ul className="card divide-y divide-line" style={{ fontSize: '2.7vh' }}>
              {positions.map((p) => (
                <li key={p.position} className="px-6 py-[1.1vh] flex items-center justify-between gap-6">
                  <span className="font-semibold">{p.position}</span>
                  <span className={p.outcome.type === 'winner' ? 'text-ok font-semibold' : 'text-warn font-medium'}>
                    {p.outcome.label}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex justify-center gap-4">
              <button className="btn-secondary btn-lg" onClick={restart}>
                <ArrowPathIcon className="w-5 h-5" /> Present from beginning
              </button>
              <button className="btn-primary btn-lg" onClick={exit}>
                Finish Presentation
              </button>
            </div>
          </div>
        ) : (
          <div key={pos.idx} className="w-full max-w-6xl animate-page-in">
            <p className="text-center text-muted" style={{ fontSize: '2.4vh' }}>Position {pos.idx + 1} of {total}</p>
            <h1 className="text-center font-semibold tracking-tight mb-[3vh]" style={{ fontSize: 'min(8.5vh, 6rem)', lineHeight: 1.1 }}>{current.position}</h1>

            <div className="flex flex-wrap justify-center gap-[2vh]">
              {current.candidates.map((c, i) => {
                const win = pos.revealed && c.is_winner;
                const tie = pos.revealed && c.is_tied;
                const size = current.candidates.length > 4 ? '19vh' : current.candidates.length > 3 ? '24vh' : '29vh';
                return (
                  <div
                    key={c.candidate_id}
                    style={{ width: size, animationDelay: pos.revealed ? '0s' : `${i * 120}ms` }}
                    className={`card overflow-hidden transition-all duration-500 ${
                      win
                        ? 'ring-4 ring-ok shadow-modal animate-winner-pop scale-105'
                        : tie
                        ? 'ring-4 ring-warn animate-pop-in'
                        : countdown > 0
                        ? 'animate-pulse ring-2 ring-brand/50 shadow-lg'
                        : 'animate-slide-up'
                    }`}
                  >
                    <Photo candidate={c} size={size} />
                    <div className="px-3 py-[1.2vh] text-center">
                      <p className="font-bold leading-tight break-words" style={{ fontSize: '3vh' }}>{c.name}</p>
                      <p className={`font-semibold leading-none mt-[0.8vh] ${win ? 'text-ok' : tie ? 'text-warn' : ''}`} style={{ fontSize: '6.5vh' }}>
                        {countdown > 0 ? (
                          <span className="inline-block animate-bounce text-brand text-[4.5vh] tracking-widest font-mono">···</span>
                        ) : (
                          <VoteCount votes={c.votes} run={pos.revealed} />
                        )}
                      </p>
                      <p className="text-muted h-[2.4vh]" style={{ fontSize: '1.8vh' }}>
                        {pos.revealed ? (c.votes === 1 ? 'vote' : 'votes') : countdown > 0 ? 'Tallying...' : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-muted mt-[2vh] flex items-center justify-center gap-2" style={{ fontSize: '2.2vh' }}>
              <NoSymbolIcon className="w-5 h-5" /> NOTA:{' '}
              <span className="font-semibold text-fg">
                {countdown > 0 ? <span className="font-mono text-muted">···</span> : <VoteCount votes={current.nota_count} run={pos.revealed} />}
              </span>
            </p>

            <div className="h-[12vh] mt-[1.5vh] flex items-center justify-center">
              {countdown > 0 ? (
                <div className="flex flex-col items-center justify-center animate-pop-in">
                  <div className="flex items-center gap-4 px-6 py-2.5 rounded-2xl bg-brand/10 border-2 border-brand/50 shadow-2xl backdrop-blur-md">
                    <div className="relative w-14 h-14 flex items-center justify-center">
                      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
                        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" className="text-brand/20 fill-none" />
                        <circle
                          cx="24"
                          cy="24"
                          r="20"
                          stroke="currentColor"
                          strokeWidth="4"
                          className="text-brand fill-none transition-all duration-1000 ease-linear"
                          strokeDasharray={125.6}
                          strokeDashoffset={125.6 * (1 - countdown / 10)}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="absolute font-black text-2xl font-mono text-brand animate-pulse">
                        {countdown}
                      </span>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-lg leading-tight tracking-wide text-brand uppercase">
                        Revealing in {countdown}s...
                      </p>
                      <p className="text-xs text-muted font-medium transition-all duration-300">
                        {SUSPENSE_MESSAGES[countdown] || 'Tabulating final candidate tallies...'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={revealNow}
                      className="ml-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand text-brand-fg hover:opacity-90 active:scale-95 transition-all shadow-sm"
                    >
                      Skip timer
                    </button>
                  </div>
                </div>
              ) : pos.revealed ? (
                <div
                  style={{ fontSize: '3.4vh' }}
                  className={`animate-pop-in px-8 py-[1.2vh] rounded-2xl font-semibold flex items-center gap-3 ${
                    o.type === 'winner' ? 'bg-ok-soft text-ok' : o.type === 'none' ? 'bg-recessed text-muted' : 'bg-warn-soft text-warn'
                  }`}
                >
                  {o.type === 'winner' ? <TrophyIcon className="w-9 h-9 animate-bounce" /> : <ExclamationTriangleIcon className="w-8 h-8" />}
                  {o.type === 'winner' ? `Winner: ${o.label}` : o.label}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startCountdown}
                  className="btn-primary btn-lg shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                  style={{ fontSize: '2.5vh', padding: '1.4vh 3.5vh' }}
                >
                  <PlayIcon className="w-7 h-7" /> Start 10s Reveal Countdown
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="px-8 h-[10vh] min-h-[4rem] border-t border-line flex items-center justify-between gap-4">
        <button className="btn-secondary btn-lg" onClick={back} disabled={pos.idx === 0 && !pos.revealed && countdown === 0}>
          <ArrowLeftIcon className="w-5 h-5" /> {countdown > 0 ? 'Cancel' : 'Back'}
        </button>
        <div className="hidden sm:flex gap-2" aria-hidden="true">
          {positions.map((p, i) => (
            <span key={p.position} className={`h-2.5 rounded-full transition-all ${i === pos.idx && !finale ? 'w-8 bg-brand' : i < pos.idx || (i === pos.idx && pos.revealed) ? 'w-2.5 bg-brand/60' : 'w-2.5 bg-line'}`} />
          ))}
        </div>
        {finale ? (
          <div className="flex items-center gap-3">
            <button className="btn-secondary btn-lg" onClick={restart}>
              <ArrowPathIcon className="w-5 h-5" /> Present from beginning
            </button>
            <button className="btn-primary btn-lg" onClick={exit}>Finish</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {!pos.revealed && countdown === 0 && (
              <button className="btn-ghost btn-lg text-muted text-sm hidden md:inline-flex" onClick={revealNow} title="Instant reveal without 10s countdown">
                Instant reveal
              </button>
            )}
            <button className="btn-primary btn-lg" onClick={forward}>
              {countdown > 0 ? 'Skip to reveal now' : !pos.revealed ? 'Start 10s reveal' : pos.idx === total - 1 ? 'Show all results' : 'Next position'} <ArrowRightIcon className="w-5 h-5" />
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
