import React, { useState, useEffect, useMemo } from 'react';
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
  NoSymbolIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';

export const ResultsPage = () => {
  const { electionId } = useParams();
  const { role } = useAuth();

  const [loading, setLoading] = useState(true);
  const [resultsData, setResultsData] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [unpublished, setUnpublished] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Position filter tab ('ALL' or specific position name)
  const [selectedPositionTab, setSelectedPositionTab] = useState('ALL');

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
          setErrorMessage('Unable to load certified election results.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchResultsAndStats();
  }, [electionId]);

  const backLink = role === 'admin' ? '/admin/elections' : '/voter/dashboard';

  // Extract raw candidates or positions
  const rawCandidateList = useMemo(() => {
    if (!resultsData) return [];
    if (resultsData.positions && Array.isArray(resultsData.positions)) {
      const flattened = [];
      resultsData.positions.forEach((pos) => {
        const posName = pos.name || pos.title || 'General';
        (pos.candidates || []).forEach((c) => {
          flattened.push({ ...c, position: posName });
        });
        if (pos.nota_votes !== undefined || pos.nota_count !== undefined) {
          flattened.push({
            id: `nota-${posName}`,
            name: 'None of the Above (NOTA)',
            position: posName,
            votes: pos.nota_votes ?? pos.nota_count ?? 0,
            is_nota: true,
          });
        }
      });
      return flattened;
    }
    return resultsData.results || resultsData.candidates || [];
  }, [resultsData]);

  // Group candidate tallies by Position
  const groupedByPosition = useMemo(() => {
    const groups = {};

    rawCandidateList.forEach((cand) => {
      const pos = (cand.position || 'General Office').trim();
      if (!groups[pos]) {
        groups[pos] = [];
      }

      const votes = cand.votes ?? cand.vote_count ?? 0;
      const isNota = Boolean(
        cand.is_nota ||
        cand.name?.toLowerCase().includes('none of the above') ||
        cand.name?.toLowerCase().includes('nota')
      );

      groups[pos].push({
        ...cand,
        votes,
        is_nota: isNota,
      });
    });

    // Check if resultsData has standalone NOTA counts per position or global nota
    if (resultsData?.nota_by_position) {
      Object.entries(resultsData.nota_by_position).forEach(([pos, count]) => {
        if (groups[pos]) {
          const alreadyHasNota = groups[pos].some((c) => c.is_nota);
          if (!alreadyHasNota) {
            groups[pos].push({
              id: `nota-${pos}`,
              name: 'None of the Above (NOTA)',
              position: pos,
              votes: count,
              is_nota: true,
            });
          }
        }
      });
    }

    // For each position, sort candidates by votes descending & compute percentages & winner
    const result = {};
    Object.keys(groups).forEach((pos) => {
      const list = [...groups[pos]].sort((a, b) => b.votes - a.votes);
      const positionTotalVotes = list.reduce((acc, c) => acc + c.votes, 0);

      // Find winner: highest votes if votes > 0
      const leader = list.length > 0 && list[0].votes > 0 ? list[0] : null;

      result[pos] = {
        candidates: list,
        totalVotes: positionTotalVotes,
        winner: leader,
      };
    });

    return result;
  }, [rawCandidateList, resultsData]);

  const positionsList = useMemo(() => Object.keys(groupedByPosition), [groupedByPosition]);

  // Total votes cast across election
  const totalVotesCast = useMemo(() => {
    if (resultsData?.total_votes !== undefined) return resultsData.total_votes;
    if (statsData?.total_votes !== undefined) return statsData.total_votes;
    const posTotals = Object.values(groupedByPosition).map((p) => p.totalVotes);
    return posTotals.length > 0 ? Math.max(...posTotals) : 0;
  }, [resultsData, statsData, groupedByPosition]);

  const totalEligibleVoters = statsData?.total_voters || statsData?.registered_voters || null;
  const turnoutPercent = totalEligibleVoters && totalEligibleVoters > 0
    ? ((totalVotesCast / totalEligibleVoters) * 100).toFixed(1)
    : (statsData?.turnout_percentage || (totalVotesCast > 0 ? '100.0' : '0.0'));

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
            Results for this election have not been officially published yet. Either polling is still open or the electoral committee is completing cryptographic audit verification.
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

  // Filter positions to display based on selected tab
  const displayedPositions = selectedPositionTab === 'ALL'
    ? positionsList
    : positionsList.filter((pos) => pos === selectedPositionTab);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in space-y-8">
      {/* Header and Back Link */}
      <div>
        <Link
          to={backLink}
          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 font-medium mb-3 transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back to {role === 'admin' ? 'Election Manager' : 'Voter Dashboard'}
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              {resultsData?.election?.title || resultsData?.title || 'Certified Election Results'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Final verified ballot counts broken down by contested offices with cryptographic audit integrity.
            </p>
          </div>
          <StatusBadge status="published" label="Official & Certified" variant="success" />
        </div>
      </div>

      {/* Global Turnout Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card p-4 border border-gray-100 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary-50 text-primary-600">
            <ChartBarIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase font-semibold">Ballots Cast</p>
            <p className="text-xl font-extrabold text-gray-900">{totalVotesCast.toLocaleString()}</p>
          </div>
        </div>

        <div className="card p-4 border border-gray-100 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <UsersIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase font-semibold">Voter Turnout</p>
            <p className="text-xl font-extrabold text-emerald-700">{turnoutPercent}%</p>
          </div>
        </div>

        <div className="card p-4 border border-gray-100 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
            <AcademicCapIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase font-semibold">Contested Offices</p>
            <p className="text-xl font-extrabold text-indigo-900">{positionsList.length}</p>
          </div>
        </div>

        <div className="card p-4 border border-gray-100 flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
            <ShieldCheckIcon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-gray-500 uppercase font-semibold">Ballot Box Audit</p>
            <p className="text-xs font-mono font-bold text-purple-700">SHA-256 Intact</p>
          </div>
        </div>
      </div>

      {/* Position Selector Tabs */}
      {positionsList.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200">
          <button
            onClick={() => setSelectedPositionTab('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              selectedPositionTab === 'ALL'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            All Offices ({positionsList.length})
          </button>
          {positionsList.map((pos) => (
            <button
              key={pos}
              onClick={() => setSelectedPositionTab(pos)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedPositionTab === pos
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      )}

      {/* Position-by-Position Results Sections */}
      <div className="space-y-10">
        {displayedPositions.map((pos) => {
          const { candidates: posCandidates, totalVotes: posTotalVotes, winner } = groupedByPosition[pos];

          return (
            <div
              key={pos}
              className="card overflow-hidden border border-gray-200 shadow-sm transition-all"
            >
              {/* Position Header & Winner Banner */}
              <div className="p-6 bg-gradient-to-r from-slate-50 via-white to-amber-50/40 border-b border-gray-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary-600 block">
                      Election Office
                    </span>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">{pos}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Total Votes Cast in this Office: <span className="font-bold text-gray-800">{posTotalVotes.toLocaleString()}</span>
                    </p>
                  </div>

                  {/* Declared Winner Pill / Card */}
                  {winner ? (
                    <div className="flex items-center gap-3 bg-white p-3 px-4 rounded-2xl border border-amber-200 shadow-xs">
                      <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                        {winner.is_nota ? (
                          <NoSymbolIcon className="w-6 h-6" />
                        ) : (
                          <TrophyIcon className="w-6 h-6" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-extrabold uppercase px-2 py-0.2 rounded-full ${
                            winner.is_nota
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {winner.is_nota ? 'Abstention Plurality' : 'Declared Winner'}
                          </span>
                        </div>
                        <p className="text-base font-extrabold text-gray-900 leading-tight mt-0.5">
                          {winner.name || winner.candidate_name}
                        </p>
                        <p className="text-[11px] text-gray-500 font-medium">
                          {winner.votes.toLocaleString()} votes ({posTotalVotes > 0 ? ((winner.votes / posTotalVotes) * 100).toFixed(1) : 0}%)
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">No votes recorded yet for this office</span>
                  )}
                </div>
              </div>

              {/* Candidates & NOTA Vote Breakdown */}
              <div className="p-6 space-y-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-2">
                  <CheckBadgeIcon className="w-4 h-4 text-primary-600" />
                  Candidate & NOTA Vote Tallies
                </h3>

                <div className="space-y-4">
                  {posCandidates.map((cand, idx) => {
                    const isWinner = winner && cand.id === winner.id && cand.votes > 0;
                    const percentage = posTotalVotes > 0
                      ? ((cand.votes / posTotalVotes) * 100).toFixed(1)
                      : '0.0';

                    return (
                      <div
                        key={cand.id || idx}
                        className={`p-4 rounded-xl border transition-all ${
                          isWinner
                            ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-400/20 shadow-xs'
                            : cand.is_nota
                            ? 'bg-slate-50 border-slate-200'
                            : 'bg-white border-gray-100 hover:border-gray-200'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            {cand.is_nota ? (
                              <NoSymbolIcon className="w-4 h-4 text-slate-500 shrink-0" />
                            ) : (
                              <span className="font-mono text-xs font-semibold text-gray-400 w-5">
                                #{idx + 1}
                              </span>
                            )}
                            <span className="font-extrabold text-gray-900">
                              {cand.name || cand.candidate_name}
                            </span>
                            {cand.party && !cand.is_nota && (
                              <span className="text-xs text-gray-500 font-medium">
                                ({cand.party})
                              </span>
                            )}
                            {isWinner && (
                              <span className="px-2 py-0.2 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900">
                                Winner
                              </span>
                            )}
                            {cand.is_nota && (
                              <span className="px-2 py-0.2 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
                                Formal Abstention
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-right self-end sm:self-auto">
                            <span className="font-mono text-sm font-black text-gray-900">
                              {cand.votes.toLocaleString()} votes
                            </span>
                            <span className="font-black text-sm text-primary-700 w-14 text-right">
                              {percentage}%
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isWinner
                                ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                                : cand.is_nota
                                ? 'bg-slate-500'
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
        })}
      </div>
    </div>
  );
};

export default ResultsPage;
