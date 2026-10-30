import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { voterApi } from '../../api/voterApi';
import LoadingSpinner from '../common/LoadingSpinner';
import { toast } from 'react-hot-toast';
import {
  ShieldCheckIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  UserIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  FingerPrintIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  LockClosedIcon,
  NoSymbolIcon,
  CheckBadgeIcon,
  DocumentCheckIcon,
  PencilSquareIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

export const VotingPage = () => {
  const { electionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [electionInfo, setElectionInfo] = useState(null);
  const [positionsData, setPositionsData] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState({});
  const [hasAlreadyVoted, setHasAlreadyVoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voteReceipt, setVoteReceipt] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    const loadElectionAndBallot = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);

        // Check if voter has already voted for this election
        try {
          const statusRes = await voterApi.getVoterStatus(electionId);
          if (statusRes.has_voted) {
            setHasAlreadyVoted(true);
          }
        } catch (e) {
          console.warn('Could not verify voter status ahead of time', e);
        }

        // Fetch structured ballot
        const data = await voterApi.getElectionBallot(electionId);

        let positions = [];
        let elec = data.election || { id: electionId, title: data.title || 'General Election' };

        if (data.positions && Array.isArray(data.positions) && data.positions.length > 0) {
          positions = data.positions;
        } else if (data.candidates && Array.isArray(data.candidates)) {
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
          setErrorMessage('No candidates or portfolios registered for this election.');
        } else {
          setPositionsData(positions);
          setElectionInfo(elec);
        }
      } catch (err) {
        console.error('Failed to load ballot data:', err);
        setErrorMessage(
          err?.response?.data?.message ||
            'Unable to load ballot or candidate list. Please verify the election is active.'
        );
      } finally {
        setLoading(false);
      }
    };

    loadElectionAndBallot();
  }, [electionId]);

  const totalPositions = positionsData.length;
  const isReviewStep = currentStep === totalPositions;
  const currentPositionObj = !isReviewStep ? positionsData[currentStep] : null;
  const currentPositionName = currentPositionObj?.position || '';

  const completedCount = useMemo(() => {
    return positionsData.filter((p) => Boolean(selections[p.position])).length;
  }, [positionsData, selections]);

  const activeSelection = currentPositionName ? selections[currentPositionName] : null;

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

  const handleSubmitBallot = async () => {
    const missing = positionsData.filter((p) => !selections[p.position]);
    if (missing.length > 0) {
      toast.error(`Missing choices for: ${missing.map((m) => m.position).join(', ')}`);
      const firstMissingIndex = positionsData.findIndex((p) => !selections[p.position]);
      if (firstMissingIndex !== -1) setCurrentStep(firstMissingIndex);
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const formattedSelections = positionsData.map((p) => {
      const sel = selections[p.position];
      return {
        position: p.position,
        candidate_id: sel.isNota ? null : sel.candidateId,
        is_nota: Boolean(sel.isNota),
      };
    });

    try {
      const response = await voterApi.castMultiPositionBallot(electionId, formattedSelections);
      setVoteReceipt(response);
      setHasAlreadyVoted(true);
      toast.success('Your secret ballot has been cast successfully!');
    } catch (err) {
      console.error('Failed to cast ballot:', err);
      const detail =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        'Failed to submit ballot. You may have already voted.';
      setErrorMessage(detail);
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <LoadingSpinner size="lg" text="Loading official Student Union ballot..." />
      </div>
    );
  }

  // Already Voted View
  if (hasAlreadyVoted && !voteReceipt) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 animate-fade-in">
        <div className="card p-8 text-center border-emerald-200 bg-emerald-50/50 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircleIcon className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ballot Already Cast</h2>
          <p className="text-sm text-gray-600 mb-6">
            You have already recorded your vote in <strong>{electionInfo?.title || 'this election'}</strong>.
            Under single-vote secret ballot rules, multiple submissions are forbidden.
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/voter/dashboard" className="btn btn-secondary btn-sm">
              Back to Dashboard
            </Link>
            <Link to={`/voter/results/${electionId}`} className="btn btn-primary btn-sm">
              View Election Results
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Vote Success Receipt View
  if (voteReceipt) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 animate-fade-in">
        <div className="card p-8 text-center border-emerald-300 bg-white shadow-xl rounded-2xl relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-4">
            <ShieldCheckIcon className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-extrabold text-gray-900 mb-1">
            Secret Ballot Recorded Successfully!
          </h2>
          <p className="text-sm text-emerald-600 font-semibold mb-6">
            {electionInfo?.title || 'General Election of the Student Union 2026–27'}
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-left mb-6 space-y-3">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <FingerPrintIcon className="w-5 h-5 text-primary-600" />
              <span>Cryptographic Receipt Proof</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Your ballot choices have been sealed with untraceable cryptographic blind tokens.
              Your student voter ID has been burned from the eligible voter whitelist.
            </p>

            {voteReceipt?.receipts && voteReceipt.receipts.length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <span className="text-[11px] font-mono text-slate-400 block mb-1 uppercase tracking-wider">
                  Confirmed Portfolios ({voteReceipt.receipts.length}):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {voteReceipt.receipts.map((r, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[11px] font-mono bg-white border border-slate-300 px-2 py-0.5 rounded text-emerald-700"
                    >
                      <CheckCircleIcon className="w-3 h-3 text-emerald-500" />
                      {r.position}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-center gap-4">
            <Link to="/voter/dashboard" className="btn btn-primary">
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN GUIDED VOTING WIZARD (VOTER VIEW) ──────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-200 mb-6">
        <div>
          <Link
            to="/voter/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 mb-2"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            {electionInfo?.title || 'General Election of the Student Union 2026–27'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Single-Choice Secret Ballot • 9 Executive Portfolios • NOTA Enabled
          </p>
        </div>

        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full text-xs text-emerald-800 self-start sm:self-auto">
          <span className="font-semibold">Decided:</span>
          <span className="font-bold text-emerald-700">
            {completedCount} / {totalPositions}
          </span>
          <span>Portfolios</span>
        </div>
      </div>

      {/* Stepper Navigation Pills */}
      <div className="mb-6 overflow-x-auto no-scrollbar pb-1">
        <div className="flex items-center gap-1.5 min-w-max">
          {positionsData.map((p, idx) => {
            const isSelected = Boolean(selections[p.position]);
            const isCurrent = idx === currentStep;

            return (
              <button
                key={idx}
                onClick={() => handleJumpToStep(idx)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  isCurrent
                    ? 'bg-primary-600 text-white shadow-sm ring-2 ring-primary-500/30'
                    : isSelected
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {isSelected ? (
                  <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-[10px] flex items-center justify-center text-gray-600">
                    {idx + 1}
                  </span>
                )}
                <span>{p.position}</span>
              </button>
            );
          })}

          <button
            onClick={() => handleJumpToStep(totalPositions)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              isReviewStep
                ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/30'
                : completedCount === totalPositions
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-300 hover:bg-indigo-100'
                : 'bg-gray-100 text-gray-400 border border-gray-200'
            }`}
          >
            <DocumentCheckIcon className="w-3.5 h-3.5" />
            <span>Review</span>
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2">
          <ExclamationCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Wizard Body */}
      {!isReviewStep ? (
        <div className="space-y-6">
          {/* Active Position Info Card */}
          <div className="card p-6 border-primary-200 bg-gradient-to-r from-primary-50/50 to-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-primary-100 pb-3 mb-3">
              <div>
                <span className="text-xs font-bold text-primary-700 uppercase tracking-widest block">
                  Portfolio {currentStep + 1} of {totalPositions}
                </span>
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                  {currentPositionName}
                </h2>
              </div>
              <div>
                {activeSelection ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    Choice Selected
                  </span>
                ) : (
                  <span className="text-xs text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full font-medium">
                    Choice Pending
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-600">
              Select one candidate for {currentPositionName}, or select NOTA to register an abstention.
            </p>
          </div>

          {/* Candidate Cards Grid */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
              Nominated Candidates
            </h3>

            <div className="grid grid-cols-1 gap-3">
              {currentPositionObj?.candidates?.map((candidate) => {
                const isSelected = activeSelection?.candidateId === candidate.id && !activeSelection?.isNota;

                return (
                  <div
                    key={candidate.id}
                    onClick={() => handleSelectCandidate(candidate)}
                    className={`card p-4 sm:p-5 cursor-pointer transition-all flex items-start gap-4 ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50/40 ring-2 ring-primary-500/30 shadow-md'
                        : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50/60'
                    }`}
                  >
                    <div className="mt-1">
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        {isSelected && <CheckBadgeIcon className="w-5 h-5 text-white" />}
                      </div>
                    </div>

                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
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
                        className="w-full h-full flex items-center justify-center text-gray-500 font-bold"
                        style={{ display: candidate.photo_url ? 'none' : 'flex' }}
                      >
                        {candidate.name.charAt(0)}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                        <h4 className="text-base font-bold text-gray-900">{candidate.name}</h4>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 w-fit">
                          {candidate.party || 'Independent'}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-primary-700 mb-1 flex items-center gap-1.5">
                        <AcademicCapIcon className="w-3.5 h-3.5" />
                        <span>{candidate.department || 'Department of General Studies'}</span>
                      </p>
                      {candidate.bio && (
                        <p className="text-xs text-gray-500 line-clamp-2">"{candidate.bio}"</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* NOTA Option */}
            {currentPositionObj?.allow_nota !== false && (
              <div className="pt-2">
                <div
                  onClick={handleSelectNota}
                  className={`card p-4 cursor-pointer transition-all flex items-center gap-4 ${
                    activeSelection?.isNota
                      ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/30 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center border-gray-300 bg-white">
                    {activeSelection?.isNota && (
                      <div className="w-3 h-3 rounded-full bg-amber-600" />
                    )}
                  </div>

                  <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                    <NoSymbolIcon className="w-5 h-5" />
                  </div>

                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-gray-800">None of the Above (NOTA)</h4>
                    <p className="text-xs text-gray-500">
                      Abstain from voting for any of the listed candidates for {currentPositionName}.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Review Screen */
        <div className="space-y-6">
          <div className="card p-6 bg-gradient-to-r from-indigo-50/50 to-white border-indigo-200">
            <span className="text-xs font-bold text-indigo-700 uppercase tracking-widest block mb-1">
              Final Verification
            </span>
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Review Your Selections
            </h2>
            <p className="text-xs text-gray-600 mt-1">
              Verify your choices across all {totalPositions} portfolios before sealing your ballot.
              You can click "Modify" to adjust any selection.
            </p>
          </div>

          <div className="card divide-y divide-gray-100 overflow-hidden">
            {positionsData.map((p, idx) => {
              const sel = selections[p.position];

              return (
                <div
                  key={idx}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/60 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-gray-100 font-bold text-xs flex items-center justify-center text-gray-600 flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="text-xs text-gray-500 block font-medium">
                        {p.position}
                      </span>
                      {sel ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          {sel.isNota ? (
                            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              None of the Above (NOTA)
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-gray-900">
                              {sel.candidateName}{' '}
                              <span className="text-xs font-normal text-gray-500">
                                ({sel.party})
                              </span>
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-red-500 font-semibold">Not Selected</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleJumpToStep(idx)}
                    className="btn btn-ghost btn-xs text-primary-600 gap-1 self-end sm:self-auto"
                  >
                    <PencilSquareIcon className="w-3.5 h-3.5" />
                    <span>Modify</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stepper Bottom Controls */}
      <div className="pt-6 border-t border-gray-200 mt-6 flex items-center justify-between gap-4">
        <button
          onClick={handleBack}
          disabled={currentStep === 0 || submitting}
          className="btn btn-secondary btn-sm gap-1.5"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          <span>Previous</span>
        </button>

        {!isReviewStep ? (
          <button
            onClick={handleNext}
            disabled={!activeSelection}
            className="btn btn-primary btn-sm gap-1.5"
          >
            <span>{currentStep === totalPositions - 1 ? 'Go to Review' : 'Next Portfolio'}</span>
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmitBallot}
            disabled={submitting || completedCount < totalPositions}
            className="btn btn-primary gap-2 shadow-lg shadow-primary-600/20"
          >
            {submitting ? (
              <>
                <ArrowPathIcon className="w-4 h-4 animate-spin text-white" />
                <span>Sealing Secret Ballot...</span>
              </>
            ) : (
              <>
                <LockClosedIcon className="w-4 h-4" />
                <span>Confirm & Cast Secret Ballot</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default VotingPage;
