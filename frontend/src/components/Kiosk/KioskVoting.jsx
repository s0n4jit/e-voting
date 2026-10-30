import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { voterApi } from '../../api/voterApi';
import LoadingSpinner from '../common/LoadingSpinner';
import { toast } from 'react-hot-toast';
import {
  ShieldCheckIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  UserIcon,
  AcademicCapIcon,
  NoSymbolIcon,
  CheckBadgeIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ClockIcon,
  FingerPrintIcon,
  LockClosedIcon,
  DocumentCheckIcon,
  SparklesIcon,
  PencilSquareIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

export const KioskVoting = () => {
  const { electionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [election, setElection] = useState(null);
  const [positionsData, setPositionsData] = useState([]); // Array of { position, candidates, allow_nota }
  const [errorMessage, setErrorMessage] = useState(null);

  // Current wizard step index (0 to positionsData.length - 1 for positions; positionsData.length for Review)
  const [currentStep, setCurrentStep] = useState(0);

  // Selections state: { [position]: { candidateId: number | null, candidateName: string, party: string, isNota: boolean } }
  const [selections, setSelections] = useState({});

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  const [countdown, setCountdown] = useState(10);

  // Kiosk token from storage
  const kioskToken = localStorage.getItem('kiosk_token') || '';
  const kioskName = localStorage.getItem('kiosk_name') || 'Lab Station';

  // 1. Fetch structured ballot from backend
  useEffect(() => {
    const fetchBallot = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);

        const data = await voterApi.getElectionBallot(electionId);

        let positions = [];
        let elec = data.election || { id: electionId, title: data.title || 'General Election' };

        if (data.positions && Array.isArray(data.positions) && data.positions.length > 0) {
          positions = data.positions;
        } else if (data.candidates && Array.isArray(data.candidates)) {
          // Group flat candidates by position if backend returned flat list
          const map = {};
          data.candidates.forEach((c) => {
            const p = (c.position || 'Executive Member').trim();
            if (!map[p]) map[p] = [];
            map[p].push(c);
          });
          positions = Object.keys(map).map((p) => ({
            position: p,
            candidates: map[p],
            allow_nota: true,
          }));
        }

        if (positions.length === 0) {
          setErrorMessage('No executive portfolios or candidates are registered for this election.');
        } else {
          setPositionsData(positions);
          setElection(elec);
        }
      } catch (err) {
        console.error('Failed to load election ballot:', err);
        setErrorMessage(
          err?.response?.data?.message ||
            'Unable to load the election ballot. Please check with the polling desk official.'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchBallot();
  }, [electionId]);

  // Total positions count
  const totalPositions = positionsData.length;
  const isReviewStep = currentStep === totalPositions;
  const currentPositionObj = !isReviewStep ? positionsData[currentStep] : null;
  const currentPositionName = currentPositionObj?.position || '';

  // Completed positions count
  const completedCount = useMemo(() => {
    return positionsData.filter((p) => Boolean(selections[p.position])).length;
  }, [positionsData, selections]);

  // Current selection for the active step
  const activeSelection = currentPositionName ? selections[currentPositionName] : null;

  // Selection handlers
  const handleSelectCandidate = (candidate) => {
    if (!currentPositionName) return;
    setSelections((prev) => ({
      ...prev,
      [currentPositionName]: {
        candidateId: candidate.id,
        candidateName: candidate.name,
        party: candidate.party || 'Independent',
        department: candidate.department || '',
        photoUrl: candidate.photo_url,
        isNota: false,
      },
    }));
  };

  const handleSelectNota = () => {
    if (!currentPositionName) return;
    setSelections((prev) => ({
      ...prev,
      [currentPositionName]: {
        candidateId: null,
        candidateName: 'None of the Above (NOTA)',
        party: 'Neutral Abstention',
        department: 'Campus Electoral Option',
        photoUrl: null,
        isNota: true,
      },
    }));
  };

  // Stepper navigation
  const handleNext = () => {
    if (!activeSelection) {
      toast.error(`Please select a candidate or NOTA for ${currentPositionName} to proceed.`);
      return;
    }
    if (currentStep < totalPositions) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleJumpToStep = (index) => {
    if (index >= 0 && index <= totalPositions) {
      setCurrentStep(index);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // 2. Submit complete ballot across all positions
  const handleSubmitBallot = async () => {
    // Validate all positions have been selected
    const missing = positionsData.filter((p) => !selections[p.position]);
    if (missing.length > 0) {
      toast.error(`Missing choices for: ${missing.map((m) => m.position).join(', ')}`);
      // Jump to the first missing step
      const firstMissingIndex = positionsData.findIndex((p) => !selections[p.position]);
      if (firstMissingIndex !== -1) {
        setCurrentStep(firstMissingIndex);
      }
      return;
    }

    setSubmitting(true);
    setSubmissionError(null);

    // Structure exact payload expected by backend VoteService
    const formattedSelections = positionsData.map((p) => {
      const sel = selections[p.position];
      return {
        position: p.position,
        candidate_id: sel.isNota ? null : sel.candidateId,
        is_nota: Boolean(sel.isNota),
      };
    });

    try {
      const response = await voterApi.castMultiPositionBallot(
        electionId,
        formattedSelections,
        kioskToken
      );

      setReceiptData({
        message: response.message || 'Ballot successfully cast and sealed anonymously.',
        receipts: response.receipts || response.data?.receipts || [],
        votedAt: new Date().toLocaleTimeString(),
      });
      setIsSuccess(true);
      toast.success('Your secret ballot has been cast and recorded!');
    } catch (err) {
      console.error('Vote submission error:', err);
      const errMsg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Ballot submission failed. Please verify with the polling desk.';
      setSubmissionError(errMsg);
      toast.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Auto-countdown on success screen to reset booth for next voter
  useEffect(() => {
    if (!isSuccess) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleDoneAndReset();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSuccess]);

  const handleDoneAndReset = () => {
    // Clear voter tokens, preserving kiosk token
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    navigate('/kiosk', { replace: true });
  };

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <LoadingSpinner size="lg" text="Loading official Student Union ballot..." />
      </div>
    );
  }

  // Error State
  if (errorMessage) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-2xl p-8 text-center shadow-2xl">
          <ExclamationCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Ballot Slate Unavailable</h2>
          <p className="text-sm text-slate-400 mb-6">{errorMessage}</p>
          <button
            onClick={() => navigate('/kiosk')}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition"
          >
            Return to Booth Terminal Login
          </button>
        </div>
      </div>
    );
  }

  // ── SUCCESS / CONFIRMATION RECEIPT SCREEN ───────────────────────────────────
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-slate-900 border border-emerald-500/30 rounded-3xl p-8 md:p-10 text-center shadow-2xl animate-fade-in relative overflow-hidden">
          {/* Decorative background glow */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Success Icon */}
          <div className="w-20 h-20 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 mx-auto flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/10">
            <CheckBadgeIcon className="w-12 h-12" />
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-2">
            Secret Ballot Sealed & Cast!
          </h1>
          <p className="text-emerald-400 font-medium text-sm mb-6">
            Official General Election of the Student Union 2026–27
          </p>

          {/* Cryptographic Privacy Notice */}
          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-5 text-left mb-6 space-y-3">
            <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
              <ShieldCheckIcon className="w-5 h-5 text-emerald-400" />
              <span>Cryptographic Ballot Separation Proof</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your 6-digit Voting PIN has been burned. Your student identity has been isolated from your ballot
              choices via zero-correlation blind tokens. Your vote is recorded anonymously into the immutable tally.
            </p>

            {receiptData?.receipts && receiptData.receipts.length > 0 && (
              <div className="pt-3 border-t border-slate-700/60">
                <span className="text-[11px] font-mono text-slate-500 block mb-1 uppercase tracking-wider">
                  Confirmed Portfolios ({receiptData.receipts.length}):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {receiptData.receipts.map((r, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[11px] font-mono bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-md text-emerald-300"
                    >
                      <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" />
                      {r.position}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Countdown & Reset Button */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <button
              onClick={handleDoneAndReset}
              className="w-full sm:w-auto px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-600/30 transition transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Exit Booth for Next Voter ({countdown}s)
            </button>
          </div>

          <p className="text-xs text-slate-500 mt-4">
            Terminal resets automatically in {countdown} seconds to prevent unauthorized inspection.
          </p>
        </div>
      </div>
    );
  }

  // ── MAIN GUIDED VOTING WIZARD ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">
      {/* Top Kiosk Header Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <span>Student Union Election 2026–27</span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Secret Ballot
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                Authorized Booth: {kioskName}
              </p>
            </div>
          </div>

          {/* Stepper Progress Pill */}
          <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3.5 py-1.5 rounded-full text-xs">
            <span className="text-slate-400 font-medium">Progress:</span>
            <span className="font-bold text-emerald-400">
              {completedCount} / {totalPositions}
            </span>
            <span className="text-slate-400 hidden sm:inline">Portfolios Decided</span>
          </div>
        </div>

        {/* Stepper Navigation Pills Bar */}
        <div className="max-w-6xl mx-auto mt-3 pt-2 border-t border-slate-800/70 overflow-x-auto no-scrollbar pb-1">
          <div className="flex items-center gap-2 min-w-max">
            {positionsData.map((p, idx) => {
              const isSelected = Boolean(selections[p.position]);
              const isCurrent = idx === currentStep;

              return (
                <button
                  key={idx}
                  onClick={() => handleJumpToStep(idx)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    isCurrent
                      ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400/40'
                      : isSelected
                      ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30 hover:bg-slate-750'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {isSelected ? (
                    <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full bg-slate-700 text-[10px] flex items-center justify-center text-slate-300">
                      {idx + 1}
                    </span>
                  )}
                  <span>{p.position}</span>
                </button>
              );
            })}

            {/* Review Step Button */}
            <button
              onClick={() => handleJumpToStep(totalPositions)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                isReviewStep
                  ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400/40'
                  : completedCount === totalPositions
                  ? 'bg-slate-800 text-indigo-400 border border-indigo-500/40 hover:bg-slate-750'
                  : 'bg-slate-900 text-slate-500 border border-slate-800'
              }`}
            >
              <DocumentCheckIcon className="w-3.5 h-3.5" />
              <span>Final Review</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 flex flex-col justify-between">
        {!isReviewStep ? (
          /* ── POSITION CANDIDATES SELECTION SCREEN ── */
          <div className="space-y-6 animate-fade-in">
            {/* Position Title Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-4 mb-4">
                <div>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest block mb-1">
                    Step {currentStep + 1} of {totalPositions} • Executive Portfolio
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                    {currentPositionName}
                  </h1>
                </div>
                <div className="text-xs text-slate-400 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60 self-start sm:self-auto">
                  {activeSelection ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircleIcon className="w-4 h-4" />
                      Choice Selected
                    </span>
                  ) : (
                    <span className="text-amber-400 font-medium">Select 1 option below</span>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-300">
                Vote for one candidate to serve as the student union's {currentPositionName}, or select NOTA to
                record a neutral abstention.
              </p>
            </div>

            {/* Candidates Selection Cards Grid */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
                Nominated Candidates
              </h3>

              <div className="grid grid-cols-1 gap-3.5">
                {currentPositionObj?.candidates?.map((candidate) => {
                  const isSelected = activeSelection?.candidateId === candidate.id && !activeSelection?.isNota;

                  return (
                    <div
                      key={candidate.id}
                      onClick={() => handleSelectCandidate(candidate)}
                      className={`p-5 rounded-2xl border cursor-pointer transition-all flex items-start gap-4 ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-950/50 ring-2 ring-emerald-500/40'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                      }`}
                    >
                      {/* Selection Radio Indicator */}
                      <div className="mt-1">
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500 text-slate-950 font-bold'
                              : 'border-slate-600 bg-slate-800'
                          }`}
                        >
                          {isSelected && <CheckBadgeIcon className="w-5 h-5 text-slate-950" />}
                        </div>
                      </div>

                      {/* Candidate Avatar */}
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0">
                        {candidate.photo_url ? (
                          <img
                            src={candidate.photo_url}
                            alt={candidate.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className="w-full h-full flex items-center justify-center text-slate-500 font-bold text-lg"
                          style={{ display: candidate.photo_url ? 'none' : 'flex' }}
                        >
                          {candidate.name.charAt(0)}
                        </div>
                      </div>

                      {/* Candidate Information */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                          <h4 className="text-base font-bold text-white tracking-tight">
                            {candidate.name}
                          </h4>
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 w-fit">
                            {candidate.party || 'Independent'}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-emerald-400/90 mb-1.5 flex items-center gap-1.5">
                          <AcademicCapIcon className="w-3.5 h-3.5" />
                          <span>{candidate.department || 'Department of General Studies'}</span>
                        </p>
                        {candidate.bio && (
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            "{candidate.bio}"
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Dedicated NOTA (None of the Above) Card */}
              {currentPositionObj?.allow_nota !== false && (
                <div className="pt-2">
                  <div
                    onClick={handleSelectNota}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center gap-4 ${
                      activeSelection?.isNota
                        ? 'bg-amber-950/40 border-amber-500 shadow-lg shadow-amber-950/40 ring-2 ring-amber-500/40'
                        : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-850'
                    }`}
                  >
                    <div className="mt-0.5">
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition ${
                          activeSelection?.isNota
                            ? 'border-amber-500 bg-amber-500 text-slate-950 font-bold'
                            : 'border-slate-600 bg-slate-800'
                        }`}
                      >
                        {activeSelection?.isNota && <CheckBadgeIcon className="w-5 h-5 text-slate-950" />}
                      </div>
                    </div>

                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
                      <NoSymbolIcon className="w-5 h-5" />
                    </div>

                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-slate-200">
                        None of the Above (NOTA)
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Vote for none of the listed candidates for {currentPositionName} (Neutral Abstention).
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── STEP 10: COMPREHENSIVE FINAL REVIEW & BALLOT SEAL SCREEN ── */
          <div className="space-y-6 animate-fade-in">
            {/* Review Title Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest block mb-1">
                Final Step • Complete Ballot Verification
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Review Your Executive Ballot
              </h1>
              <p className="text-sm text-slate-300 mt-1">
                Verify your choice for each of the {totalPositions} Student Union executive portfolios. Click{' '}
                <strong className="text-white">"Modify"</strong> on any position to adjust your selection before final submission.
              </p>
            </div>

            {/* Submission Error Banner */}
            {submissionError && (
              <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/60 text-red-200 text-sm flex items-start gap-3">
                <ExclamationCircleIcon className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-100">Submission Error</p>
                  <p className="text-xs text-red-300/90 mt-0.5">{submissionError}</p>
                </div>
              </div>
            )}

            {/* Portfolios Selections Summary List */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800 overflow-hidden shadow-lg">
              {positionsData.map((p, idx) => {
                const sel = selections[p.position];

                return (
                  <div
                    key={idx}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-850/50 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div>
                        <span className="text-xs text-slate-400 block font-medium">
                          {p.position}
                        </span>
                        {sel ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            {sel.isNota ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <NoSymbolIcon className="w-3.5 h-3.5" />
                                None of the Above (NOTA)
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white">
                                  {sel.candidateName}
                                </span>
                                <span className="text-xs text-slate-400">
                                  ({sel.party})
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-red-400 flex items-center gap-1 mt-0.5">
                            <ExclamationCircleIcon className="w-3.5 h-3.5" />
                            Not Selected
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleJumpToStep(idx)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition self-end sm:self-auto"
                    >
                      <PencilSquareIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>Modify</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Cryptographic Zero-Knowledge Notice */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs flex items-start gap-3">
              <LockClosedIcon className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
              <p className="leading-relaxed">
                By clicking <strong className="text-slate-200">"Confirm & Cast Secret Ballot"</strong>, your choices will be
                encrypted and recorded anonymously. Your physical voting token will be burned, and no one (including administrators)
                can correlate your choices to your student identity.
              </p>
            </div>
          </div>
        )}

        {/* Bottom Wizard Navigation Control Bar */}
        <div className="pt-8 border-t border-slate-800/80 mt-8 flex items-center justify-between gap-4">
          <button
            onClick={handleBack}
            disabled={currentStep === 0 || submitting}
            className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold border transition ${
              currentStep === 0 || submitting
                ? 'opacity-40 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
                : 'bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-200 hover:text-white'
            }`}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Previous</span>
          </button>

          {!isReviewStep ? (
            <button
              onClick={handleNext}
              disabled={!activeSelection}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold shadow-lg transition ${
                activeSelection
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/25 hover:scale-[1.02] active:scale-[0.98]'
                  : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed'
              }`}
            >
              <span>{currentStep === totalPositions - 1 ? 'Go to Final Review' : 'Next Portfolio'}</span>
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmitBallot}
              disabled={submitting || completedCount < totalPositions}
              className={`inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl text-sm font-bold shadow-xl transition ${
                completedCount === totalPositions && !submitting
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 hover:scale-[1.02] active:scale-[0.98]'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              {submitting ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin text-white" />
                  <span>Sealing Secret Ballot...</span>
                </>
              ) : (
                <>
                  <LockClosedIcon className="w-4 h-4 text-emerald-300" />
                  <span>Confirm & Cast Secret Ballot</span>
                </>
              )}
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

export default KioskVoting;
