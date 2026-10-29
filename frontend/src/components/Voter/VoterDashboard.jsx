import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { voterApi } from '../../api/voterApi';
import LoadingSpinner from '../common/LoadingSpinner';
import StatusBadge from '../common/StatusBadge';
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  InboxStackIcon,
  ArrowRightIcon,
  ChartBarIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

export const VoterDashboard = () => {
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchElectionsAndStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await voterApi.getActiveElections();
      const list = Array.isArray(data) ? data : (data.elections || []);

      // For each election, check voting status if not provided directly
      const electionsWithStatus = await Promise.all(
        list.map(async (elec) => {
          if (elec.has_voted !== undefined) return elec;
          try {
            const statusRes = await voterApi.getVoterStatus(elec.id);
            return { ...elec, has_voted: statusRes.has_voted ?? false };
          } catch (e) {
            return { ...elec, has_voted: false };
          }
        })
      );

      setElections(electionsWithStatus);
    } catch (err) {
      console.error('Failed to load active elections:', err);
      setError('Unable to load active elections. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchElectionsAndStatus();
  }, []);

  const formatDateString = (dateStr) => {
    if (!dateStr) return 'TBD';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
      {/* Header section */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          Voter Portal
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Review active campus elections, cast your anonymous cryptographic ballot, and track certified results.
        </p>
      </div>

      {/* Security notice */}
      <div className="mb-8 p-4 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
          <CheckCircleIcon className="w-5 h-5" />
        </div>
        <div className="text-xs text-indigo-900 leading-relaxed">
          <span className="font-semibold">Voter Confidentiality Assured:</span> Your voter identity is decoupled from your vote using a one-way blind token hash (SHA-256 HMAC). Even system administrators cannot view which candidate you voted for.
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="card py-16">
          <LoadingSpinner text="Retrieving available elections..." />
        </div>
      ) : error ? (
        <div className="card p-8 text-center bg-rose-50/50 border-rose-200">
          <ExclamationCircleIcon className="w-10 h-10 text-rose-500 mx-auto mb-2" />
          <h3 className="text-base font-semibold text-rose-900">{error}</h3>
          <button
            onClick={fetchElectionsAndStatus}
            className="mt-4 btn btn-primary btn-sm"
          >
            Retry Loading
          </button>
        </div>
      ) : elections.length === 0 ? (
        <div className="card p-12 text-center border-dashed border-2 border-gray-200">
          <InboxStackIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900">No Active Elections Right Now</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
            There are currently no polls open for voting. Check back during official campus election windows.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {elections.map((election) => {
            const hasVoted = Boolean(election.has_voted);
            const isClosed = !election.is_active;
            const resultsReady = Boolean(election.results_published);

            return (
              <div
                key={election.id}
                className="card border border-gray-200 hover:border-primary-300 transition-all duration-200 flex flex-col justify-between overflow-hidden group shadow-sm hover:shadow-md"
              >
                <div className="p-6">
                  {/* Status header */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-mono text-gray-400 font-medium">
                      #ELEC-{election.id}
                    </span>
                    <div className="flex items-center gap-2">
                      {hasVoted ? (
                        <StatusBadge status="voted" label="Ballot Cast" variant="success" />
                      ) : (
                        <StatusBadge status="open" label="Not Voted" variant="warning" />
                      )}
                      {resultsReady && (
                        <StatusBadge status="published" label="Results Out" variant="primary" />
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h2 className="text-xl font-bold text-gray-900 group-hover:text-primary-600 transition-colors">
                    {election.title}
                  </h2>
                  <p className="text-sm text-gray-600 mt-2 line-clamp-3 leading-relaxed">
                    {election.description || 'No election summary provided.'}
                  </p>

                  {/* Date Metadata */}
                  <div className="mt-5 space-y-2 pt-4 border-t border-gray-100 text-xs text-gray-500">
                    <div className="flex items-center gap-2">
                      <ClockIcon className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>Starts: {formatDateString(election.start_time)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDaysIcon className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>Ends: {formatDateString(election.end_time)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Action buttons */}
                <div className="px-6 py-4 bg-gray-50/75 border-t border-gray-100 flex items-center justify-between gap-3">
                  {resultsReady ? (
                    <Link
                      to={`/voter/results/${election.id}`}
                      className="btn btn-secondary btn-sm gap-1.5 w-full justify-center"
                    >
                      <ChartBarIcon className="w-4 h-4 text-primary-600" />
                      <span>View Official Results</span>
                    </Link>
                  ) : hasVoted ? (
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                        <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
                        Ballot recorded anonymously
                      </span>
                      <Link
                        to={`/voter/results/${election.id}`}
                        className="text-xs font-semibold text-primary-600 hover:text-primary-800"
                      >
                        Results Status →
                      </Link>
                    </div>
                  ) : isClosed ? (
                    <div className="text-xs text-gray-500 italic w-full text-center py-1">
                      Voting has concluded. Awaiting verification of results.
                    </div>
                  ) : (
                    <Link
                      to={`/voter/vote/${election.id}`}
                      className="btn btn-primary btn-sm gap-1.5 w-full justify-center shadow-xs"
                    >
                      <span>Cast Secret Ballot</span>
                      <ArrowRightIcon className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VoterDashboard;
