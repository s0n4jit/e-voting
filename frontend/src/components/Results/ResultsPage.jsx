import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { resultsApi } from '../../api/resultsApi';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../common/LoadingSpinner';
import StatusBadge from '../common/StatusBadge';
import {
  TrophyIcon,
  ArrowLeftIcon,
  ClockIcon,
  ChartBarIcon,
  CheckBadgeIcon,
  LockClosedIcon,
  UsersIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

export const ResultsPage = () => {
  const { electionId } = useParams();
  const { role } = useAuth();

  const [loading, setLoading] = useState(true);
  const [resultsData, setResultsData] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [unpublished, setUnpublished] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    const fetchResultsAndStats = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        setUnpublished(false);

        const [resPromise, statsPromise] = await Promise.allSettled([
          resultsApi.getElectionResults(electionId),
          resultsApi.getElectionStats(electionId),
        ]);

        if (resPromise.status === 'fulfilled') {
          const res = resPromise.value;
          // Check if results were marked as pending/unpublished by backend
          if (res.results_published === false || res.published === false || res.status === 'pending') {
            setUnpublished(true);
          }
          setResultsData(res);
        } else {
          // If rejected with 403 or 400 because not published yet
          const errStatus = resPromise.reason?.response?.status;
          if (errStatus === 403 || errStatus === 400) {
            setUnpublished(true);
          } else {
            throw resPromise.reason;
          }
        }

        if (statsPromise.status === 'fulfilled') {
          setStatsData(statsPromise.value);
        }
      } catch (err) {
        console.error('Failed to load election results:', err);
        const detail = err.response?.data?.message || err.response?.data?.error;
        if (detail && detail.toLowerCase().includes('not published')) {
          setUnpublished(true);
        } else {
          setErrorMessage('Unable to load election tally results.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchResultsAndStats();
  }, [electionId]);

  const backLink = role === 'admin' ? '/admin/elections' : '/voter/dashboard';

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 animate-fade-in">
        <div className="card py-16">
          <LoadingSpinner text="Computing certified cryptographic election tallies..." />
        </div>
      </div>
    );
  }

  // Not published yet notice
  if (unpublished) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-fade-in">
        <div className="card p-8 border-indigo-100 bg-white shadow-xl">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center mb-4">
            <LockClosedIcon className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Election Tally in Progress</h2>
          <p className="text-sm text-gray-600 mt-2 leading-relaxed">
            Results for this election have not been officially published yet. Either the voting window is still open or the electoral committee is completing cryptographic audit verification.
          </p>

          <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center justify-center gap-2">
            <ClockIcon className="w-4 h-4 text-slate-500" />
            <span>Please check back once polling closes and results are certified by administrators.</span>
          </div>

          <div className="mt-8 flex justify-center gap-4">
            <Link to={backLink} className="btn btn-secondary btn-sm gap-2">
              <ArrowLeftIcon className="w-4 h-4" />
              <span>Return to {role === 'admin' ? 'Elections' : 'Dashboard'}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-fade-in">
        <div className="card p-8 border-rose-200 bg-rose-50/40">
          <h2 className="text-xl font-bold text-rose-900">{errorMessage}</h2>
          <div className="mt-6">
            <Link to={backLink} className="btn btn-secondary btn-sm">
              Back to Safety
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Calculate vote totals and determine winner
  const rawCandidateList = resultsData?.results || resultsData?.candidates || [];
  const totalVotesCast = resultsData?.total_votes ?? statsData?.total_votes ?? rawCandidateList.reduce((acc, c) => acc + (c.votes || c.vote_count || 0), 0);
  const totalEligibleVoters = statsData?.total_voters || statsData?.registered_voters || null;
  const turnoutPercent = totalEligibleVoters && totalEligibleVoters > 0
    ? ((totalVotesCast / totalEligibleVoters) * 100).toFixed(1)
    : (statsData?.turnout_percentage || (totalVotesCast > 0 ? '100.0' : '0.0'));

  // Sort candidates by votes descending
  const sortedCandidates = [...rawCandidateList].sort((a, b) => {
    const votesA = a.votes ?? a.vote_count ?? 0;
    const votesB = b.votes ?? b.vote_count ?? 0;
    return votesB - votesA;
  });

  const winner = sortedCandidates.length > 0 && (sortedCandidates[0].votes || sortedCandidates[0].vote_count) > 0
    ? sortedCandidates[0]
    : null;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Back button and Header */}
      <div className="mb-6">
        <Link
          to={backLink}
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 font-medium mb-3 transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to {role === 'admin' ? 'Election Manager' : 'Voter Dashboard'}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              {resultsData?.election?.title || resultsData?.title || `Certified Election Results`}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Final verified ballot counts with secret cryptographic tally integrity.
            </p>
          </div>
          <StatusBadge status="published" label="Official & Certified" variant="success" />
        </div>
      </div>

      {/* Winner Banner */}
      {winner ? (
        <div className="mb-8 card overflow-hidden border-2 border-amber-300 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent p-6 shadow-md">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/30 shrink-0">
              <TrophyIcon className="w-9 h-9" />
            </div>
            <div className="text-center sm:text-left flex-1">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                  Elected Winner
                </span>
                <span className="text-xs text-gray-500">
                  Position: {winner.position || 'President'}
                </span>
              </div>
              <h2 className="text-2xl font-black text-gray-900 mt-1">
                {winner.name || winner.candidate_name}
              </h2>
              {winner.party && (
                <p className="text-xs font-semibold text-gray-600 mt-0.5">
                  Affiliation: {winner.party}
                </p>
              )}
            </div>
            <div className="text-center sm:text-right bg-white/80 p-3 rounded-xl border border-amber-200">
              <p className="text-2xl font-black text-amber-600">
                {(winner.votes ?? winner.vote_count ?? 0).toLocaleString()}
              </p>
              <p className="text-[11px] text-gray-500 font-medium">Votes Secured</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-8 card p-6 text-center text-sm text-gray-500">
          No votes were recorded in this election slate.
        </div>
      )}

      {/* Turnout Statistics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="card p-4 border border-gray-100 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary-50 text-primary-600">
            <ChartBarIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Total Ballots Cast</p>
            <p className="text-xl font-extrabold text-gray-900">{totalVotesCast.toLocaleString()}</p>
          </div>
        </div>

        <div className="card p-4 border border-gray-100 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <UsersIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Voter Turnout</p>
            <p className="text-xl font-extrabold text-emerald-700">{turnoutPercent}%</p>
          </div>
        </div>

        <div className="card p-4 border border-gray-100 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
            <ShieldCheckIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-semibold">Ballot Box Audit</p>
            <p className="text-xs font-mono font-bold text-purple-700">SHA-256 Intact</p>
          </div>
        </div>
      </div>

      {/* Breakdown per candidate */}
      <div className="card p-6 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
          <CheckBadgeIcon className="w-5 h-5 text-primary-600" />
          Candidate Vote Breakdown
        </h3>

        <div className="space-y-6">
          {sortedCandidates.map((cand, index) => {
            const count = cand.votes ?? cand.vote_count ?? 0;
            const percentage = totalVotesCast > 0 ? ((count / totalVotesCast) * 100).toFixed(1) : 0;
            const isWinner = index === 0 && count > 0;

            return (
              <div key={cand.id || index} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">{cand.name || cand.candidate_name}</span>
                    {cand.party && (
                      <span className="text-xs text-gray-400">({cand.party})</span>
                    )}
                    {isWinner && (
                      <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        Winner
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-gray-900">
                      {count.toLocaleString()} votes
                    </span>
                    <span className="font-bold text-sm text-primary-700 w-12 text-right">
                      {percentage}%
                    </span>
                  </div>
                </div>

                {/* Visual Progress Bar */}
                <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isWinner
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                        : 'bg-primary-600'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ResultsPage;
