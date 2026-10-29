import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { voterApi } from '../../api/voterApi';
import LoadingSpinner from '../common/LoadingSpinner';
import Modal from '../common/Modal';
import { toast } from 'react-hot-toast';
import {
  ShieldCheckIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  UserIcon,
  ArrowLeftIcon,
  FingerPrintIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';

export const VotingPage = () => {
  const { electionId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState([]);
  const [electionInfo, setElectionInfo] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [hasAlreadyVoted, setHasAlreadyVoted] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voteReceipt, setVoteReceipt] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    const loadElectionAndCandidates = async () => {
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

        // Fetch candidate list
        const res = await voterApi.getElectionCandidates(electionId);
        const candidateList = Array.isArray(res) ? res : (res.candidates || []);
        setCandidates(candidateList);

        if (res.election) {
          setElectionInfo(res.election);
        } else {
          // If election info is not nested, try getting it from active elections
          try {
            const activeRes = await voterApi.getActiveElections();
            const list = Array.isArray(activeRes) ? activeRes : (activeRes.elections || []);
            const found = list.find((e) => String(e.id) === String(electionId));
            if (found) setElectionInfo(found);
          } catch (e) {
            // Non-critical
          }
        }
      } catch (err) {
        console.error('Failed to load ballot data:', err);
        setErrorMessage('Unable to load ballot or candidate list. Please verify the election is active.');
      } finally {
        setLoading(false);
      }
    };

    loadElectionAndCandidates();
  }, [electionId]);

  const handleCastVote = async () => {
    if (!selectedCandidateId) {
      toast.error('Please select a candidate before proceeding.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await voterApi.castVote(electionId, selectedCandidateId);
      setConfirmModalOpen(false);
      setVoteReceipt(response);
      toast.success('Your vote was cast successfully!');
    } catch (err) {
      console.error('Failed to cast ballot:', err);
      const detail = err.response?.data?.message || err.response?.data?.error || 'Failed to submit ballot. You may have already voted.';
      toast.error(detail);
      setConfirmModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId);

  // Success view with receipt
  if (voteReceipt) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 animate-fade-in">
        <div className="card text-center p-8 border-emerald-200 bg-white shadow-xl">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-4">
            <CheckCircleIcon className="w-10 h-10" />
          </div>

          <h2 className="text-2xl font-bold text-gray-900">Ballot Cast Successfully!</h2>
          <p className="text-sm text-gray-600 mt-2">
            Your vote has been cryptographically recorded in the anonymous ballot box.
          </p>

          <div className="mt-8 p-4 rounded-xl bg-slate-50 border border-slate-200 text-left font-mono text-xs">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 font-sans font-semibold text-gray-700">
              <span className="flex items-center gap-1.5">
                <FingerPrintIcon className="w-4 h-4 text-primary-600" />
                Blind Cryptographic Receipt
              </span>
              <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                Verified
              </span>
            </div>

            <div className="space-y-1.5 break-all text-slate-700">
              <div>
                <span className="text-slate-400">Election ID: </span>
                <span className="text-slate-900 font-bold">{electionId}</span>
              </div>
              {voteReceipt.token_hash && (
                <div>
                  <span className="text-slate-400">Token Hash: </span>
                  <span className="text-indigo-600 font-semibold">{voteReceipt.token_hash}</span>
                </div>
              )}
              {voteReceipt.receipt_id && (
                <div>
                  <span className="text-slate-400">Receipt ID: </span>
                  <span className="text-slate-900">{voteReceipt.receipt_id}</span>
                </div>
              )}
              <div>
                <span className="text-slate-400">Timestamp: </span>
                <span>{new Date().toISOString()}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-indigo-50/60 rounded-lg text-xs text-indigo-800 text-left">
            <strong>Privacy Note:</strong> This receipt proves your vote was accepted into the tally. Because your ballot is blinded, this hash cannot reveal which candidate you voted for.
          </div>

          <div className="mt-8 flex justify-center gap-4">
            <Link to="/voter/dashboard" className="btn btn-primary px-6">
              Return to Voter Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Already voted guard
  if (hasAlreadyVoted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center animate-fade-in">
        <div className="card p-8 border-amber-200">
          <ExclamationTriangleIcon className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900">Ballot Already Cast</h2>
          <p className="text-sm text-gray-600 mt-2">
            You have already participated in this election. Under campus election rules, only one secret ballot per eligible voter is permitted.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/voter/dashboard" className="btn btn-secondary btn-sm gap-2">
              <ArrowLeftIcon className="w-4 h-4" />
              Back to Dashboard
            </Link>
            <Link to={`/voter/results/${electionId}`} className="btn btn-primary btn-sm">
              View Results Status
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Navigation & Header */}
      <div className="mb-6">
        <Link
          to="/voter/dashboard"
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 font-medium mb-3 transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to Dashboard
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              {electionInfo?.title || 'Official Ballot Paper'}
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {electionInfo?.description || 'Select one verified candidate to cast your official secret ballot.'}
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
            <ShieldCheckIcon className="w-4 h-4" />
            <span>Cryptographic Session Active</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card py-16">
          <LoadingSpinner text="Preparing candidate slate..." />
        </div>
      ) : errorMessage ? (
        <div className="card p-8 text-center bg-rose-50/50 border-rose-200">
          <ExclamationTriangleIcon className="w-10 h-10 text-rose-500 mx-auto mb-2" />
          <h3 className="text-base font-semibold text-rose-900">{errorMessage}</h3>
          <Link to="/voter/dashboard" className="mt-4 inline-block btn btn-secondary btn-sm">
            Return to Dashboard
          </Link>
        </div>
      ) : candidates.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500">No registered candidates found for this election.</p>
          <Link to="/voter/dashboard" className="mt-4 inline-block btn btn-secondary btn-sm">
            Back to Dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-2.5">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              <strong>Careful:</strong> Your selection is final upon submission. You will be asked to confirm your choice before the blind cryptographic hash is registered.
            </span>
          </div>

          {/* Candidate slate cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {candidates.map((cand) => {
              const isSelected = selectedCandidateId === cand.id;

              return (
                <div
                  key={cand.id}
                  onClick={() => setSelectedCandidateId(cand.id)}
                  className={`cursor-pointer rounded-xl border-2 p-5 transition-all duration-150 relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-primary-600 bg-primary-50/30 shadow-md ring-2 ring-primary-500/20'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-xs'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-base transition-colors ${
                            isSelected
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {cand.name ? cand.name.charAt(0).toUpperCase() : <UserIcon className="w-6 h-6" />}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-900 text-base leading-tight">
                            {cand.name}
                          </h3>
                          <p className="text-xs font-semibold text-primary-700 flex items-center gap-1 mt-0.5">
                            <AcademicCapIcon className="w-3.5 h-3.5" />
                            {cand.position || 'Candidate'}
                          </p>
                        </div>
                      </div>

                      {/* Custom Radio checkmark indicator */}
                      <div
                        className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                          isSelected
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-gray-300 bg-white'
                        }`}
                      >
                        {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-white" />}
                      </div>
                    </div>

                    {cand.party && (
                      <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                        <BuildingOfficeIcon className="w-3.5 h-3.5 text-slate-500" />
                        <span>{cand.party}</span>
                      </div>
                    )}

                    {cand.bio && (
                      <p className="mt-3 text-xs text-gray-600 line-clamp-3 leading-relaxed border-t border-gray-100 pt-3">
                        {cand.bio}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
                    <span>Candidate #{cand.id}</span>
                    <span className={`font-medium ${isSelected ? 'text-primary-600' : 'text-gray-400'}`}>
                      {isSelected ? 'Selected' : 'Click to select'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="pt-4 flex items-center justify-between border-t border-gray-200">
            <span className="text-xs text-gray-500">
              {selectedCandidate ? (
                <>Selected: <strong className="text-gray-900">{selectedCandidate.name}</strong> ({selectedCandidate.position || 'Candidate'})</>
              ) : (
                'Please select a candidate to enable submission.'
              )}
            </span>

            <button
              type="button"
              disabled={!selectedCandidateId || submitting}
              onClick={() => setConfirmModalOpen(true)}
              className="btn btn-primary px-6 py-2.5 text-sm gap-2 shadow-md shadow-primary-500/20"
            >
              <span>Review & Cast Ballot</span>
              <ShieldCheckIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={confirmModalOpen}
        onClose={() => !submitting && setConfirmModalOpen(false)}
        title="Confirm Anonymous Secret Ballot"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Irreversible Action</p>
              <p className="text-xs mt-1">
                Are you sure? Once cast, your ballot is anonymous and cannot be changed or undone.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 text-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">
              Ballot Summary
            </p>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Candidate:</span>
              <span className="font-bold text-gray-900">{selectedCandidate?.name}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Position:</span>
              <span className="font-semibold text-gray-800">{selectedCandidate?.position || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-600">Party/Affiliation:</span>
              <span className="text-gray-800">{selectedCandidate?.party || 'Independent'}</span>
            </div>
          </div>

          <p className="text-xs text-gray-500 italic">
            By clicking "Confirm & Cast Ballot", your vote is hashed, separated from your student identity, and sealed in the ballot ledger.
          </p>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => setConfirmModalOpen(false)}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleCastVote}
              className="btn btn-primary btn-sm px-5"
            >
              {submitting ? 'Casting Ballot...' : 'Confirm & Cast Ballot'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default VotingPage;
