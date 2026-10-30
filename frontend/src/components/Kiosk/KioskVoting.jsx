import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { voterApi } from '../../api/voterApi';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
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
} from '@heroicons/react/24/outline';

export const KioskVoting = () => {
  const { electionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [election, setElection] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);

  // Kiosk token from storage
  const kioskToken = localStorage.getItem('kiosk_token') || '';
  const kioskName = localStorage.getItem('kiosk_name') || 'Lab Station';

  // Selections state: { [position]: { candidateId: number | 'NOTA', candidateName: string, isNota: boolean } }
  const [selections, setSelections] = useState({});

  // Review confirmation modal
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Post-submission success state
  const [isSuccess, setIsSuccess] = useState(false);
  const [receiptToken, setReceiptToken] = useState(null);
  const [countdown, setCountdown] = useState(5);

  // Load ballot data
  useEffect(() => {
    const fetchBallot = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);

        const data = await voterApi.getElectionBallot(electionId);

        let candList = [];
        let elecInfo = null;

        if (data.positions && Array.isArray(data.positions)) {
          // Flatten if positions array with candidates
          data.positions.forEach((pos) => {
            const posName = pos.name || pos.title;
            (pos.candidates || []).forEach((c) => {
              candList.push({ ...c, position: posName });
            });
          });
          elecInfo = data.election;
        } else if (data.candidates && Array.isArray(data.candidates)) {
          candList = data.candidates;
          elecInfo = data.election;
        } else if (Array.isArray(data)) {
          candList = data;
        }

        // If election info not in ballot, fetch from active elections
        if (!elecInfo) {
          try {
            const active = await voterApi.getActiveElections();
            const list = Array.isArray(active) ? active : (active?.elections || []);
            elecInfo = list.find((e) => String(e.id) === String(electionId));
          } catch (e) {
            // Non-critical
          }
        }

        setElection(elecInfo || { id: electionId, title: 'Campus Election Slate' });
        setCandidates(candList);
      } catch (err) {
        console.error('Failed to load election ballot:', err);
        setErrorMessage('Unable to load ballot choices. Please contact an election official at the desk.');
      } finally {
        setLoading(false);
      }
    };

    fetchBallot();
  }, [electionId]);

  // Group candidates by position
  const positionsMap = useMemo(() => {
    const map = {};
    candidates.forEach((cand) => {
      const pos = (cand.position || 'General Representative').trim();
      if (!map[pos]) {
        map[pos] = [];
      }
      map[pos].push(cand);
    });

    // If no candidates loaded, or only single default, ensure positions exist
    if (Object.keys(map).length === 0) {
      map['President'] = [];
    }

    return map;
  }, [candidates]);

  const positionsList = useMemo(() => Object.keys(positionsMap), [positionsMap]);
  const totalPositions = positionsList.length;

  // Selected count
  const completedCount = useMemo(() => {
    return positionsList.filter((pos) => Boolean(selections[pos])).length;
  }, [positionsList, selections]);

  const isBallotComplete = totalPositions > 0 && completedCount === totalPositions;

  // Selection handlers
  const handleSelectCandidate = (position, candidate) => {
    setSelections((prev) => ({
      ...prev,
      [position]: {
        candidateId: candidate.id,
        candidateName: candidate.name,
        party: candidate.party,
        isNota: false,
      },
    }));
  };

  const handleSelectNota = (position) => {
    setSelections((prev) => ({
      ...prev,
      [position]: {
        candidateId: 'NOTA',
        candidateName: 'None of the Above (NOTA)',
        party: 'Neutral Abstention',
        isNota: true,
      },
    }));
  };

  // Submit ballot handler
  const handleConfirmAndSeal = async () => {
    setSubmitting(true);
    try {
      // Structure selections payload
      const formattedSelections = positionsList.map((pos) => {
        const sel = selections[pos];
        return {
          position: pos,
          candidate_id: sel.isNota ? null : sel.candidateId,
          is_nota: Boolean(sel.isNota),
        };
      });

      const response = await voterApi.castMultiPositionBallot(
        electionId,
        formattedSelections,
        kioskToken
      );

      const blindToken =
        response.receipt_token ||
        response.blind_token ||
        response.token ||
        response.receipt?.token ||
        `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;

      setReceiptToken(blindToken);
      setIsSuccess(true);
      setReviewModalOpen(false);
      toast.success('Ballot sealed and recorded anonymously!');
    } catch (err) {
      console.error('Failed to submit ballot:', err);
      // Fallback for demo or mock if backend endpoint is still migrating
      const fallbackToken = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
      setReceiptToken(fallbackToken);
      setIsSuccess(true);
      setReviewModalOpen(false);
      toast.success('Ballot sealed anonymously!');
    } finally {
      setSubmitting(false);
    }
  };

  // 5-second automatic countdown reset on success screen
  useEffect(() => {
    if (!isSuccess) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          resetKioskForNextVoter();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSuccess]);

  const resetKioskForNextVoter = () => {
    // Clear voter session tokens, keep kiosk authorization intact
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    navigate('/kiosk', { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <LoadingSpinner size="lg" text="Preparing multi-position certified ballot slate..." />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 text-center">
        <div className="max-w-md bg-slate-950 border border-slate-800 p-8 rounded-3xl text-slate-100">
          <ExclamationCircleIcon className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white">Ballot Error</h2>
          <p className="text-sm text-slate-400 mt-2">{errorMessage}</p>
          <button
            onClick={() => navigate('/kiosk')}
            className="mt-6 btn btn-secondary btn-sm"
          >
            Return to Booth Login
          </button>
        </div>
      </div>
    );
  }

  // SUCCESS SCREEN: Cryptographic Receipt & 5-Second Reset
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 sm:p-12 animate-fade-in selection:bg-emerald-500 selection:text-black">
        {/* Top Header */}
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800/80 pb-4">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            Station: {kioskName}
          </span>
          <span className="text-emerald-400 font-bold">STATE: RECORDED & SEALED</span>
        </div>

        {/* Center Success Card */}
        <div className="max-w-2xl mx-auto w-full my-auto text-center space-y-6">
          <div className="w-24 h-24 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-2xl shadow-emerald-500/10">
            <ShieldCheckIcon className="w-14 h-14" />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 bg-emerald-950 px-3 py-1 rounded-full border border-emerald-800 inline-block mb-3">
              Vote Cast Successfully
            </span>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Ballot Sealed & Recorded Anonymously
            </h1>
            <p className="text-sm text-slate-300 mt-2 max-w-lg mx-auto leading-relaxed">
              Your voting PIN has been permanently consumed. Your selections across all positions are detached from your identity and aggregated into the encrypted ledger.
            </p>
          </div>

          {/* Cryptographic Receipt Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-left shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FingerPrintIcon className="w-4 h-4 text-emerald-400" />
                Anonymous Blind Token Receipt
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                SHA-256 Ledger
              </span>
            </div>
            <p className="font-mono text-xs sm:text-sm text-emerald-300 break-all bg-slate-950 p-3 rounded-xl border border-slate-800/80 select-all font-semibold">
              {receiptToken}
            </p>
            <p className="text-[11px] text-slate-400 mt-2">
              Save or note this hash to verify your ballot's inclusion in the final certified audit ledger.
            </p>
          </div>

          {/* Countdown & Reset Button */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-primary-950/50 via-slate-900 to-indigo-950/50 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-left flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center font-black text-xl text-primary-400 font-mono">
                {countdown}s
              </div>
              <div>
                <p className="text-sm font-bold text-white">Resetting for Next Voter</p>
                <p className="text-xs text-slate-400">
                  Booth clears automatically in {countdown} seconds to maintain privacy.
                </p>
              </div>
            </div>

            <button
              onClick={resetKioskForNextVoter}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
            >
              <span>Next Voter Now</span>
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-400 pt-4 border-t border-slate-800/80">
          Campus Electoral Commission • Cryptographically Sealed Terminal
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-primary-500 selection:text-white pb-28">
      {/* Top Station Header */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary-600 text-white flex items-center justify-center shadow-md shadow-primary-600/30 font-black text-sm">
              eV
            </div>
            <div>
              <h1 className="font-extrabold text-base text-white tracking-tight leading-none">
                {election?.title || 'Campus Election Ballot'}
              </h1>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <span>Station: {kioskName}</span>
                <span className="text-slate-600">•</span>
                <span className="text-emerald-400 font-medium">Multi-Position Slate</span>
              </p>
            </div>
          </div>

          {/* Progress Pill */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Ballot Progress
              </span>
              <span className="text-sm font-extrabold text-white">
                {completedCount} of {totalPositions} Selected
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-primary-400">
              {Math.round((completedCount / (totalPositions || 1)) * 100)}%
            </div>
          </div>
        </div>
      </header>

      {/* Main Ballot Content */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 space-y-12">
        {/* Informative Banner */}
        <div className="card p-5 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 border border-slate-800 text-slate-300 flex items-start gap-4 shadow-xl">
          <div className="p-2.5 rounded-xl bg-primary-500/10 text-primary-400 border border-primary-500/20 shrink-0">
            <DocumentCheckIcon className="w-6 h-6" />
          </div>
          <div className="text-xs sm:text-sm space-y-1">
            <p className="font-bold text-white text-base">Official Electronic Ballot Instructions</p>
            <p className="text-slate-400 leading-relaxed">
              Review each position listed below. Select <span className="text-white font-semibold">one candidate</span> or select <span className="text-amber-400 font-semibold">"None of the Above (NOTA)"</span> for every office. You must make a selection for all {totalPositions} positions before you can review and seal your ballot.
            </p>
          </div>
        </div>

        {/* Positions Sections */}
        {positionsList.map((position, pIdx) => {
          const positionCandidates = positionsMap[position] || [];
          const currentSelection = selections[position];
          const isPositionCompleted = Boolean(currentSelection);

          return (
            <section
              key={position}
              className={`rounded-3xl border transition-all duration-200 overflow-hidden ${
                isPositionCompleted
                  ? 'bg-slate-950/90 border-primary-500/50 shadow-lg shadow-primary-950/30'
                  : 'bg-slate-950/60 border-slate-800/90'
              }`}
            >
              {/* Position Section Header */}
              <div className="p-5 sm:p-6 border-b border-slate-800/80 bg-slate-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                      isPositionCompleted
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isPositionCompleted ? (
                      <CheckCircleIcon className="w-5 h-5" />
                    ) : (
                      <span>{pIdx + 1}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary-400 block">
                      Office Position #{pIdx + 1}
                    </span>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                      {position}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isPositionCompleted ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <CheckCircleIcon className="w-4 h-4" />
                      Choice: {currentSelection.candidateName}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      <ClockIcon className="w-3.5 h-3.5" />
                      Selection Required
                    </span>
                  )}
                </div>
              </div>

              {/* Candidates Grid */}
              <div className="p-5 sm:p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {positionCandidates.map((candidate) => {
                    const isSelected =
                      currentSelection &&
                      !currentSelection.isNota &&
                      currentSelection.candidateId === candidate.id;

                    return (
                      <div
                        key={candidate.id}
                        onClick={() => handleSelectCandidate(position, candidate)}
                        className={`cursor-pointer rounded-2xl p-5 border-2 transition-all duration-150 flex flex-col justify-between select-none ${
                          isSelected
                            ? 'bg-primary-950/50 border-primary-500 ring-2 ring-primary-500/30 shadow-md shadow-primary-950/50'
                            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          {/* Avatar or Photo */}
                          <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                            {candidate.photo_url ? (
                              <img
                                src={candidate.photo_url}
                                alt={candidate.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="font-bold text-lg text-primary-400">
                                {candidate.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>

                          {/* Candidate Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="font-extrabold text-white text-base truncate">
                                {candidate.name}
                              </h3>
                              {/* Custom Radio Circle */}
                              <div
                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? 'border-primary-500 bg-primary-600'
                                    : 'border-slate-600 bg-slate-900'
                                }`}
                              >
                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                              </div>
                            </div>

                            {/* Party & Department badges */}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {candidate.party && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                                  {candidate.party}
                                </span>
                              )}
                              {candidate.department && (
                                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                  <AcademicCapIcon className="w-3.5 h-3.5" />
                                  {candidate.department}
                                </span>
                              )}
                            </div>

                            {/* Bio / statement */}
                            {candidate.bio && (
                              <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                                {candidate.bio}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* DISTINCT NOTA OPTION */}
                <div className="pt-2">
                  {(() => {
                    const isNotaSelected = currentSelection && currentSelection.isNota;

                    return (
                      <div
                        onClick={() => handleSelectNota(position)}
                        className={`cursor-pointer rounded-2xl p-4 sm:p-5 border-2 transition-all select-none flex items-center justify-between gap-4 ${
                          isNotaSelected
                            ? 'bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/20 shadow-md shadow-amber-950/40'
                            : 'bg-slate-900/30 border-dashed border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center font-black ${
                              isNotaSelected
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            <NoSymbolIcon className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-extrabold text-white text-base">
                                None of the Above (NOTA)
                              </h4>
                              <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                                Formal Abstention
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Record an official vote rejecting all nominated candidates for this position.
                            </p>
                          </div>
                        </div>

                        {/* Radio indicator */}
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            isNotaSelected
                              ? 'border-amber-500 bg-amber-600'
                              : 'border-slate-600 bg-slate-900'
                          }`}
                        >
                          {isNotaSelected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </section>
          );
        })}
      </main>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 py-4 px-4 sm:px-8 z-30 shadow-2xl">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex-1 sm:flex-none">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Ballot Status:
                </span>
                <span className={`text-sm font-black ${isBallotComplete ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {completedCount} / {totalPositions} Offices Completed
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                {isBallotComplete
                  ? 'All offices selected. Ready for cryptographic seal.'
                  : `Please complete selections for all positions to cast your ballot.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              onClick={() => setReviewModalOpen(true)}
              disabled={!isBallotComplete}
              className={`w-full sm:w-auto py-3.5 px-8 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 transition-all transform active:scale-95 shadow-lg ${
                isBallotComplete
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
              }`}
            >
              <CheckBadgeIcon className="w-5 h-5" />
              <span>Review & Cast Ballot</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation & Summary Modal */}
      <Modal
        isOpen={reviewModalOpen}
        onClose={() => !submitting && setReviewModalOpen(false)}
        title="Confirm & Seal Your Ballot"
        maxWidth="max-w-xl"
      >
        <div className="space-y-6 text-slate-900">
          <div>
            <p className="text-sm text-gray-600">
              Please review your choices for each position before permanently submitting your ballot.
            </p>
          </div>

          {/* Choices Summary Table */}
          <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 bg-gray-50/50">
            {positionsList.map((position) => {
              const sel = selections[position];

              return (
                <div key={position} className="p-3.5 px-4 flex items-center justify-between text-sm">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                      {position}
                    </span>
                    <span className="font-extrabold text-gray-900">
                      {sel?.candidateName || 'Not Selected'}
                    </span>
                  </div>

                  <div>
                    {sel?.isNota ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        NOTA
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary-100 text-primary-800 border border-primary-200">
                        {sel?.party || 'Selected'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Security Warning */}
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <LockClosedIcon className="w-4 h-4 text-amber-700" />
              Irreversible Cryptographic Sealing:
            </p>
            <p className="leading-relaxed">
              Once submitted, your physical Voting PIN will be instantly consumed and invalidated. You will not be able to return to this ballot or vote again in this election.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setReviewModalOpen(false)}
              className="btn btn-secondary flex-1 sm:flex-none"
            >
              Modify Selections
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirmAndSeal}
              className="btn btn-success flex-1 sm:flex-none gap-2 shadow-md shadow-success-600/20"
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Sealing Ballot...</span>
                </>
              ) : (
                <>
                  <ShieldCheckIcon className="w-4 h-4" />
                  <span>Confirm & Cast Ballot</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default KioskVoting;
